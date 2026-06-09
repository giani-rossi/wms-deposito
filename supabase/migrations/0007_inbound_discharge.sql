-- =====================================================================
-- WMS Depósito — Migración 0007: resumen físico de descarga (snapshot 1:1)
-- =====================================================================
-- Captura, al momento de registrar la descarga del camión, cuántas
-- unidades físicas se bajaron por tipo. Es la base para facturar la
-- descarga por pallet / caja / bulto / unidad suelta, además del camión.
-- No reemplaza a received_units (esa sigue siendo la verdad de inventario).

create table if not exists inbound_order_discharge (
  id uuid primary key default gen_random_uuid(),
  inbound_order_id uuid not null unique
    references inbound_orders (id) on delete cascade,
  pallets_count integer not null default 0,
  boxes_count integer not null default 0,
  packages_count integer not null default 0,
  loose_items_count integer not null default 0,
  total_units_count integer,
  requires_desconsolidation boolean not null default false,
  requires_classification boolean not null default false,
  requires_assembly boolean not null default false,
  notes text,
  discharged_by uuid references profiles (id) on delete set null,
  discharged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_discharge_counts_nonneg check (
    pallets_count >= 0
    and boxes_count >= 0
    and packages_count >= 0
    and loose_items_count >= 0
    and (total_units_count is null or total_units_count >= 0)
  )
);

create index if not exists idx_inbound_discharge_order
  on inbound_order_discharge (inbound_order_id);

create trigger trg_inbound_discharge_updated_at
  before update on inbound_order_discharge
  for each row execute function set_updated_at();

-- RLS: lectura/crear/editar cualquier autenticado; borrar solo admin
alter table inbound_order_discharge enable row level security;

create policy inbound_order_discharge_select on inbound_order_discharge
  for select to authenticated using (true);
create policy inbound_order_discharge_insert on inbound_order_discharge
  for insert to authenticated with check (true);
create policy inbound_order_discharge_update on inbound_order_discharge
  for update to authenticated using (true) with check (true);
create policy inbound_order_discharge_delete on inbound_order_discharge
  for delete to authenticated using (is_admin());
