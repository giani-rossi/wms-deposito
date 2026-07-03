-- Órdenes de retiro MVP: vínculo orden ↔ unidad logística completa

-- ---------------------------------------------------------------------
-- Secuencia y código de documento (OUT-2026-0001)
-- ---------------------------------------------------------------------
create sequence if not exists outbound_order_code_seq start 1;

create or replace function next_outbound_order_code()
returns text
language sql
as $$
  select
    'OUT-'
    || to_char(current_date, 'YYYY')
    || '-'
    || lpad(nextval('outbound_order_code_seq')::text, 4, '0');
$$;

-- ---------------------------------------------------------------------
-- Campo opcional en outbound_orders
-- ---------------------------------------------------------------------
alter table outbound_orders
  add column if not exists requested_date date;

-- ---------------------------------------------------------------------
-- outbound_order_logistic_units
-- ---------------------------------------------------------------------
create table outbound_order_logistic_units (
  id uuid primary key default gen_random_uuid(),
  outbound_order_id uuid not null references outbound_orders (id) on delete cascade,
  logistic_unit_id uuid not null references logistic_units (id) on delete restrict,
  line_status text not null default 'pending'
    check (line_status in ('pending', 'prepared', 'loaded', 'cancelled')),
  prepared_at timestamptz,
  loaded_at timestamptz,
  preparation_movement_id uuid references movements (id) on delete set null,
  load_movement_id uuid references movements (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_oolu_order on outbound_order_logistic_units (outbound_order_id);
create index idx_oolu_unit on outbound_order_logistic_units (logistic_unit_id);
create index idx_oolu_status on outbound_order_logistic_units (line_status);

create unique index idx_oolu_active_unit
  on outbound_order_logistic_units (logistic_unit_id)
  where line_status in ('pending', 'prepared');

create trigger trg_oolu_updated_at
  before update on outbound_order_logistic_units
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table outbound_order_logistic_units enable row level security;

create policy outbound_order_logistic_units_select on outbound_order_logistic_units
  for select to authenticated using (true);
create policy outbound_order_logistic_units_insert on outbound_order_logistic_units
  for insert to authenticated with check (true);
create policy outbound_order_logistic_units_update on outbound_order_logistic_units
  for update to authenticated using (true) with check (true);
create policy outbound_order_logistic_units_delete on outbound_order_logistic_units
  for delete to authenticated using (is_admin());

-- ---------------------------------------------------------------------
-- Preparar retiro: mueve ULs pending desde rack a piso retiro
-- ---------------------------------------------------------------------
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
      raise exception 'La unidad % debe estar ubicada en rack para preparar retiro.', v_unit.code;
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

    if not found or v_from_pos.type <> 'rack' then
      raise exception 'La unidad % debe estar en un rack.', v_unit.code;
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

-- ---------------------------------------------------------------------
-- Confirmar salida: egresa ULs y genera truck_loading
-- ---------------------------------------------------------------------
create or replace function confirm_outbound_load(
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
  v_floor_outbound uuid;
  v_floor_pos positions%rowtype;
  v_move_id uuid;
  v_service_id uuid;
  v_billing_unit text;
  v_now timestamptz := now();
  v_loaded int := 0;
begin
  if not is_staff() then
    raise exception 'No tenés permisos para confirmar salidas.';
  end if;

  select * into v_order
  from outbound_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Orden de retiro no encontrada.';
  end if;

  if v_order.status = 'closed' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  if exists (
    select 1
    from outbound_order_logistic_units
    where outbound_order_id = p_order_id
      and line_status = 'loaded'
  ) then
    raise exception 'La salida ya fue confirmada.';
  end if;

  if not exists (
    select 1
    from outbound_order_logistic_units
    where outbound_order_id = p_order_id
      and line_status in ('pending', 'prepared')
  ) then
    raise exception 'La orden no tiene unidades logísticas activas.';
  end if;

  if exists (
    select 1
    from outbound_order_logistic_units
    where outbound_order_id = p_order_id
      and line_status <> 'prepared'
      and line_status <> 'cancelled'
  ) then
    raise exception 'Todas las unidades deben estar preparadas antes de confirmar la salida.';
  end if;

  select id into v_floor_outbound
  from positions
  where code = 'FLOOR-OUTBOUND-01';

  if v_floor_outbound is null then
    raise exception 'Falta la posición operativa FLOOR-OUTBOUND-01.';
  end if;

  select * into v_floor_pos
  from positions
  where id = v_floor_outbound;

  for v_line in
    select *
    from outbound_order_logistic_units
    where outbound_order_id = p_order_id
      and line_status = 'prepared'
    order by created_at
    for update
  loop
    select * into v_unit
    from logistic_units
    where id = v_line.logistic_unit_id
    for update;

    if not found then
      raise exception 'Unidad logística no encontrada.';
    end if;

    if v_unit.status = 'exited' then
      raise exception 'La unidad % ya fue egresada.', v_unit.code;
    end if;

    if v_unit.status <> 'in_floor_outbound'
      or v_unit.current_position_id is distinct from v_floor_outbound then
      raise exception 'La unidad % debe estar en piso retiro (FLOOR-OUTBOUND-01).', v_unit.code;
    end if;

    v_billing_unit := case v_unit.type
      when 'pallet' then 'pallet'
      when 'box' then 'caja'
      when 'package' then 'bulto'
      else 'unidad'
    end;

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
      'outbound_loaded',
      p_user_id,
      v_unit.client_id,
      v_unit.id,
      v_unit.inbound_order_id,
      p_order_id,
      1,
      v_floor_outbound,
      null,
      format('Salida confirmada %s', v_unit.code)
    )
    returning id into v_move_id;

    insert into billable_services (
      client_id,
      service_type,
      quantity,
      unit,
      outbound_order_id,
      movement_id,
      status,
      notes
    ) values (
      v_order.client_id,
      'truck_loading',
      1,
      v_billing_unit,
      p_order_id,
      v_move_id,
      'pending_billing',
      format('Carga de camión (%s)', v_unit.code)
    )
    returning id into v_service_id;

    update movements
    set billable_service_id = v_service_id
    where id = v_move_id;

    update logistic_units
    set
      status = 'exited',
      is_available = false,
      current_position_id = null
    where id = v_unit.id;

    update logistic_unit_contents
    set status = 'exited'
    where logistic_unit_id = v_unit.id
      and status <> 'exited';

    update outbound_order_logistic_units
    set
      line_status = 'loaded',
      loaded_at = v_now,
      load_movement_id = v_move_id
    where id = v_line.id;

    v_loaded := v_loaded + 1;
  end loop;

  if v_loaded = 0 then
    raise exception 'No hay unidades preparadas para confirmar la salida.';
  end if;

  update outbound_orders
  set status = 'closed'
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'loaded', v_loaded);
end;
$$;

grant execute on function prepare_outbound_order(uuid, uuid) to authenticated;
grant execute on function confirm_outbound_load(uuid, uuid) to authenticated;
