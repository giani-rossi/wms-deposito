-- =====================================================================
-- WMS Depósito — Migración 0003: Row Level Security + políticas por rol
-- =====================================================================
-- Estrategia MVP (simple pero funcional):
--   * Todo usuario autenticado puede LEER (SELECT) los datos operativos.
--   * admin: acceso total.
--   * supervisor: gestión operativa + facturación, no gestiona usuarios.
--   * operator: crea/edita registros operativos (movimientos, unidades,
--     órdenes), no administra clientes/posiciones/productos ni borra.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers de rol (security definer para leer profiles sin recursión)
-- ---------------------------------------------------------------------
create or replace function auth_role()
returns user_role
language sql
stable
security definer set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function is_admin()
returns boolean
language sql stable
as $$ select auth_role() = 'admin'; $$;

create or replace function is_staff()
returns boolean
language sql stable
as $$ select auth_role() in ('admin', 'supervisor'); $$;

-- ---------------------------------------------------------------------
-- Habilitar RLS en todas las tablas
-- ---------------------------------------------------------------------
alter table profiles               enable row level security;
alter table clients                enable row level security;
alter table positions              enable row level security;
alter table products               enable row level security;
alter table inbound_orders         enable row level security;
alter table received_units         enable row level security;
alter table logistic_units         enable row level security;
alter table logistic_unit_contents enable row level security;
alter table outbound_orders        enable row level security;
alter table outbound_order_items   enable row level security;
alter table picking_assignments    enable row level security;
alter table billable_services      enable row level security;
alter table movements              enable row level security;
alter table uploaded_files         enable row level security;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create policy profiles_select on profiles
  for select to authenticated using (true);

create policy profiles_update_self on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_admin_all on profiles
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ---------------------------------------------------------------------
-- clients / positions / products  -> lectura: todos; escritura: staff
-- ---------------------------------------------------------------------
create policy clients_select on clients
  for select to authenticated using (true);
create policy clients_write on clients
  for all to authenticated using (is_staff()) with check (is_staff());

create policy positions_select on positions
  for select to authenticated using (true);
create policy positions_write on positions
  for all to authenticated using (is_staff()) with check (is_staff());

create policy products_select on products
  for select to authenticated using (true);
create policy products_write on products
  for all to authenticated using (is_staff()) with check (is_staff());

-- ---------------------------------------------------------------------
-- Tablas operativas: lectura todos; insert/update cualquier autenticado;
-- delete solo admin.  (operarios necesitan operar el día a día)
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  op_tables text[] := array[
    'inbound_orders',
    'received_units',
    'logistic_units',
    'logistic_unit_contents',
    'outbound_orders',
    'outbound_order_items',
    'picking_assignments',
    'movements',
    'uploaded_files'
  ];
begin
  foreach t in array op_tables loop
    execute format(
      'create policy %1$s_select on %1$s for select to authenticated using (true);',
      t
    );
    execute format(
      'create policy %1$s_insert on %1$s for insert to authenticated with check (true);',
      t
    );
    execute format(
      'create policy %1$s_update on %1$s for update to authenticated using (true) with check (true);',
      t
    );
    execute format(
      'create policy %1$s_delete on %1$s for delete to authenticated using (is_admin());',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- billable_services: lectura todos; crear cualquier autenticado
-- (se generan desde operaciones); cambiar estado/borrar solo staff
-- ---------------------------------------------------------------------
create policy billable_services_select on billable_services
  for select to authenticated using (true);
create policy billable_services_insert on billable_services
  for insert to authenticated with check (true);
create policy billable_services_update on billable_services
  for update to authenticated using (is_staff()) with check (is_staff());
create policy billable_services_delete on billable_services
  for delete to authenticated using (is_admin());
