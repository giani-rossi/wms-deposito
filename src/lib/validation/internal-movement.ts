import { z } from "zod";

export const internalMoveSchema = z.object({
  logistic_unit_id: z.string().uuid("Unidad logística inválida"),
  to_position_id: z.string().uuid("Posición destino inválida"),
  notes: z
    .union([z.string(), z.null()])
    .transform((v) => {
      const t = (v ?? "").trim();
      return t.length ? t : null;
    })
    .nullable()
    .optional(),
  /** Staff: confirmar movimiento a posición bloqueada/en revisión u otro cliente. */
  override: z.boolean().optional().default(false),
});

export type InternalMoveInput = z.infer<typeof internalMoveSchema>;
