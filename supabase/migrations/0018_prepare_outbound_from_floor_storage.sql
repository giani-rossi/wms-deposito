-- Permitir preparar retiro desde piso guardado (floor_temporary) además de rack.

create or replace function prepare_outbound_order(
  p_order_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order outbound_orders%rowtype;
  v_line outbound_order_logistic_units%rowtype;
  v_unit logistic_units%rowtype;
  v_from_pos positions%rowtype;
  v_floor_outbound uuid;
  v_move_id uuid;
  v_now timestamptz := now();
  v_pending int := 0;
  v_prepared int := 0;
begin
  if not is_staff() then
    raise exception 'No tenés permisos para preparar órdenes de retiro.';
  end if;

  select * into v_order
  from outbound_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Orden de retiro no encontrada.';
  end if;

  if v_order.status in ('closed', 'loaded') then
    raise exception 'La orden está cerrada o ya fue cargada.';
  end if;

  select id into v_floor_outbound
  from positions
  where code = 'FLOOR-OUTBOUND-01';

  if v_floor_outbound is null then
    raise exception 'Falta la posición operativa FLOOR-OUTBOUND-01.';
  end if;

  for v_line in
    select *
    from outbound_order_logistic_units
    where outbound_order_id = p_order_id
      and line_status = 'pending'
    order by created_at
    for update
  loop
    select * into v_unit
    from logistic_units
    where id = v_line.logistic_unit_id
    for update;

    if not found then
      raise exception 'Unidad logística % no encontrada.', v_line.logistic_unit_id;
    end if;

    if v_unit.status <> 'located' then
      raise exception
        'La unidad % debe estar ubicada en almacenamiento final para preparar retiro.',
        v_unit.code;
    end if;

    if not coalesce(v_unit.is_available, false) then
      raise exception 'La unidad % no está disponible.', v_unit.code;
    end if;

    if v_unit.current_position_id is null then
      raise exception 'La unidad % no tiene posición actual.', v_unit.code;
    end if;

    select * into v_from_pos
    from positions
    where id = v_unit.current_position_id;

    if not found or v_from_pos.type not in ('rack', 'floor_temporary') then
      raise exception
        'La unidad % debe estar ubicada en rack o piso guardado.',
        v_unit.code;
    end if;

    if not exists (
      select 1
      from logistic_unit_contents luc
      where luc.logistic_unit_id = v_unit.id
        and luc.status <> 'exited'
        and luc.quantity > 0
    ) then
      raise exception 'La unidad % no tiene contenido disponible.', v_unit.code;
    end if;

    insert into movements (
      movement_type,
      user_id,
      client_id,
      logistic_unit_id,
      inbound_order_id,
      outbound_order_id,
      quantity,
      from_position_id,
      to_position_id,
      notes
    ) values (
      'outbound_preparation',
      p_user_id,
      v_unit.client_id,
      v_unit.id,
      v_unit.inbound_order_id,
      p_order_id,
      1,
      v_from_pos.id,
      v_floor_outbound,
      format('Preparación de retiro %s → piso retiro', v_unit.code)
    )
    returning id into v_move_id;

    update logistic_units
    set
      status = 'in_floor_outbound',
      current_position_id = v_floor_outbound
    where id = v_unit.id;

    update logistic_unit_contents
    set status = 'floor_outbound'
    where logistic_unit_id = v_unit.id
      and status <> 'exited'
      and quantity > 0;

    update outbound_order_logistic_units
    set
      line_status = 'prepared',
      prepared_at = v_now,
      preparation_movement_id = v_move_id
    where id = v_line.id;
  end loop;

  select
    count(*) filter (where line_status = 'pending'),
    count(*) filter (where line_status = 'prepared')
  into v_pending, v_prepared
  from outbound_order_logistic_units
  where outbound_order_id = p_order_id
    and line_status in ('pending', 'prepared');

  if v_pending > 0 then
    update outbound_orders
    set status = 'in_preparation'
    where id = p_order_id;
  elsif v_prepared > 0 then
    update outbound_orders
    set status = 'ready_to_load'
    where id = p_order_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'pending', v_pending,
    'prepared', v_prepared
  );
end;
$$;
