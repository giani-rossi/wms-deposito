import { z } from "zod";

const logisticUnitTypes = [
  "pallet",
  "box",
  "package",
  "assembled",
  "mixed",
  "set",
  "loose_item",
] as const;

export const processingOperationTypes = [
  "classification",
  "desconsolidation",
  "assembly",
  "repackaging",
] as const;

export type ProcessingOperationType = (typeof processingOperationTypes)[number];

const resultContentLineSchema = z.object({
  product_id: z.string().uuid("Producto inválido"),
  quantity: z.coerce
    .number({ invalid_type_error: "Cantidad inválida" })
    .positive("La cantidad debe ser mayor a 0"),
});

const resultUnitSchema = z.object({
  type: z.enum(logisticUnitTypes, {
    errorMap: () => ({ message: "Tipo de unidad resultante inválido" }),
  }),
  label: z
    .union([z.string(), z.null()])
    .transform((v) => {
      const t = (v ?? "").trim();
      return t.length ? t : null;
    })
    .nullable()
    .optional(),
  contents: z
    .array(resultContentLineSchema)
    .min(1, "Cada unidad resultante debe tener al menos un producto"),
});

export const processReceivedUnitSchema = z
  .object({
    received_unit_id: z.string().uuid("Unidad recibida inválida"),
    operation_type: z.enum(processingOperationTypes, {
      errorMap: () => ({ message: "Operación inválida" }),
    }),
    notes: z
      .union([z.string(), z.null()])
      .transform((v) => {
        const t = (v ?? "").trim();
        return t.length ? t : null;
      })
      .nullable()
      .optional(),
    result_units: z
      .array(resultUnitSchema)
      .min(1, "Definí al menos una unidad resultante"),
  })
  .superRefine((data, ctx) => {
    if (
      data.operation_type === "desconsolidation" &&
      data.result_units.length < 2
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "La desconsolidación requiere al menos dos unidades logísticas resultantes.",
        path: ["result_units"],
      });
    }
    if (
      (data.operation_type === "assembly" ||
        data.operation_type === "repackaging") &&
      data.result_units.length !== 1
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Armado y reembalaje permiten una sola unidad logística resultante en MVP.",
        path: ["result_units"],
      });
    }
  });

export type ProcessReceivedUnitInput = z.infer<typeof processReceivedUnitSchema>;
