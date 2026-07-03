-- Fraccionamiento UL: destino rack directo + override/notas (reutiliza reglas de movimiento interno)

drop function if exists split_logistic_unit(uuid, uuid, text, jsonb);

create or replace function split_logistic_unit(
  p_parent_unit_id uuid,
  p_user_id uuid,
  p_destination text,
  p_lines jsonb,
  p_target_position_id uuid default null,
  p_override boolean default false,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent logistic_units%rowtype;
  v_pos positions%rowtype;
  v_target_pos positions%rowtype;
  v_floor_inbound uuid;
  v_floor_outbound uuid;
  v_child_id uuid;
  v_child_code text;
  v_child_status logistic_unit_status;
  v_child_position_id uuid;
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
  v_is_blocked boolean;
  v_assigned_other boolean;
  v_occupants_other boolean;
  v_requires_override boolean;
  v_notes_trim text;
begin
  if not is_staff() then
    raise exception 'No tenés permisos para fraccionar unidades logísticas.';
  end if;

  if p_destination not in ('relocate', 'outbound', 'rack') then
    raise exception 'Destino inválido.';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Debés indicar al menos una línea a fraccionar.';
  end if;

  v_notes_trim := nullif(trim(coalesce(p_notes, '')), '');

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

  if p_destination = 'rack' then
    if p_target_position_id is null then
      raise exception 'Debés indicar la posición rack destino.';
    end if;

    if p_target_position_id = v_parent.current_position_id then
      raise exception 'La posición destino es la misma que la actual.';
    end if;

    select * into v_target_pos
    from positions
    where id = p_target_position_id;

    if not found or v_target_pos.type <> 'rack' then
      raise exception 'El destino debe ser una posición de rack.';
    end if;

    v_is_blocked := v_target_pos.status in ('blocked', 'incident');
    v_assigned_other :=
      v_target_pos.assigned_client_id is not null
      and v_target_pos.assigned_client_id <> v_parent.client_id;

    select exists (
      select 1
      from logistic_units lu
      where lu.current_position_id = p_target_position_id
        and lu.status = 'located'
        and lu.client_id <> v_parent.client_id
    ) into v_occupants_other;

    v_requires_override := v_is_blocked or v_assigned_other or v_occupants_other;

    if v_requires_override then
      if not coalesce(p_override, false) then
        if v_is_blocked then
          raise exception 'La posición destino está bloqueada o en revisión. Requiere confirmación de staff (override).';
        elsif v_assigned_other then
          raise exception 'La posición destino está asignada a otro cliente. Requiere confirmación de staff (override).';
        else
          raise exception 'La posición destino contiene mercadería de otro cliente. Requiere confirmación de staff (override).';
        end if;
      end if;

      if v_notes_trim is null then
        raise exception 'Debés ingresar una nota obligatoria para confirmar este fraccionamiento.';
      end if;
    end if;

    v_child_position_id := p_target_position_id;
    v_child_status := 'located';
    v_child_stock_status := 'available';
  else
    select id into v_floor_inbound from positions where code = 'FLOOR-INBOUND-01';
    select id into v_floor_outbound from positions where code = 'FLOOR-OUTBOUND-01';

    if v_floor_inbound is null or v_floor_outbound is null then
      raise exception 'Faltan posiciones operativas FLOOR-INBOUND-01 o FLOOR-OUTBOUND-01.';
    end if;

    if p_destination = 'relocate' then
      v_child_position_id := v_floor_inbound;
      v_child_status := 'ready_to_locate';
      v_child_stock_status := 'floor_inbound';
    else
      v_child_position_id := v_floor_outbound;
      v_child_status := 'in_floor_outbound';
      v_child_stock_status := 'floor_outbound';
    end if;
  end if;

  v_origin_code := v_parent.code;

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
    v_child_position_id,
    now(),
    format('Fraccionada desde %s', v_origin_code),
    false,
    true,
    p_parent_unit_id
  )
  returning id into v_child_id;

  v_move_notes := format('Fraccionamiento: %s → %s', v_origin_code, v_child_code);
  if v_notes_trim is not null then
    v_move_notes := v_notes_trim || ' · ' || v_move_notes;
  end if;

  if p_destination = 'rack' and coalesce(p_override, false) then
    if v_is_blocked then
      v_move_notes := v_move_notes || ' · Override: destino bloqueado/en revisión';
    end if;
    if v_assigned_other then
      v_move_notes := v_move_notes || ' · Override: posición asignada a otro cliente';
    end if;
    if v_occupants_other then
      v_move_notes := v_move_notes || ' · Override: mercadería de otro cliente en destino';
    end if;
  end if;

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
      v_child_position_id,
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
    'parent_exited', (v_total_remaining = 0),
    'target_position_id', v_child_position_id,
    'target_position_code', case
      when p_destination = 'rack' then v_target_pos.code
      when p_destination = 'relocate' then 'FLOOR-INBOUND-01'
      else 'FLOOR-OUTBOUND-01'
    end
  );
end;
$$;

grant execute on function split_logistic_unit(uuid, uuid, text, jsonb, uuid, boolean, text) to authenticated;
