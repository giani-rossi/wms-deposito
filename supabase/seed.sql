-- =====================================================================
-- WMS Depósito — Seed data
-- =====================================================================
-- Se ejecuta con `supabase db reset` (corre migraciones + este seed).
-- Usa UUIDs fijos para poder referenciar entidades en el ejemplo de flujo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Clientes
-- ---------------------------------------------------------------------
insert into clients (id, nombre, razon_social, tax_id, contact_name, contact_email, contact_phone, default_picking_strategy, allow_mixed_logistic_units, require_photos, operational_rules, notes)
values
  ('c0000001-0000-0000-0000-000000000001', 'Tech Importadora', 'Tech Importadora S.A.', '30-11111111-1', 'Laura Gómez', 'laura@techimport.com', '+54 11 5555-1111', 'FIFO', false, true, 'No mezclar clientes en una misma posición.', 'Cliente de alto valor (electrónica).'),
  ('c0000002-0000-0000-0000-000000000002', 'Ferretería Sur', 'Ferretería Sur SRL', '30-22222222-2', 'Marcos Díaz', 'marcos@ferreteriasur.com', '+54 11 5555-2222', 'LIFO', true, false, 'Permite unidades logísticas mixtas.', 'Productos pesados y de ferretería.'),
  ('c0000003-0000-0000-0000-000000000003', 'Audio Pro', 'Audio Pro S.A.', '30-33333333-3', 'Sofía Ruiz', 'sofia@audiopro.com', '+54 11 5555-3333', 'manual', false, true, 'Picking manual, productos frágiles.', 'Audio y accesorios.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2) Posiciones de rack (2 racks x columnas A-D x niveles PISO,1,2,3)
--    code: R{rack}-{col}-{level}
-- ---------------------------------------------------------------------
do $$
declare
  r int;
  col text;
  lvl text;
  cols text[] := array['A', 'B', 'C', 'D'];
  lvls text[] := array['PISO', '1', '2', '3'];
begin
  for r in 1..2 loop
    foreach col in array cols loop
      foreach lvl in array lvls loop
        insert into positions (code, rack_number, column_letter, level, type, status)
        values ('R' || r || '-' || col || '-' || lvl, r, col, lvl, 'rack', 'free')
        on conflict (code) do nothing;
      end loop;
    end loop;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Posiciones de piso (etapas operativas)
-- ---------------------------------------------------------------------
insert into positions (code, type, status) values
  ('FLOOR-INBOUND-01',        'floor_inbound',        'free'),
  ('FLOOR-CLASSIFICATION-01', 'floor_classification', 'free'),
  ('FLOOR-ASSEMBLY-01',       'floor_assembly',       'free'),
  ('FLOOR-TEMP-01',           'floor_temporary',      'free'),
  ('FLOOR-OUTBOUND-01',       'floor_outbound',       'free'),
  ('FLOOR-INCIDENT-01',       'floor_incident',       'free'),
  ('FLOOR-RETURN-01',         'floor_return',         'free')
on conflict (code) do nothing;

-- Asignar rack 1 a Tech Importadora (ejemplo)
update positions
set assigned_client_id = 'c0000001-0000-0000-0000-000000000001'
where rack_number = 1;

-- ---------------------------------------------------------------------
-- 4) Productos
-- ---------------------------------------------------------------------
insert into products (id, client_id, name, sku, category, size_class, weight_class, fragility, rotation, stackable, high_value, requires_fifo, description)
values
  ('40000001-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000001', 'iPhone 15', 'IPH15-128', 'Electrónica', 'small', 'light', 'high', 'high', true, true, true, 'Smartphone Apple iPhone 15 128GB'),
  ('40000002-0000-0000-0000-000000000002', 'c0000001-0000-0000-0000-000000000001', 'Cargador USB-C', 'USBC-20W', 'Accesorios', 'small', 'light', 'medium', 'high', true, false, false, 'Cargador USB-C 20W'),
  ('40000003-0000-0000-0000-000000000003', 'c0000002-0000-0000-0000-000000000002', 'Martillo', 'MART-500', 'Ferretería', 'medium', 'medium', 'low', 'medium', true, false, false, 'Martillo carpintero 500g'),
  ('40000004-0000-0000-0000-000000000004', 'c0000002-0000-0000-0000-000000000002', 'Bordeadora', 'BORD-1000', 'Ferretería', 'large', 'heavy', 'medium', 'low', false, false, false, 'Bordeadora eléctrica 1000W'),
  ('40000005-0000-0000-0000-000000000005', 'c0000003-0000-0000-0000-000000000003', 'Auriculares', 'HP-PRO', 'Audio', 'small', 'light', 'medium', 'high', true, false, false, 'Auriculares profesionales over-ear')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 5) Orden de ingreso de ejemplo (Tech Importadora) — ya ubicada
-- ---------------------------------------------------------------------
insert into inbound_orders (id, client_id, date_time, truck_company, driver_name, license_plate, remittance_number, status, notes,
  ai_extracted_data_json, human_confirmed_data_json)
values (
  '10000001-0000-0000-0000-000000000001',
  'c0000001-0000-0000-0000-000000000001',
  now() - interval '2 days',
  'Transportes Andina', 'Juan Pérez', 'AB123CD', 'REM-2026-0001', 'located',
  'Remito REM-2026-0001: 1 pallet cerrado, contenido a clasificar.',
  '{"remittance_number":"REM-2026-0001","client_name":"Tech Importadora","supplier_name":"Apple Distribution","date":"2026-06-04","pallets":1,"boxes":12,"items":[{"description":"iPhone 15","sku":"IPH15-128","quantity":8,"unit_of_measure":"caja"},{"description":"Cargador USB-C","sku":"USBC-20W","quantity":4,"unit_of_measure":"caja"}],"confidence":0.86,"warnings":["Cantidad de cajas estimada"]}'::jsonb,
  '{"remittance_number":"REM-2026-0001","client_name":"Tech Importadora","supplier_name":"Apple Distribution","date":"2026-06-04","pallets":1,"boxes":12,"items":[{"description":"iPhone 15","sku":"IPH15-128","quantity":8,"unit_of_measure":"caja"},{"description":"Cargador USB-C","sku":"USBC-20W","quantity":4,"unit_of_measure":"caja"}],"confirmed_by":"supervisor"}'::jsonb
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 6) Unidad recibida (pallet cerrado) -> luego clasificada
-- ---------------------------------------------------------------------
insert into received_units (id, code, inbound_order_id, client_id, type, physical_quantity, content_status, current_position_id, requires_classification, notes)
values (
  '20000001-0000-0000-0000-000000000001',
  'UR-0001',
  '10000001-0000-0000-0000-000000000001',
  'c0000001-0000-0000-0000-000000000001',
  'pallet', 1, 'validated',
  (select id from positions where code = 'FLOOR-INBOUND-01'),
  true,
  'Pallet cerrado, clasificado en piso de clasificación.'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 7) Unidades logísticas creadas a partir de UR-0001
-- ---------------------------------------------------------------------
insert into logistic_units (id, code, received_unit_id, inbound_order_id, client_id, type, status, current_position_id, entry_date, is_mixed)
values
  ('30000001-0000-0000-0000-000000000001', 'UL-0001',
    '20000001-0000-0000-0000-000000000001', '10000001-0000-0000-0000-000000000001',
    'c0000001-0000-0000-0000-000000000001', 'set', 'located',
    (select id from positions where code = 'R1-B-1'), now() - interval '2 days', false),
  ('30000002-0000-0000-0000-000000000002', 'UL-0002',
    '20000001-0000-0000-0000-000000000001', '10000001-0000-0000-0000-000000000001',
    'c0000001-0000-0000-0000-000000000001', 'set', 'located',
    (select id from positions where code = 'R1-C-2'), now() - interval '2 days', false)
on conflict (id) do nothing;

-- Marcar posiciones ocupadas
update positions set status = 'occupied' where code in ('R1-B-1', 'R1-C-2');

-- ---------------------------------------------------------------------
-- 8) Contenido de las unidades logísticas
-- ---------------------------------------------------------------------
insert into logistic_unit_contents (logistic_unit_id, product_id, quantity, unit_of_measure, status, entry_date)
values
  ('30000001-0000-0000-0000-000000000001', '40000001-0000-0000-0000-000000000001', 8, 'unidad', 'available', now() - interval '2 days'),
  ('30000002-0000-0000-0000-000000000002', '40000002-0000-0000-0000-000000000002', 4, 'unidad', 'available', now() - interval '2 days');

-- ---------------------------------------------------------------------
-- 9) Movimientos del flujo de ingreso (regla central: todo genera movimiento)
-- ---------------------------------------------------------------------
insert into movements (date_time, client_id, movement_type, inbound_order_id, received_unit_id, logistic_unit_id, product_id, quantity, from_position_id, to_position_id, notes)
values
  (now() - interval '2 days', 'c0000001-0000-0000-0000-000000000001', 'inbound_created', '10000001-0000-0000-0000-000000000001', null, null, null, null, null, null, 'Orden de ingreso creada'),
  (now() - interval '2 days', 'c0000001-0000-0000-0000-000000000001', 'download_from_truck', '10000001-0000-0000-0000-000000000001', '20000001-0000-0000-0000-000000000001', null, null, 1, null, (select id from positions where code = 'FLOOR-INBOUND-01'), 'Descarga de pallet cerrado'),
  (now() - interval '2 days', 'c0000001-0000-0000-0000-000000000001', 'received_unit_created', '10000001-0000-0000-0000-000000000001', '20000001-0000-0000-0000-000000000001', null, null, 1, null, null, 'Unidad recibida UR-0001 creada'),
  (now() - interval '2 days', 'c0000001-0000-0000-0000-000000000001', 'classification', '10000001-0000-0000-0000-000000000001', '20000001-0000-0000-0000-000000000001', '30000001-0000-0000-0000-000000000001', null, null, null, null, 'Clasificación: se crean UL-0001 y UL-0002'),
  (now() - interval '2 days', 'c0000001-0000-0000-0000-000000000001', 'location_assignment', '10000001-0000-0000-0000-000000000001', null, '30000001-0000-0000-0000-000000000001', '40000001-0000-0000-0000-000000000001', 8, (select id from positions where code = 'FLOOR-CLASSIFICATION-01'), (select id from positions where code = 'R1-B-1'), 'UL-0001 ubicada en R1-B-1'),
  (now() - interval '2 days', 'c0000001-0000-0000-0000-000000000001', 'location_assignment', '10000001-0000-0000-0000-000000000001', null, '30000002-0000-0000-0000-000000000002', '40000002-0000-0000-0000-000000000002', 4, (select id from positions where code = 'FLOOR-CLASSIFICATION-01'), (select id from positions where code = 'R1-C-2'), 'UL-0002 ubicada en R1-C-2');

-- ---------------------------------------------------------------------
-- 10) Orden de retiro de ejemplo (pendiente de validación)
-- ---------------------------------------------------------------------
insert into outbound_orders (id, client_id, date_time, document_number, destination, status, notes,
  ai_extracted_data_json)
values (
  '50000001-0000-0000-0000-000000000001',
  'c0000001-0000-0000-0000-000000000001',
  now(), 'OUT-2026-0001', 'Sucursal Centro', 'pending_validation',
  'Retiro solicitado por el cliente.',
  '{"document_number":"OUT-2026-0001","client_name":"Tech Importadora","destination":"Sucursal Centro","items":[{"description":"iPhone 15","sku":"IPH15-128","quantity":5,"unit_of_measure":"unidad"}],"confidence":0.91,"warnings":[]}'::jsonb
)
on conflict (id) do nothing;

insert into outbound_order_items (outbound_order_id, product_id, requested_quantity, unit_of_measure, status)
values
  ('50000001-0000-0000-0000-000000000001', '40000001-0000-0000-0000-000000000001', 5, 'unidad', 'pending');

-- ---------------------------------------------------------------------
-- 11) Servicios facturables generados por la operación de ingreso
-- ---------------------------------------------------------------------
insert into billable_services (client_id, date, service_type, quantity, unit, inbound_order_id, status, notes)
values
  ('c0000001-0000-0000-0000-000000000001', current_date - 2, 'truck_download', 1, 'pallet', '10000001-0000-0000-0000-000000000001', 'pending_billing', 'Descarga de camión'),
  ('c0000001-0000-0000-0000-000000000001', current_date - 2, 'classification', 1, 'pallet', '10000001-0000-0000-0000-000000000001', 'pending_billing', 'Clasificación de pallet cerrado'),
  ('c0000001-0000-0000-0000-000000000001', current_date - 2, 'location_assignment', 2, 'unidad logística', '10000001-0000-0000-0000-000000000001', 'pending_billing', 'Asignación de 2 unidades logísticas');

-- ---------------------------------------------------------------------
-- 12) Avanzar secuencias de códigos para no colisionar con el seed
-- ---------------------------------------------------------------------
select setval('received_unit_code_seq', 1, true);
select setval('logistic_unit_code_seq', 2, true);
