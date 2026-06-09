-- =====================================================================
-- WMS Depósito — Migración 0006
--   Nueva nomenclatura de posiciones: {columna}-{lado}-{nivel}
--   Ej: A-IZQ-1, A-DER-PISO
--
--   * Agrega positions.side (IZQ / DER)
--   * rack_number queda deprecado (nullable) — no se rompe nada existente.
--   * column_letter pasa a representar la letra principal (A..K).
--   * level pasa a representar PISO, 1, 2, 3, 4.
-- =====================================================================

alter table positions
  add column if not exists side text;

-- Solo se permiten IZQ / DER (o null para posiciones de piso / legacy).
alter table positions
  drop constraint if exists positions_side_check;
alter table positions
  add constraint positions_side_check
  check (side is null or side in ('IZQ', 'DER'));

create index if not exists idx_positions_grid
  on positions (column_letter, side, level);
