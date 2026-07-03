-- Fraccionamiento de unidades logísticas (UL padre → UL hija)
-- parent_logistic_unit_id + movement_type logistic_unit_split + RPC atómica

alter type movement_type add value if not exists 'logistic_unit_split';

alter table logistic_units
  add column if not exists parent_logistic_unit_id uuid
    references logistic_units (id) on delete set null;

create index if not exists idx_logistic_units_parent
  on logistic_units (parent_logistic_unit_id);

-- ---------------------------------------------------------------------------
-- split_logistic_unit: fracciona stock de una UL ubicada en rack hacia una
-- UL hija en piso ingreso (reubicar) o piso retiro (preparar retiro).
-- p_lines: [{ "content_id": "uuid", "quantity": 50.5 }, ...]
-- p_destination: 'relocate' | 'outbound'
-- ---------------------------------------------------------------------------
create or replace function split_logistic_unit(
  p_parent_unit_id uuid,
  p_user_id uuid,
  p_destination text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent logistic_units%rowtype;
  v_pos positions%rowtype;
  v_floor_inbound uuid;
  v_floor_outbound uuid;
  v_child_id uuid;
  v_child_code text;
  v_child_status logistic_unit_status;
  v_floor_dest uuid;
  v_child_stock_status stock_status;
  v_origin_code text;
  v_line jsonb;
  v_content logistic_unit_contents%rowtype;
  v_split_qty numeric;
  v_remaining numeric;
  v_total_remaining numeric;
  v_product_count int;
  v_has_positive boolean := false;
  v_move_notes text;
  v_empty_note constant text := ' Vaciada por fraccionamiento total.';
begin
  if not is_staff() then
    raise exception 'No tenés permisos para fraccionar unidades logísticas.';
  end if;

  if p_destination not in ('relocate', 'outbound') then
    raise exception 'Destino inválido.';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Debés indicar al menos una línea a fraccionar.';
  end if;

  select * into v_parent
  from logistic_units
  where id = p_parent_unit_id
  for update;

  if not found then
    raise exception 'Unidad logística origen no encontrada.';
  end if;

  if v_parent.status <> 'located' then
    raise exception 'Solo se pueden fraccionar unidades en estado ubicada.';
  end if;

  if v_parent.current_position_id is null then
    raise exception 'La unidad no tiene posición actual registrada.';
  end if;

  select * into v_pos
  from positions
  where id = v_parent.current_position_id;

  if not found or v_pos.type <> 'rack' then
    raise exception 'Solo se pueden fraccionar unidades ubicadas en posiciones de rack.';
  end if;

  select id into v_floor_inbound from positions where code = 'FLOOR-INBOUND-01';
  select id into v_floor_outbound from positions where code = 'FLOOR-OUTBOUND-01';

  if v_floor_inbound is null or v_floor_outbound is null then
    raise exception 'Faltan posiciones operativas FLOOR-INBOUND-01 o FLOOR-OUTBOUND-01.';
  end if;

  if p_destination = 'relocate' then
    v_floor_dest := v_floor_inbound;
    v_child_status := 'ready_to_locate';
    v_child_stock_status := 'floor_inbound';
  else
    v_floor_dest := v_floor_outbound;
    v_child_status := 'in_floor_outbound';
    v_child_stock_status := 'floor_outbound';
  end if;

  v_origin_code := v_parent.code;

  -- Validar todas las líneas antes de modificar stock
  for v_line in select value from jsonb_array_elements(p_lines) as t(value)
  loop
    v_split_qty := (v_line->>'quantity')::numeric;

    if v_split_qty is null or v_split_qty <= 0 then
      continue;
    end if;

    select * into v_content
    from logistic_unit_contents
    where id = (v_line->>'content_id')::uuid
      and logistic_unit_id = p_parent_unit_id
    for update;

    if not found then
      raise exception 'Línea de contenido no encontrada en la unidad origen.';
    end if;

    if v_split_qty > v_content.quantity then
      raise exception 'La cantidad a fraccionar supera la disponible en la línea seleccionada.';
    end if;

    v_has_positive := true;
  end loop;

  if not v_has_positive then
    raise exception 'Debés indicar al menos una línea con cantidad mayor a cero.';
  end if;

  v_child_code := next_logistic_unit_code();

  insert into logistic_units (
    code,
    received_unit_id,
    inbound_order_id,
    client_id,
    type,
    status,
    current_position_id,
    entry_date,
    notes,
    is_mixed,
    is_available,
    parent_logistic_unit_id
  )
  values (
    v_child_code,
    v_parent.received_unit_id,
    v_parent.inbound_order_id,
    v_parent.client_id,
    v_parent.type,
    v_child_status,
    v_floor_dest,
    now(),
    format('Fraccionada desde %s', v_origin_code),
    false,
    true,
    p_parent_unit_id
  )
  returning id into v_child_id;

  v_move_notes := format('Fraccionamiento: %s → %s', v_origin_code, v_child_code);

  -- Aplicar fraccionamiento
  for v_line in select value from jsonb_array_elements(p_lines) as t(value)
  loop
    v_split_qty := (v_line->>'quantity')::numeric;

    if v_split_qty is null or v_split_qty <= 0 then
      continue;
    end if;

    select * into v_content
    from logistic_unit_contents
    where id = (v_line->>'content_id')::uuid
      and logistic_unit_id = p_parent_unit_id
    for update;

    if not found then
      raise exception 'Línea de contenido no encontrada en la unidad origen.';
    end if;

    if v_split_qty > v_content.quantity then
      raise exception 'La cantidad a fraccionar supera la disponible en la línea seleccionada.';
    end if;

    v_remaining := v_content.quantity - v_split_qty;

    if v_remaining = 0 then
      delete from logistic_unit_contents where id = v_content.id;
    else
      update logistic_unit_contents
      set quantity = v_remaining
      where id = v_content.id;
    end if;

    insert into logistic_unit_contents (
      logistic_unit_id,
      product_id,
      quantity,
      unit_of_measure,
      lot,
      status,
      entry_date
    )
    values (
      v_child_id,
      v_content.product_id,
      v_split_qty,
      v_content.unit_of_measure,
      v_content.lot,
      v_child_stock_status,
      now()
    );

    insert into movements (
      movement_type,
      logistic_unit_id,
      product_id,
      quantity,
      client_id,
      inbound_order_id,
      user_id,
      from_position_id,
      to_position_id,
      notes
    )
    values (
      'logistic_unit_split',
      v_child_id,
      v_content.product_id,
      v_split_qty,
      v_parent.client_id,
      v_parent.inbound_order_id,
      p_user_id,
      v_parent.current_position_id,
      v_floor_dest,
      v_move_notes
    );
  end loop;

  select coalesce(sum(quantity), 0)
  into v_total_remaining
  from logistic_unit_contents
  where logistic_unit_id = p_parent_unit_id;

  if v_total_remaining = 0 then
    update logistic_units
    set
      status = 'exited',
      is_available = false,
      notes = trim(both from coalesce(notes, '') || v_empty_note)
    where id = p_parent_unit_id;
  end if;

  select count(distinct product_id)
  into v_product_count
  from logistic_unit_contents
  where logistic_unit_id = v_child_id;

  update logistic_units
  set is_mixed = (v_product_count > 1)
  where id = v_child_id;

  return jsonb_build_object(
    'child_id', v_child_id,
    'child_code', v_child_code,
    'destination', p_destination,
    'parent_exited', (v_total_remaining = 0)
  );
end;
$$;

grant execute on function split_logistic_unit(uuid, uuid, text, jsonb) to authenticated;
