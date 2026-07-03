import { z } from "zod";

const splitLineSchema = z.object({
  content_id: z.string().uuid("Línea de contenido inválida"),
  quantity: z.coerce
    .number({ invalid_type_error: "Cantidad inválida" })
    .positive("La cantidad debe ser mayor a cero"),
});

const notesField = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    const t = (v ?? "").trim();
    return t.length ? t : null;
  });

export const splitLogisticUnitSchema = z
  .object({
    logistic_unit_id: z.string().uuid("Unidad logística inválida"),
    destination: z.enum(["relocate", "outbound", "rack"], {
      errorMap: () => ({ message: "Destino inválido" }),
    }),
    lines: z.array(splitLineSchema).min(1, "Debés indicar al menos una línea"),
    target_position_id: z.string().uuid().optional().nullable(),
    override: z.boolean().optional().default(false),
    notes: notesField,
  })
  .superRefine((data, ctx) => {
    if (data.destination === "rack" && !data.target_position_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Elegí la posición rack destino.",
        path: ["target_position_id"],
      });
    }
  });

export type SplitLogisticUnitInput = z.infer<typeof splitLogisticUnitSchema>;
