import { z } from "zod";

const splitLineSchema = z.object({
  content_id: z.string().uuid("Línea de contenido inválida"),
  quantity: z.coerce
    .number({ invalid_type_error: "Cantidad inválida" })
    .positive("La cantidad debe ser mayor a cero"),
});

export const splitLogisticUnitSchema = z.object({
  logistic_unit_id: z.string().uuid("Unidad logística inválida"),
  destination: z.enum(["relocate", "outbound"], {
    errorMap: () => ({ message: "Destino inválido" }),
  }),
  lines: z
    .array(splitLineSchema)
    .min(1, "Debés indicar al menos una línea"),
});

export type SplitLogisticUnitInput = z.infer<typeof splitLogisticUnitSchema>;
