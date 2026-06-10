-- Etiqueta visible para distinguir unidades físicas (Pallet 1, Caja 2, etc.)
alter table received_units
  add column if not exists display_label text;
