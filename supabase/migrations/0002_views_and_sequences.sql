-- =====================================================================
-- WMS Depósito — Migración 0002: vistas de stock / cierre + secuencias
-- =====================================================================

-- ---------------------------------------------------------------------
-- Secuencias y helpers para códigos legibles (UR-0001, UL-0001)
-- ---------------------------------------------------------------------
create sequence if not exists received_unit_code_seq start 1;
create sequence if not exists logistic_unit_code_seq start 1;

create or replace function next_received_unit_code()
returns text
language sql
as $$
  select 'UR-' || lpad(nextval('received_unit_code_seq')::text, 4, '0');
$$;

create or replace function next_logistic_unit_code()
returns text
language sql
as $$
  select 'UL-' || lpad(nextval('logistic_unit_code_seq')::text, 4, '0');
$$;

-- ---------------------------------------------------------------------
-- Vista: stock por posición
-- El stock se DERIVA de logistic_unit_contents + logistic_units (no hay
-- tabla de stock separada). Se excluye lo egresado.
-- ---------------------------------------------------------------------
create or replace view stock_by_position as
select
  lu.current_position_id            as position_id,
  pos.code                          as position_code,
  lu.client_id                      as client_id,
  luc.product_id                    as product_id,
  p.name                            as product_name,
  p.sku                             as sku,
  lu.id                             as logistic_unit_id,
  lu.code                           as logistic_unit_code,
  lu.inbound_order_id               as inbound_order_id,
  luc.quantity                      as quantity,
  luc.unit_of_measure               as unit_of_measure,
  luc.lot                           as lot,
  coalesce(luc.entry_date, lu.entry_date) as entry_date,
  luc.status                        as stock_status
from logistic_unit_contents luc
join logistic_units lu on lu.id = luc.logistic_unit_id
join products p on p.id = luc.product_id
left join positions pos on pos.id = lu.current_position_id
where lu.status <> 'exited'
  and luc.status <> 'exited'
  and luc.quantity > 0;

-- ---------------------------------------------------------------------
-- Vista: resumen de stock por cliente + producto (para dashboard/cierre)
-- ---------------------------------------------------------------------
create or replace view stock_summary_by_product as
select
  s.client_id,
  c.nombre                          as client_name,
  s.product_id,
  s.product_name,
  s.sku,
  s.stock_status,
  sum(s.quantity)                   as total_quantity,
  count(distinct s.logistic_unit_id) as logistic_units,
  count(distinct s.position_id)     as positions
from stock_by_position s
join clients c on c.id = s.client_id
group by
  s.client_id, c.nombre, s.product_id, s.product_name, s.sku, s.stock_status;

-- ---------------------------------------------------------------------
-- Vista: ocupación de posiciones (para mapa y cierre del día)
-- ---------------------------------------------------------------------
create or replace view position_occupancy as
select
  pos.id                            as position_id,
  pos.code                          as position_code,
  pos.type                          as position_type,
  pos.status                        as position_status,
  pos.assigned_client_id,
  count(lu.id) filter (where lu.status <> 'exited') as logistic_units_count,
  count(distinct lu.client_id) filter (where lu.status <> 'exited') as distinct_clients
from positions pos
left join logistic_units lu on lu.current_position_id = pos.id
group by pos.id, pos.code, pos.type, pos.status, pos.assigned_client_id;
