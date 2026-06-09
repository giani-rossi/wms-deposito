-- =====================================================================
-- WMS Depósito — Migración 0005
--   * clients.is_active (baja lógica / desactivación de clientes)
--   * client_position_assignments (asignación de posiciones a clientes,
--     con historial vía released_at)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) clients.is_active
-- ---------------------------------------------------------------------
alter table clients
  add column if not exists is_active boolean not null default true;

-- ---------------------------------------------------------------------
-- 2) client_position_assignments
--    Una posición puede estar asignada a un cliente a la vez (asignación
--    activa = released_at is null). El histórico se conserva.
-- ---------------------------------------------------------------------
create table if not exists client_position_assignments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  position_id uuid not null references positions (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  notes text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cpa_client on client_position_assignments (client_id);
create index if not exists idx_cpa_position on client_position_assignments (position_id);

-- Solo una asignación ACTIVA por posición.
create unique index if not exists uq_cpa_active_position
  on client_position_assignments (position_id)
  where released_at is null;

drop trigger if exists trg_cpa_updated_at on client_position_assignments;
create trigger trg_cpa_updated_at
  before update on client_position_assignments
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------
alter table client_position_assignments enable row level security;

drop policy if exists cpa_select on client_position_assignments;
create policy cpa_select on client_position_assignments
  for select to authenticated using (true);

drop policy if exists cpa_write on client_position_assignments;
create policy cpa_write on client_position_assignments
  for all to authenticated using (is_staff()) with check (is_staff());
