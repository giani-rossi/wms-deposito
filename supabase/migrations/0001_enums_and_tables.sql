-- =====================================================================
-- WMS Depósito — Migración 0001: enums, tablas, índices y triggers
-- =====================================================================
-- Stack: Supabase Postgres (sin Prisma). Todo el modelo del depósito.
-- Regla central: nada entra, se mueve, cambia de posición o sale sin un
-- registro en `movements`. Esa regla se aplica en la capa de servicios
-- (TypeScript), aquí dejamos la estructura y las restricciones de datos.
-- =====================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
create type user_role as enum ('admin', 'supervisor', 'operator');

create type picking_strategy as enum ('FIFO', 'LIFO', 'manual');

create type position_type as enum (
  'rack',
  'floor_inbound',
  'floor_classification',
  'floor_assembly',
  'floor_temporary',
  'floor_outbound',
  'floor_incident',
  'floor_return'
);

create type position_status as enum (
  'free',
  'partially_occupied',
  'occupied',
  'reserved',
  'blocked',
  'incident'
);

create type inbound_order_status as enum (
  'pending_download',
  'downloaded',
  'pending_validation',
  'pending_classification',
  'partially_classified',
  'ready_to_locate',
  'located',
  'incident',
  'closed'
);

create type received_unit_type as enum (
  'pallet',
  'box',
  'package',
  'loose_item',
  'mixed',
  'unknown'
);

create type content_status as enum (
  'unknown',
  'expected_from_document',
  'validated',
  'mixed',
  'partially_classified',
  'discrepancy',
  'incident',
  'pending_opening',
  'ready_to_locate',
  'pending_assembly',
  'pending_repackaging'
);

create type logistic_unit_type as enum (
  'pallet',
  'box',
  'package',
  'assembled',
  'mixed',
  'set',
  'loose_item'
);

create type logistic_unit_status as enum (
  'pending_classification',
  'ready_to_locate',
  'located',
  'reserved',
  'in_floor_inbound',
  'in_floor_outbound',
  'in_classification',
  'in_incident',
  'partially_picked',
  'exited',
  'blocked'
);

create type stock_status as enum (
  'available',
  'reserved',
  'floor_inbound',
  'floor_outbound',
  'in_classification',
  'incident',
  'exited',
  'blocked'
);

create type size_class as enum ('small', 'medium', 'large', 'irregular');
create type weight_class as enum ('light', 'medium', 'heavy');
create type fragility_level as enum ('low', 'medium', 'high');
create type rotation_level as enum ('low', 'medium', 'high');

create type movement_type as enum (
  'inbound_created',
  'download_from_truck',
  'received_unit_created',
  'classification',
  'desconsolidation',
  'assembly',
  'repackaging',
  'location_assignment',
  'internal_movement',
  'consolidation',
  'partial_picking',
  'rack_down',
  'outbound_preparation',
  'outbound_loaded',
  'stock_adjustment',
  'incident'
);

create type outbound_order_status as enum (
  'pending_validation',
  'pending_stock_assignment',
  'picking_assigned',
  'in_preparation',
  'ready_to_load',
  'loaded',
  'closed',
  'incident'
);

create type outbound_order_item_status as enum (
  'pending',
  'assigned',
  'partially_assigned',
  'prepared',
  'loaded',
  'incident'
);

create type picking_assignment_status as enum (
  'suggested',
  'confirmed',
  'picked',
  'moved_to_floor_outbound',
  'loaded',
  'cancelled'
);

create type billable_service_type as enum (
  'truck_download',
  'desconsolidation',
  'classification',
  'assembly',
  'repackaging',
  'location_assignment',
  'storage',
  'internal_movement',
  'consolidation',
  'partial_picking',
  'rack_down',
  'truck_loading',
  'incident_review',
  'photos_documentation'
);

create type billable_service_status as enum (
  'pending_billing',
  'billed',
  'non_billable',
  'under_review'
);

create type related_entity_type as enum (
  'inbound_order',
  'outbound_order',
  'product',
  'received_unit',
  'logistic_unit',
  'position',
  'incident',
  'movement'
);

-- ---------------------------------------------------------------------
-- Trigger genérico para updated_at
-- ---------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- profiles (vinculado a auth.users) + roles
-- ---------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  role user_role not null default 'operator',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- Crea automáticamente un profile cuando se registra un usuario en Auth.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------
-- clients (clientes)
-- ---------------------------------------------------------------------
create table clients (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  razon_social text,
  tax_id text,
  contact_name text,
  contact_email text,
  contact_phone text,
  billing_notes text,
  operational_rules text,
  default_picking_strategy picking_strategy not null default 'FIFO',
  allow_mixed_logistic_units boolean not null default false,
  require_photos boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_clients_updated_at
  before update on clients
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- positions (posiciones de depósito: racks + piso)
-- ---------------------------------------------------------------------
create table positions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  rack_number integer,
  column_letter text,
  level text, -- 'PISO', '1', '2', '3' (null para posiciones de piso)
  type position_type not null default 'rack',
  assigned_client_id uuid references clients (id) on delete set null,
  status position_status not null default 'free',
  capacity_notes text,
  occupancy_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_positions_assigned_client on positions (assigned_client_id);
create index idx_positions_type on positions (type);
create index idx_positions_status on positions (status);

create trigger trg_positions_updated_at
  before update on positions
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- products (productos, pertenecen a un cliente)
-- ---------------------------------------------------------------------
create table products (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  name text not null,
  sku text,
  category text,
  description text,
  size_class size_class,
  weight_class weight_class,
  fragility fragility_level,
  rotation rotation_level,
  stackable boolean not null default true,
  high_value boolean not null default false,
  requires_fifo boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_products_client on products (client_id);
create index idx_products_sku on products (sku);

create trigger trg_products_updated_at
  before update on products
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- inbound_orders (órdenes de ingreso)
-- ---------------------------------------------------------------------
create table inbound_orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete restrict,
  date_time timestamptz not null default now(),
  truck_company text,
  driver_name text,
  license_plate text,
  remittance_number text,
  ai_extracted_data_json jsonb,      -- crudo de OCR/IA (nunca toca stock)
  human_confirmed_data_json jsonb,   -- confirmado por humano
  status inbound_order_status not null default 'pending_download',
  notes text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_inbound_orders_client on inbound_orders (client_id);
create index idx_inbound_orders_status on inbound_orders (status);
create index idx_inbound_orders_date on inbound_orders (date_time);

create trigger trg_inbound_orders_updated_at
  before update on inbound_orders
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- received_units (unidades recibidas)
-- ---------------------------------------------------------------------
create table received_units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, -- ej: UR-0001
  inbound_order_id uuid not null references inbound_orders (id) on delete cascade,
  client_id uuid not null references clients (id) on delete restrict,
  type received_unit_type not null default 'unknown',
  physical_quantity numeric not null default 1,
  content_status content_status not null default 'unknown',
  current_position_id uuid references positions (id) on delete set null,
  notes text,
  requires_classification boolean not null default false,
  requires_desconsolidation boolean not null default false,
  requires_assembly boolean not null default false,
  requires_repackaging boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_received_units_inbound on received_units (inbound_order_id);
create index idx_received_units_client on received_units (client_id);
create index idx_received_units_position on received_units (current_position_id);

create trigger trg_received_units_updated_at
  before update on received_units
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- logistic_units (unidades logísticas)
-- ---------------------------------------------------------------------
create table logistic_units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, -- ej: UL-0001
  received_unit_id uuid references received_units (id) on delete set null,
  inbound_order_id uuid references inbound_orders (id) on delete set null,
  client_id uuid not null references clients (id) on delete restrict,
  type logistic_unit_type not null default 'box',
  status logistic_unit_status not null default 'pending_classification',
  current_position_id uuid references positions (id) on delete set null,
  entry_date timestamptz default now(),
  notes text,
  is_mixed boolean not null default false,
  is_available boolean not null default true,
  requires_partial_picking boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_logistic_units_client on logistic_units (client_id);
create index idx_logistic_units_position on logistic_units (current_position_id);
create index idx_logistic_units_received on logistic_units (received_unit_id);
create index idx_logistic_units_status on logistic_units (status);

create trigger trg_logistic_units_updated_at
  before update on logistic_units
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- logistic_unit_contents (contenido de cada unidad logística)
-- ---------------------------------------------------------------------
create table logistic_unit_contents (
  id uuid primary key default gen_random_uuid(),
  logistic_unit_id uuid not null references logistic_units (id) on delete cascade,
  product_id uuid not null references products (id) on delete restrict,
  quantity numeric not null default 0,
  unit_of_measure text,
  lot text,
  entry_date timestamptz default now(),
  status stock_status not null default 'available',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_luc_unit on logistic_unit_contents (logistic_unit_id);
create index idx_luc_product on logistic_unit_contents (product_id);
create index idx_luc_status on logistic_unit_contents (status);

create trigger trg_luc_updated_at
  before update on logistic_unit_contents
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- outbound_orders (órdenes de retiro)
-- ---------------------------------------------------------------------
create table outbound_orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete restrict,
  date_time timestamptz not null default now(),
  document_number text,
  ai_extracted_data_json jsonb,
  human_confirmed_data_json jsonb,
  destination text,
  truck_company text,
  driver_name text,
  license_plate text,
  status outbound_order_status not null default 'pending_validation',
  notes text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_outbound_orders_client on outbound_orders (client_id);
create index idx_outbound_orders_status on outbound_orders (status);
create index idx_outbound_orders_date on outbound_orders (date_time);

create trigger trg_outbound_orders_updated_at
  before update on outbound_orders
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- outbound_order_items (items de la orden de retiro)
-- ---------------------------------------------------------------------
create table outbound_order_items (
  id uuid primary key default gen_random_uuid(),
  outbound_order_id uuid not null references outbound_orders (id) on delete cascade,
  product_id uuid not null references products (id) on delete restrict,
  requested_quantity numeric not null default 0,
  confirmed_quantity numeric,
  unit_of_measure text,
  status outbound_order_item_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_ooi_order on outbound_order_items (outbound_order_id);
create index idx_ooi_product on outbound_order_items (product_id);

create trigger trg_ooi_updated_at
  before update on outbound_order_items
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- picking_assignments (asignaciones de picking)
-- ---------------------------------------------------------------------
create table picking_assignments (
  id uuid primary key default gen_random_uuid(),
  outbound_order_id uuid not null references outbound_orders (id) on delete cascade,
  outbound_order_item_id uuid not null references outbound_order_items (id) on delete cascade,
  logistic_unit_id uuid not null references logistic_units (id) on delete restrict,
  product_id uuid not null references products (id) on delete restrict,
  from_position_id uuid references positions (id) on delete set null,
  quantity numeric not null default 0,
  status picking_assignment_status not null default 'suggested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_pa_order on picking_assignments (outbound_order_id);
create index idx_pa_item on picking_assignments (outbound_order_item_id);
create index idx_pa_unit on picking_assignments (logistic_unit_id);

create trigger trg_pa_updated_at
  before update on picking_assignments
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- billable_services (servicios facturables)
-- ---------------------------------------------------------------------
create table billable_services (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete restrict,
  date date not null default current_date,
  service_type billable_service_type not null,
  quantity numeric not null default 1,
  unit text,
  inbound_order_id uuid references inbound_orders (id) on delete set null,
  outbound_order_id uuid references outbound_orders (id) on delete set null,
  movement_id uuid, -- FK agregada luego de crear movements
  status billable_service_status not null default 'pending_billing',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_bs_client on billable_services (client_id);
create index idx_bs_date on billable_services (date);
create index idx_bs_status on billable_services (status);
create index idx_bs_type on billable_services (service_type);

create trigger trg_bs_updated_at
  before update on billable_services
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- movements (movimientos) — la bitácora central del depósito
-- ---------------------------------------------------------------------
create table movements (
  id uuid primary key default gen_random_uuid(),
  date_time timestamptz not null default now(),
  user_id uuid references profiles (id) on delete set null,
  client_id uuid references clients (id) on delete set null,
  movement_type movement_type not null,
  received_unit_id uuid references received_units (id) on delete set null,
  logistic_unit_id uuid references logistic_units (id) on delete set null,
  product_id uuid references products (id) on delete set null,
  quantity numeric,
  from_position_id uuid references positions (id) on delete set null,
  to_position_id uuid references positions (id) on delete set null,
  inbound_order_id uuid references inbound_orders (id) on delete set null,
  outbound_order_id uuid references outbound_orders (id) on delete set null,
  notes text,
  billable_service_id uuid references billable_services (id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_movements_client on movements (client_id);
create index idx_movements_type on movements (movement_type);
create index idx_movements_date on movements (date_time);
create index idx_movements_logistic_unit on movements (logistic_unit_id);
create index idx_movements_received_unit on movements (received_unit_id);
create index idx_movements_from_pos on movements (from_position_id);
create index idx_movements_to_pos on movements (to_position_id);
create index idx_movements_inbound on movements (inbound_order_id);
create index idx_movements_outbound on movements (outbound_order_id);

-- FK diferida de billable_services -> movements
alter table billable_services
  add constraint fk_billable_services_movement
  foreign key (movement_id) references movements (id) on delete set null;

-- ---------------------------------------------------------------------
-- uploaded_files (fotos y documentos en Supabase Storage)
-- ---------------------------------------------------------------------
create table uploaded_files (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  path text not null,
  file_type text,
  related_entity_type related_entity_type,
  related_entity_id uuid,
  uploaded_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_uploaded_files_entity
  on uploaded_files (related_entity_type, related_entity_id);
