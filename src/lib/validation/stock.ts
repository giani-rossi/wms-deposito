import { z } from "zod";

/** Convierte "" / null -> null y recorta strings. */
const optionalText = z
  .union([z.string(), z.null()])
  .transform((v) => {
    const t = (v ?? "").trim();
    return t.length ? t : null;
  })
  .nullable();

/** Producto del catálogo del cliente (alta rápida). */
export const productQuickSchema = z.object({
  client_id: z.string().uuid("Cliente inválido"),
  name: z.string().trim().min(1, "El nombre del producto es obligatorio"),
  sku: optionalText,
  unit_of_measure: optionalText,
  description: optionalText,
  notes: optionalText,
});

export type ProductQuickInput = z.infer<typeof productQuickSchema>;

/**
 * Carga de contenido en una unidad recibida. Permite elegir un producto del
 * catálogo (product_id) o crear uno nuevo al vuelo (new_product_name).
 */
export const receivedUnitContentSchema = z
  .object({
    received_unit_id: z.string().uuid("Unidad recibida inválida"),
    product_id: z
      .union([z.string().uuid(), z.literal(""), z.null()])
      .transform((v) => (v ? v : null))
      .nullable(),
    new_product_name: optionalText,
    new_product_sku: optionalText,
    quantity: z.coerce
      .number({ invalid_type_error: "Cantidad inválida" })
      .positive("La cantidad debe ser mayor a 0"),
    unit_of_measure: optionalText,
    lot: optionalText,
    notes: optionalText,
  })
  .refine((d) => !!d.product_id || !!d.new_product_name, {
    message: "Elegí un producto existente o ingresá el nombre de uno nuevo",
    path: ["product_id"],
  });

export type ReceivedUnitContentInput = z.infer<typeof receivedUnitContentSchema>;

export function receivedUnitContentFromFormData(formData: FormData) {
  return {
    received_unit_id: formData.get("received_unit_id"),
    product_id: formData.get("product_id"),
    new_product_name: formData.get("new_product_name"),
    new_product_sku: formData.get("new_product_sku"),
    quantity: formData.get("quantity"),
    unit_of_measure: formData.get("unit_of_measure"),
    lot: formData.get("lot"),
    notes: formData.get("notes"),
  };
}
