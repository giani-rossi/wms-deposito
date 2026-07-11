import type { MovementType } from "@/lib/types/database";

/** Etiquetas externas para el portal cliente (sin detalle operativo interno). */
export const CLIENT_PORTAL_MOVEMENT_LABELS: Record<MovementType, string> = {
  inbound_created: "Ingreso",
  download_from_truck: "Ingreso",
  received_unit_created: "Ingreso",
  classification: "Ingreso",
  desconsolidation: "Ingreso",
  assembly: "Ingreso",
  repackaging: "Ingreso",
  location_assignment: "Ingreso ubicado",
  internal_movement: "Movimiento interno en depósito",
  consolidation: "Movimiento interno en depósito",
  rack_down: "Movimiento interno en depósito",
  partial_picking: "Movimiento interno en depósito",
  logistic_unit_split: "Fraccionamiento interno",
  outbound_preparation: "Preparación de retiro",
  outbound_loaded: "Egreso",
  stock_adjustment: "Revisión",
  incident: "Revisión",
};

export function mapMovementTypeToClientLabel(type: MovementType): string {
  return CLIENT_PORTAL_MOVEMENT_LABELS[type] ?? "Movimiento";
}
