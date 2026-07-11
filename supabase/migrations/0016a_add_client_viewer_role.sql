-- =====================================================================
-- WMS Depósito — Migración 0016a: rol client_viewer (enum)
-- =====================================================================
-- Portal cliente (solo lectura).
--
-- IMPORTANTE — error Postgres 55P04:
--   ALTER TYPE ... ADD VALUE no puede usarse en la misma transacción que
--   referencias al nuevo valor (CHECK, funciones, políticas, etc.).
--   Aplicar ESTE archivo primero y commitear antes de 0016b.
--
-- En Supabase SQL Editor: ejecutar solo este bloque, luego 0016b.
-- =====================================================================

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'client_viewer';
