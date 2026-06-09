-- =====================================================================
-- WMS Depósito — Migración 0009: snapshot diario de ocupación por posición
-- =====================================================================
-- Base para facturación de ESTADÍA (storage): se cobra por posición usada
-- por cliente por día, no por pallet ni por unidad.
--
-- Reglas de negocio (documentadas en docs/ESTADO_DEL_SISTEMA.md):
-- - Una fila = 1 cliente + 1 posición + 1 fecha (posición-día).
-- - Cuenta como usada si hay ≥1 unidad logística del cliente en la posición.
-- - Múltiples UL del mismo cliente en la misma posición = 1 posición usada.
-- - Ocupación parcial = igual 1 posición usada.
-- - Posición asignada sin mercadería NO cuenta.
-- - Mezcla de clientes (override): una fila por cliente; idealmente evitar mezcla.
--
-- El módulo Cierre del día generará este snapshot (corte diario auditable).
-- La facturación mensual de estadía (suma posición-día × tarifa) queda fuera del MVP.

create table if not exists daily_position_occupancy (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  client_id uuid not null references clients (id) on delete restrict,
  position_id uuid not null references positions (id) on delete restrict,
  position_code text not null,
  occupied_units_count integer not null default 0,
  position_status position_status not null,
  created_at timestamptz not null default now(),
  constraint chk_dpo_units_nonneg check (occupied_units_count > 0),
  constraint uq_dpo_date_client_position unique (date, client_id, position_id)
);

create index if not exists idx_dpo_date on daily_position_occupancy (date);
create index if not exists idx_dpo_client_date on daily_position_occupancy (client_id, date);
create index if not exists idx_dpo_position_date on daily_position_occupancy (position_id, date);

-- RLS: lectura todos; insert/update solo staff (generación del cierre diario)
alter table daily_position_occupancy enable row level security;

create policy daily_position_occupancy_select on daily_position_occupancy
  for select to authenticated using (true);
create policy daily_position_occupancy_insert on daily_position_occupancy
  for insert to authenticated with check (is_staff());
create policy daily_position_occupancy_update on daily_position_occupancy
  for update to authenticated using (is_staff()) with check (is_staff());
create policy daily_position_occupancy_delete on daily_position_occupancy
  for delete to authenticated using (is_admin());
