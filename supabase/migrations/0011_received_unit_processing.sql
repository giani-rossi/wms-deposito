-- Trazabilidad de procesamiento (clasificación / desconsolidación / armado / reembalaje)
alter table public.received_units
  add column if not exists processed_at timestamptz,
  add column if not exists last_processing_movement_id uuid
    references public.movements(id) on delete set null;
