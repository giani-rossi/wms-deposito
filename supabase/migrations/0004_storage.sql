-- =====================================================================
-- WMS Depósito — Migración 0004: Supabase Storage (fotos y documentos)
-- =====================================================================
-- Bucket privado único para todo el WMS. La organización lógica se hace
-- por prefijo de path, p. ej.:
--   remittances/<inbound_order_id>/<file>
--   outbound/<outbound_order_id>/<file>
--   products/<product_id>/<file>
--   received-units/<received_unit_id>/<file>
--   logistic-units/<logistic_unit_id>/<file>
--   positions/<position_id>/<file>
--   incidents/<entity_id>/<file>
-- La metadata se registra en la tabla `uploaded_files`.
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('wms-files', 'wms-files', false)
on conflict (id) do nothing;

-- Acceso: cualquier usuario autenticado puede leer y subir dentro del bucket.
-- (MVP: control fino por cliente queda para una fase posterior.)
create policy "wms_files_select"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'wms-files');

create policy "wms_files_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'wms-files');

create policy "wms_files_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'wms-files')
  with check (bucket_id = 'wms-files');

create policy "wms_files_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'wms-files');
