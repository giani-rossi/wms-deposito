-- =====================================================================
-- WMS Depósito — Migración 0017: gestión de accesos portal cliente
-- =====================================================================
-- Requiere 0016a + 0016b aplicadas.
-- Idempotente: ADD IF NOT EXISTS, DROP IF EXISTS, DO blocks con pg_constraint.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Campos de acceso portal en profiles
-- ---------------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS portal_access_status text,
  ADD COLUMN IF NOT EXISTS portal_invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS portal_invited_by uuid
    REFERENCES profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS portal_disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS portal_disabled_by uuid
    REFERENCES profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS portal_last_login_at timestamptz;

UPDATE profiles
SET portal_access_status = 'active'
WHERE role = 'client_viewer'
  AND portal_access_status IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_profiles_portal_access_status'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT chk_profiles_portal_access_status
      CHECK (
        portal_access_status IS NULL
        OR portal_access_status IN ('invited', 'active', 'disabled')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_profiles_portal_status_for_role'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT chk_profiles_portal_status_for_role
      CHECK (
        role = 'client_viewer'
        OR portal_access_status IS NULL
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_client_viewer_has_portal_status'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT chk_client_viewer_has_portal_status
      CHECK (
        role <> 'client_viewer'
        OR portal_access_status IS NOT NULL
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_portal_email
  ON profiles (lower(trim(email)))
  WHERE role = 'client_viewer' AND email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_portal_client
  ON profiles (client_id)
  WHERE role = 'client_viewer';

CREATE INDEX IF NOT EXISTS idx_profiles_portal_status
  ON profiles (portal_access_status)
  WHERE role = 'client_viewer';

-- ---------------------------------------------------------------------
-- 2) handle_new_user: no pisar perfiles client_viewer ya configurados
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    coalesce(NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  )
  ON CONFLICT (id) DO UPDATE
    SET
      email = EXCLUDED.email,
      full_name = coalesce(profiles.full_name, EXCLUDED.full_name)
    WHERE profiles.role <> 'client_viewer';
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- 3) Helpers SQL
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION portal_access_status_for_user(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT portal_access_status
  FROM profiles
  WHERE id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION is_portal_access_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT NOT is_client_viewer()
    OR coalesce(portal_access_status_for_user(auth.uid()), 'disabled')
      IN ('invited', 'active');
$$;

-- ---------------------------------------------------------------------
-- 4) Vista listado accesos portal (admin → ficha cliente)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.client_portal_access_users
WITH (security_invoker = true) AS
SELECT
  p.id AS profile_id,
  p.client_id,
  c.nombre AS client_name,
  c.razon_social AS client_legal_name,
  c.tax_id AS client_tax_id,
  p.email,
  p.full_name,
  p.portal_access_status,
  p.portal_invited_at,
  p.portal_invited_by,
  inviter.full_name AS portal_invited_by_name,
  p.portal_disabled_at,
  p.portal_disabled_by,
  p.portal_last_login_at,
  p.created_at,
  p.updated_at
FROM profiles p
JOIN clients c ON c.id = p.client_id
LEFT JOIN profiles inviter ON inviter.id = p.portal_invited_by
WHERE p.role = 'client_viewer';

-- ---------------------------------------------------------------------
-- 5) Backfill usuarios portal existentes (creados manualmente)
-- ---------------------------------------------------------------------
UPDATE profiles
SET
  portal_access_status = 'active',
  portal_last_login_at = coalesce(portal_last_login_at, updated_at)
WHERE role = 'client_viewer'
  AND portal_access_status IS NULL;
