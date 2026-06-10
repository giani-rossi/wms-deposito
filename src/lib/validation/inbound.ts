import { z } from "zod";
import type {
  ContentStatus,
  ReceivedUnitType,
} from "@/lib/types/database";

const optionalText = z
  .union([z.string(), z.null()])
  .transform((v) => {
    const t = (v ?? "").trim();
    return t.length ? t : null;
  })
  .nullable();

// ---------------------------------------------------------------------------
// Orden de ingreso
// ---------------------------------------------------------------------------

export const inboundOrderSchema = z.object({
  client_id: z.string().uuid("Seleccioná un cliente"),
  date_time: z
    .string()
    .trim()
    .min(1, "La fecha/hora es obligatoria")
    .transform((v) => new Date(v).toISOString()),
  truck_company: optionalText,
  driver_name: optionalText,
  license_plate: optionalText,
  remittance_number: optionalText,
  notes: optionalText,
});

export type InboundOrderInput = z.infer<typeof inboundOrderSchema>;

export function inboundOrderInputFromFormData(formData: FormData) {
  return {
    client_id: formData.get("client_id"),
    date_time: formData.get("date_time"),
    truck_company: formData.get("truck_company"),
    driver_name: formData.get("driver_name"),
    license_plate: formData.get("license_plate"),
    remittance_number: formData.get("remittance_number"),
    notes: formData.get("notes"),
  };
}

// ---------------------------------------------------------------------------
// Unidad recibida
// ---------------------------------------------------------------------------

export const RECEIVED_UNIT_TYPES: [ReceivedUnitType, ...ReceivedUnitType[]] = [
  "pallet",
  "box",
  "package",
  "loose_item",
  "mixed",
  "unknown",
];

export const CONTENT_STATUSES: [ContentStatus, ...ContentStatus[]] = [
  "unknown",
  "expected_from_document",
  "validated",
  "mixed",
  "partially_classified",
  "discrepancy",
  "incident",
  "pending_opening",
  "ready_to_locate",
  "pending_assembly",
  "pending_repackaging",
];

export const receivedUnitSchema = z.object({
  type: z.enum(RECEIVED_UNIT_TYPES),
  physical_quantity: z.coerce
    .number({ invalid_type_error: "Cantidad inválida" })
    .positive("La cantidad debe ser mayor a 0"),
  display_label: z
    .union([z.string(), z.null()])
    .transform((v) => {
      const t = (v ?? "").trim();
      return t.length ? t : null;
    })
    .nullable()
    .optional(),
  content_status: z.enum(CONTENT_STATUSES),
  current_position_id: z
    .union([z.string(), z.null()])
    .transform((v) => {
      const t = (v ?? "").trim();
      return t.length ? t : null;
    })
    .nullable(),
  requires_classification: z.boolean(),
  requires_desconsolidation: z.boolean(),
  requires_assembly: z.boolean(),
  requires_repackaging: z.boolean(),
  notes: optionalText,
});

export type ReceivedUnitInput = z.infer<typeof receivedUnitSchema>;

export function receivedUnitInputFromFormData(formData: FormData) {
  return {
    type: formData.get("type"),
    physical_quantity: formData.get("physical_quantity"),
    display_label: formData.get("display_label"),
    content_status: formData.get("content_status"),
    current_position_id: formData.get("current_position_id"),
    requires_classification: formData.get("requires_classification") === "on",
    requires_desconsolidation:
      formData.get("requires_desconsolidation") === "on",
    requires_assembly: formData.get("requires_assembly") === "on",
    requires_repackaging: formData.get("requires_repackaging") === "on",
    notes: formData.get("notes"),
  };
}

// ---------------------------------------------------------------------------
// Resumen físico de descarga (snapshot al registrar descarga del camión)
// ---------------------------------------------------------------------------

const countField = z.coerce
  .number({ invalid_type_error: "Cantidad inválida" })
  .int("Debe ser un número entero")
  .min(0, "No puede ser negativo")
  .default(0);

export const dischargeSchema = z.object({
  pallets_count: countField,
  boxes_count: countField,
  packages_count: countField,
  loose_items_count: countField,
  total_units_count: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => {
      const t = String(v ?? "").trim();
      if (!t) return null;
      const n = Number(t);
      return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
    }),
  requires_desconsolidation: z.boolean(),
  requires_classification: z.boolean(),
  requires_assembly: z.boolean(),
  notes: optionalText,
});

export type DischargeInput = z.infer<typeof dischargeSchema>;

export function dischargeInputFromFormData(formData: FormData) {
  return {
    pallets_count: formData.get("pallets_count"),
    boxes_count: formData.get("boxes_count"),
    packages_count: formData.get("packages_count"),
    loose_items_count: formData.get("loose_items_count"),
    total_units_count: formData.get("total_units_count"),
    requires_desconsolidation:
      formData.get("requires_desconsolidation") === "on",
    requires_classification: formData.get("requires_classification") === "on",
    requires_assembly: formData.get("requires_assembly") === "on",
    notes: formData.get("notes"),
  };
}

// ---------------------------------------------------------------------------
// Ubicación de mercadería (asignar posiciones a una unidad recibida)
// ---------------------------------------------------------------------------

export const locateDestinationSchema = z.object({
  position_id: z.string().uuid("Seleccioná una posición válida"),
  quantity: z.coerce
    .number({ invalid_type_error: "Cantidad inválida" })
    .positive("La cantidad debe ser mayor a 0"),
  assign_to_client: z.boolean().default(false),
  // Estado de ocupación elegido por el usuario tras ubicar (capacidad flexible:
  // el sistema NO infiere ocupación por cantidad). Si se omite, el server usa
  // "parcialmente ocupada" solo si la posición estaba libre.
  final_status: z.enum(["partially_occupied", "occupied"]).optional(),
  // Confirmación explícita para ubicar en posición de otro cliente o
  // bloqueada/en revisión (solo staff). Queda registrada en el movimiento.
  override: z.boolean().default(false),
});

export const locateInputSchema = z.object({
  received_unit_id: z.string().uuid(),
  destinations: z
    .array(locateDestinationSchema)
    .min(1, "Agregá al menos un destino"),
});

export type LocateDestinationInput = z.infer<typeof locateDestinationSchema>;
export type LocateInput = z.infer<typeof locateInputSchema>;

// ---------------------------------------------------------------------------
// OCR — datos confirmados por el humano (estructura normalizada)
// ---------------------------------------------------------------------------

export const ocrItemSchema = z.object({
  description: z.string().default(""),
  quantity: z.union([z.number(), z.string(), z.null()]).optional(),
  unit: z.string().nullable().optional(),
  sku: z.string().nullable().optional(),
});

export const ocrDataSchema = z.object({
  remito_number: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  sender: z.string().nullable().optional(),
  transport_company: z.string().nullable().optional(),
  driver_name: z.string().nullable().optional(),
  license_plate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z.array(ocrItemSchema).default([]),
});

export type OcrData = z.infer<typeof ocrDataSchema>;
export type OcrItem = z.infer<typeof ocrItemSchema>;

export const EMPTY_OCR_DATA: OcrData = {
  remito_number: null,
  date: null,
  sender: null,
  transport_company: null,
  driver_name: null,
  license_plate: null,
  notes: null,
  items: [],
};
