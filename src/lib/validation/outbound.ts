import { z } from "zod";

export const createOutboundOrderSchema = z.object({
  client_id: z.string().uuid("Cliente inválido"),
  requested_date: z
    .union([z.string(), z.null()])
    .transform((v) => {
      const t = (v ?? "").trim();
      return t.length ? t : null;
    })
    .nullable()
    .optional(),
  notes: z
    .union([z.string(), z.null()])
    .transform((v) => {
      const t = (v ?? "").trim();
      return t.length ? t : null;
    })
    .nullable()
    .optional(),
});

export type CreateOutboundOrderInput = z.infer<typeof createOutboundOrderSchema>;

export function createOutboundOrderInputFromFormData(
  formData: FormData
): CreateOutboundOrderInput {
  return {
    client_id: String(formData.get("client_id") ?? ""),
    requested_date: formData.get("requested_date") as string | null,
    notes: formData.get("notes") as string | null,
  };
}

export const outboundOrderUnitSchema = z.object({
  outbound_order_id: z.string().uuid("Orden inválida"),
  logistic_unit_id: z.string().uuid("Unidad logística inválida"),
});

export type OutboundOrderUnitInput = z.infer<typeof outboundOrderUnitSchema>;

export const outboundOrderIdSchema = z.object({
  outbound_order_id: z.string().uuid("Orden inválida"),
});

export type OutboundOrderIdInput = z.infer<typeof outboundOrderIdSchema>;

export const removeOutboundLineSchema = z.object({
  outbound_order_id: z.string().uuid("Orden inválida"),
  line_id: z.string().uuid("Línea inválida"),
});

export type RemoveOutboundLineInput = z.infer<typeof removeOutboundLineSchema>;
