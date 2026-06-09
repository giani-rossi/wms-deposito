import { z } from "zod";

/** Convierte "" / null -> null y recorta strings. */
const optionalText = z
  .union([z.string(), z.null()])
  .transform((v) => {
    const t = (v ?? "").trim();
    return t.length ? t : null;
  })
  .nullable();

const optionalEmail = z
  .union([z.string(), z.null()])
  .transform((v) => (v ?? "").trim())
  .refine((v) => v === "" || z.string().email().safeParse(v).success, {
    message: "Email de contacto inválido",
  })
  .transform((v) => (v.length ? v : null));

export const clientSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
  razon_social: optionalText,
  tax_id: optionalText,
  contact_name: optionalText,
  contact_email: optionalEmail,
  contact_phone: optionalText,
  billing_notes: optionalText,
  operational_rules: optionalText,
  default_picking_strategy: z.enum(["FIFO", "LIFO", "manual"]),
  // allow_mixed_logistic_units / require_photos: quedan en base con su default,
  // pero ya no se exponen en la UI (MVP). No se editan desde el formulario.
  notes: optionalText,
});

export type ClientInput = z.infer<typeof clientSchema>;

/** Parsea un FormData del formulario de cliente al shape de Zod. */
export function clientInputFromFormData(formData: FormData) {
  return {
    nombre: formData.get("nombre"),
    razon_social: formData.get("razon_social"),
    tax_id: formData.get("tax_id"),
    contact_name: formData.get("contact_name"),
    contact_email: formData.get("contact_email"),
    contact_phone: formData.get("contact_phone"),
    billing_notes: formData.get("billing_notes"),
    operational_rules: formData.get("operational_rules"),
    default_picking_strategy: formData.get("default_picking_strategy"),
    notes: formData.get("notes"),
  };
}
