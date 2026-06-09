-- =====================================================================
-- WMS Depósito — Migración 0008: contenido/stock de unidades recibidas
-- =====================================================================
-- Permite cargar QUÉ productos (SKU) ingresaron dentro de cada unidad física
-- recibida (pallet/caja/bulto/suelto), antes de ubicarla. Al ubicar, este
-- contenido se copia a logistic_unit_contents (stock real consultable).
-- Pallet/caja/bulto son unidades físicas/logísticas; el stock para retiro es
-- el producto/SKU dentro de ellas.

-- 1) Catálogo de productos: agregar unidad de medida (unidad/caja/pallet/kg...)
alter table products add column if not exists unit_of_measure text;

-- 2) Contenido declarado a nivel unidad recibida
create table if not exists received_unit_contents (
  id uuid primary key default gen_random_uuid(),
  received_unit_id uuid not null
    references received_units (id) on delete cascade,
  product_id uuid not null references products (id) on delete restrict,
  quantity numeric not null default 0,
  unit_of_measure text,
  lot text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_ruc_qty_nonneg check (quantity >= 0)
);

create index if not exists idx_ruc_unit on received_unit_contents (received_unit_id);
create index if not exists idx_ruc_product on received_unit_contents (product_id);

create trigger trg_ruc_updated_at
  before update on received_unit_contents
  for each row execute function set_updated_at();

-- RLS: lectura/crear cualquier autenticado; editar/borrar solo staff
alter table received_unit_contents enable row level security;

create policy received_unit_contents_select on received_unit_contents
  for select to authenticated using (true);
create policy received_unit_contents_insert on received_unit_contents
  for insert to authenticated with check (true);
create policy received_unit_contents_update on received_unit_contents
  for update to authenticated using (is_staff()) with check (is_staff());
create policy received_unit_contents_delete on received_unit_contents
  for delete to authenticated using (is_staff());
