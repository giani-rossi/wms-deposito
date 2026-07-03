-- Permite a staff regenerar el snapshot del mismo día (elimina filas obsoletas).

drop policy if exists daily_position_occupancy_delete on daily_position_occupancy;

create policy daily_position_occupancy_delete on daily_position_occupancy
  for delete to authenticated using (is_staff());
