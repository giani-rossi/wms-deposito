-- =====================================================================
-- WMS Depósito — Migración 0016b: schema portal cliente
-- =====================================================================
-- Requiere 0016a aplicada y commiteada (enum client_viewer disponible).
-- Documenta lo ya aplicado en Supabase para el portal de solo lectura.
--
-- Incluye:
--   * profiles.client_id + constraint client_viewer ↔ cliente
--   * CUIT normalizado en clients.tax_id (solo dígitos + unique)
--   * helpers is_client_viewer() / auth_client_id()
--   * vistas client_portal_stock / client_portal_movements (sin ubicación)
--   * portal_audit_events + RLS tenant isolation para client_viewer
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Vínculo usuario ↔ cliente
-- ---------------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS client_id uuid
    REFERENCES clients (id) ON DELETE RESTRICT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_client_viewer_has_client'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT chk_client_viewer_has_client
      CHECK (role <> 'client_viewer' OR client_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_client_id ON profiles (client_id);

-- ---------------------------------------------------------------------
-- 2) CUIT normalizado (clients.tax_id)
-- ---------------------------------------------------------------------
UPDATE clients
SET tax_id = regexp_replace(coalesce(tax_id, ''), '[^0-9]', '', 'g')
WHERE tax_id IS NOT NULL;

UPDATE clients SET tax_id = NULL WHERE tax_id = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_clients_tax_id_digits'
  ) THEN
    ALTER TABLE clients
      ADD CONSTRAINT chk_clients_tax_id_digits
      CHECK (tax_id IS NULL OR tax_id ~ '^[0-9]+$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_tax_id
  ON clients (tax_id)
  WHERE tax_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 3) Helpers RLS (security definer para evitar recursión en profiles)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_client_viewer()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$ SELECT auth_role() = 'client_viewer'; $$;

CREATE OR REPLACE FUNCTION auth_client_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT client_id FROM profiles WHERE id = auth.uid(); $$;

-- Lectura tenant: staff/operator ven todo; client_viewer solo su client_id
CREATE OR REPLACE FUNCTION can_read_client_data(p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT NOT is_client_viewer()
    OR (p_client_id IS NOT NULL AND p_client_id = auth_client_id());
$$;

-- ---------------------------------------------------------------------
-- 4) Vista portal stock (sin posición; solo stock disponible en rack)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW client_portal_stock
WITH (security_invoker = true) AS
SELECT
  lu.client_id,
  c.tax_id AS cuit,
  c.nombre AS client_label,
  p.id AS product_id,
  p.sku,
  p.name AS product_name,
  lu.id AS logistic_unit_id,
  lu.code AS logistic_unit_code,
  lu.type AS logistic_unit_type,
  luc.quantity,
  luc.unit_of_measure,
  luc.lot,
  coalesce(luc.entry_date, lu.entry_date) AS entry_date
FROM logistic_unit_contents luc
JOIN logistic_units lu ON lu.id = luc.logistic_unit_id
JOIN products p ON p.id = luc.product_id
JOIN clients c ON c.id = lu.client_id
WHERE lu.status = 'located'
  AND lu.is_available = true
  AND luc.status = 'available'
  AND luc.quantity > 0
  AND c.is_active = true;

-- ---------------------------------------------------------------------
-- 5) Vista portal movimientos (sin posición ni notas internas)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW client_portal_movements
WITH (security_invoker = true) AS
SELECT
  m.id,
  m.date_time,
  m.client_id,
  m.movement_type,
  m.quantity,
  p.sku,
  p.name AS product_name,
  lu.code AS logistic_unit_code
FROM movements m
LEFT JOIN products p ON p.id = m.product_id
LEFT JOIN logistic_units lu ON lu.id = m.logistic_unit_id
WHERE m.client_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 6) Auditoría del portal
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN ('login', 'export_stock', 'export_movements')),
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_audit_client
  ON portal_audit_events (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_portal_audit_profile
  ON portal_audit_events (profile_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_portal_audit_updated_at ON portal_audit_events;
CREATE TRIGGER trg_portal_audit_updated_at
  BEFORE UPDATE ON portal_audit_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE portal_audit_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 7) RLS — aislamiento por client_id para client_viewer
-- ---------------------------------------------------------------------

-- profiles: client_viewer solo ve su propio perfil
DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles
  FOR SELECT TO authenticated
  USING (NOT is_client_viewer() OR id = auth.uid());

-- clients
DROP POLICY IF EXISTS clients_select ON clients;
CREATE POLICY clients_select ON clients
  FOR SELECT TO authenticated
  USING (NOT is_client_viewer() OR id = auth_client_id());

DROP POLICY IF EXISTS clients_write ON clients;
CREATE POLICY clients_write ON clients
  FOR ALL TO authenticated
  USING (is_staff() AND NOT is_client_viewer())
  WITH CHECK (is_staff() AND NOT is_client_viewer());

-- positions: client_viewer sin acceso (expone ubicación exacta)
DROP POLICY IF EXISTS positions_select ON positions;
CREATE POLICY positions_select ON positions
  FOR SELECT TO authenticated
  USING (NOT is_client_viewer());

DROP POLICY IF EXISTS positions_write ON positions;
CREATE POLICY positions_write ON positions
  FOR ALL TO authenticated
  USING (is_staff() AND NOT is_client_viewer())
  WITH CHECK (is_staff() AND NOT is_client_viewer());

-- products: client_viewer solo productos de su stock/movimientos
DROP POLICY IF EXISTS products_select ON products;
CREATE POLICY products_select ON products
  FOR SELECT TO authenticated
  USING (
    NOT is_client_viewer()
    OR EXISTS (
      SELECT 1
      FROM logistic_unit_contents luc
      JOIN logistic_units lu ON lu.id = luc.logistic_unit_id
      WHERE luc.product_id = products.id
        AND lu.client_id = auth_client_id()
    )
    OR EXISTS (
      SELECT 1
      FROM movements m
      WHERE m.product_id = products.id
        AND m.client_id = auth_client_id()
    )
  );

DROP POLICY IF EXISTS products_write ON products;
CREATE POLICY products_write ON products
  FOR ALL TO authenticated
  USING (is_staff() AND NOT is_client_viewer())
  WITH CHECK (is_staff() AND NOT is_client_viewer());

-- client_position_assignments
DROP POLICY IF EXISTS cpa_select ON client_position_assignments;
CREATE POLICY cpa_select ON client_position_assignments
  FOR SELECT TO authenticated
  USING (NOT is_client_viewer());

DROP POLICY IF EXISTS cpa_write ON client_position_assignments;
CREATE POLICY cpa_write ON client_position_assignments
  FOR ALL TO authenticated
  USING (is_staff() AND NOT is_client_viewer())
  WITH CHECK (is_staff() AND NOT is_client_viewer());

-- Tablas operativas con client_id
DO $$
DECLARE
  t text;
  tenant_tables text[] := array[
    'inbound_orders',
    'received_units',
    'logistic_units',
    'outbound_orders',
    'outbound_order_items',
    'movements',
    'billable_services'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON %1$s;', t);
    EXECUTE format(
      'CREATE POLICY %1$s_select ON %1$s FOR SELECT TO authenticated USING (can_read_client_data(client_id));',
      t
    );
    EXECUTE format('DROP POLICY IF EXISTS %1$s_insert ON %1$s;', t);
    EXECUTE format(
      'CREATE POLICY %1$s_insert ON %1$s FOR INSERT TO authenticated WITH CHECK (NOT is_client_viewer());',
      t
    );
    EXECUTE format('DROP POLICY IF EXISTS %1$s_update ON %1$s;', t);
    EXECUTE format(
      'CREATE POLICY %1$s_update ON %1$s FOR UPDATE TO authenticated USING (NOT is_client_viewer()) WITH CHECK (NOT is_client_viewer());',
      t
    );
    EXECUTE format('DROP POLICY IF EXISTS %1$s_delete ON %1$s;', t);
    EXECUTE format(
      'CREATE POLICY %1$s_delete ON %1$s FOR DELETE TO authenticated USING (is_admin() AND NOT is_client_viewer());',
      t
    );
  END LOOP;
END $$;

-- logistic_unit_contents no tiene client_id: filtrar vía UL padre
DROP POLICY IF EXISTS logistic_unit_contents_select ON logistic_unit_contents;
CREATE POLICY logistic_unit_contents_select ON logistic_unit_contents
  FOR SELECT TO authenticated
  USING (
    NOT is_client_viewer()
    OR EXISTS (
      SELECT 1
      FROM logistic_units lu
      WHERE lu.id = logistic_unit_contents.logistic_unit_id
        AND lu.client_id = auth_client_id()
    )
  );

DROP POLICY IF EXISTS logistic_unit_contents_insert ON logistic_unit_contents;
CREATE POLICY logistic_unit_contents_insert ON logistic_unit_contents
  FOR INSERT TO authenticated
  WITH CHECK (NOT is_client_viewer());

DROP POLICY IF EXISTS logistic_unit_contents_update ON logistic_unit_contents;
CREATE POLICY logistic_unit_contents_update ON logistic_unit_contents
  FOR UPDATE TO authenticated
  USING (NOT is_client_viewer())
  WITH CHECK (NOT is_client_viewer());

DROP POLICY IF EXISTS logistic_unit_contents_delete ON logistic_unit_contents;
CREATE POLICY logistic_unit_contents_delete ON logistic_unit_contents
  FOR DELETE TO authenticated
  USING (is_admin() AND NOT is_client_viewer());

-- picking_assignments (sin client_id directo; bloquear portal)
DROP POLICY IF EXISTS picking_assignments_select ON picking_assignments;
CREATE POLICY picking_assignments_select ON picking_assignments
  FOR SELECT TO authenticated
  USING (NOT is_client_viewer());

DROP POLICY IF EXISTS picking_assignments_insert ON picking_assignments;
CREATE POLICY picking_assignments_insert ON picking_assignments
  FOR INSERT TO authenticated
  WITH CHECK (NOT is_client_viewer());

DROP POLICY IF EXISTS picking_assignments_update ON picking_assignments;
CREATE POLICY picking_assignments_update ON picking_assignments
  FOR UPDATE TO authenticated
  USING (NOT is_client_viewer())
  WITH CHECK (NOT is_client_viewer());

DROP POLICY IF EXISTS picking_assignments_delete ON picking_assignments;
CREATE POLICY picking_assignments_delete ON picking_assignments
  FOR DELETE TO authenticated
  USING (is_admin() AND NOT is_client_viewer());

-- outbound_order_logistic_units (0014)
DROP POLICY IF EXISTS outbound_order_logistic_units_select ON outbound_order_logistic_units;
CREATE POLICY outbound_order_logistic_units_select ON outbound_order_logistic_units
  FOR SELECT TO authenticated
  USING (
    NOT is_client_viewer()
    OR EXISTS (
      SELECT 1
      FROM outbound_orders oo
      WHERE oo.id = outbound_order_logistic_units.outbound_order_id
        AND oo.client_id = auth_client_id()
    )
  );

DROP POLICY IF EXISTS outbound_order_logistic_units_insert ON outbound_order_logistic_units;
CREATE POLICY outbound_order_logistic_units_insert ON outbound_order_logistic_units
  FOR INSERT TO authenticated
  WITH CHECK (NOT is_client_viewer());

DROP POLICY IF EXISTS outbound_order_logistic_units_update ON outbound_order_logistic_units;
CREATE POLICY outbound_order_logistic_units_update ON outbound_order_logistic_units
  FOR UPDATE TO authenticated
  USING (NOT is_client_viewer())
  WITH CHECK (NOT is_client_viewer());

DROP POLICY IF EXISTS outbound_order_logistic_units_delete ON outbound_order_logistic_units;
CREATE POLICY outbound_order_logistic_units_delete ON outbound_order_logistic_units
  FOR DELETE TO authenticated
  USING (is_admin() AND NOT is_client_viewer());

-- uploaded_files
DROP POLICY IF EXISTS uploaded_files_select ON uploaded_files;
CREATE POLICY uploaded_files_select ON uploaded_files
  FOR SELECT TO authenticated
  USING (NOT is_client_viewer());

DROP POLICY IF EXISTS uploaded_files_insert ON uploaded_files;
CREATE POLICY uploaded_files_insert ON uploaded_files
  FOR INSERT TO authenticated
  WITH CHECK (NOT is_client_viewer());

DROP POLICY IF EXISTS uploaded_files_update ON uploaded_files;
CREATE POLICY uploaded_files_update ON uploaded_files
  FOR UPDATE TO authenticated
  USING (NOT is_client_viewer())
  WITH CHECK (NOT is_client_viewer());

DROP POLICY IF EXISTS uploaded_files_delete ON uploaded_files;
CREATE POLICY uploaded_files_delete ON uploaded_files
  FOR DELETE TO authenticated
  USING (is_admin() AND NOT is_client_viewer());

-- daily_position_occupancy (cierre interno)
DROP POLICY IF EXISTS daily_position_occupancy_select ON daily_position_occupancy;
CREATE POLICY daily_position_occupancy_select ON daily_position_occupancy
  FOR SELECT TO authenticated
  USING (NOT is_client_viewer());

-- portal_audit_events
DROP POLICY IF EXISTS portal_audit_select ON portal_audit_events;
CREATE POLICY portal_audit_select ON portal_audit_events
  FOR SELECT TO authenticated
  USING (can_read_client_data(client_id));

DROP POLICY IF EXISTS portal_audit_insert ON portal_audit_events;
CREATE POLICY portal_audit_insert ON portal_audit_events
  FOR INSERT TO authenticated
  WITH CHECK (
    is_client_viewer()
    AND profile_id = auth.uid()
    AND client_id = auth_client_id()
  );

DROP POLICY IF EXISTS portal_audit_staff_insert ON portal_audit_events;
CREATE POLICY portal_audit_staff_insert ON portal_audit_events
  FOR INSERT TO authenticated
  WITH CHECK (NOT is_client_viewer());

-- billable_services: staff puede cambiar estado; client_viewer solo lectura tenant
DROP POLICY IF EXISTS billable_services_update ON billable_services;
CREATE POLICY billable_services_update ON billable_services
  FOR UPDATE TO authenticated
  USING (is_staff() AND NOT is_client_viewer())
  WITH CHECK (is_staff() AND NOT is_client_viewer());

DROP POLICY IF EXISTS billable_services_delete ON billable_services;
CREATE POLICY billable_services_delete ON billable_services
  FOR DELETE TO authenticated
  USING (is_admin() AND NOT is_client_viewer());
