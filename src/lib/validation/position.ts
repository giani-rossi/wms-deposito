import { z } from "zod";
import type { PositionStatus, PositionType } from "@/lib/types/database";
import {
  RACK_COLUMNS,
  POSITION_SIDES,
  POSITION_LEVELS,
  FLOOR_ZONE_NUMBERS,
  buildRackCode,
  buildFloorZoneCode,
  isFloorZoneType,
  FLOOR_ZONE_PREFIXES,
  RACK_CODE_REGEX,
  FLOOR_ZONE_CODE_REGEX,
} from "@/lib/constants";

/** Convierte "" / null -> null y recorta strings. */
const optionalText = z
  .union([z.string(), z.null()])
  .transform((v) => {
    const t = (v ?? "").trim();
    return t.length ? t : null;
  })
  .nullable();

// Tipos visibles en la UI (subconjunto). El resto del enum sigue existiendo
// en la base pero no se ofrece para crear/filtrar.
export const VISIBLE_POSITION_TYPE_VALUES: [PositionType, ...PositionType[]] = [
  "rack",
  "floor_inbound",
  "floor_outbound",
  "floor_incident",
];

export const POSITION_STATUSES: [PositionStatus, ...PositionStatus[]] = [
  "free",
  "partially_occupied",
  "occupied",
  "reserved",
  "blocked",
  "incident",
];

const COLUMN_SET = new Set<string>(RACK_COLUMNS);
const SIDE_SET = new Set<string>(POSITION_SIDES);
const LEVEL_SET = new Set<string>(POSITION_LEVELS);
const ZONE_NUMBER_SET = new Set<number>(FLOOR_ZONE_NUMBERS);

/** Extrae el número (NN) de un código de zona operativa, o null. */
export function floorZoneNumberFromCode(code?: string | null): number | null {
  const m = (code ?? "").trim().toUpperCase().match(/-(\d{1,3})$/);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Alta / edición de una posición
//   * type = rack  -> se arma el código con columna/lado/nivel (dropdowns)
//   * type = piso  -> código manual (FLOOR-INBOUND-01, etc.)
// ---------------------------------------------------------------------------

export type NormalizedPosition = {
  code: string;
  type: PositionType;
  column_letter: string | null;
  side: string | null;
  level: string | null;
  rack_number: null;
  capacity_notes: string | null;
  occupancy_notes: string | null;
};

export const positionSchema = z
  .object({
    type: z.enum(VISIBLE_POSITION_TYPE_VALUES),
    column_letter: z.union([z.string(), z.null()]).optional(),
    side: z.union([z.string(), z.null()]).optional(),
    level: z.union([z.string(), z.null()]).optional(),
    zone_number: z.union([z.string(), z.number(), z.null()]).optional(),
    capacity_notes: optionalText,
    occupancy_notes: optionalText,
  })
  .superRefine((val, ctx) => {
    if (val.type === "rack") {
      const col = (val.column_letter ?? "").toString().toUpperCase();
      const side = (val.side ?? "").toString().toUpperCase();
      const level = (val.level ?? "").toString().toUpperCase();
      if (!COLUMN_SET.has(col)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Seleccioná una columna válida (A-K)",
          path: ["column_letter"],
        });
      }
      if (!SIDE_SET.has(side)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Seleccioná un lado (IZQ/DER)",
          path: ["side"],
        });
      }
      if (!LEVEL_SET.has(level)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Seleccioná un nivel (PISO/1/2/3/4)",
          path: ["level"],
        });
      }
    } else if (isFloorZoneType(val.type)) {
      const n = Number.parseInt(String(val.zone_number ?? ""), 10);
      if (!Number.isFinite(n) || !ZONE_NUMBER_SET.has(n)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Seleccioná un número de zona válido (01-10)",
          path: ["zone_number"],
        });
      }
    } else {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Tipo de posición no permitido.",
        path: ["type"],
      });
    }
  })
  .transform((val): NormalizedPosition => {
    if (val.type === "rack") {
      const col = (val.column_letter ?? "").toString().toUpperCase();
      const side = (val.side ?? "").toString().toUpperCase();
      const level = (val.level ?? "").toString().toUpperCase();
      return {
        code: buildRackCode(col, side, level),
        type: val.type,
        column_letter: col,
        side,
        level,
        rack_number: null,
        capacity_notes: val.capacity_notes,
        occupancy_notes: val.occupancy_notes,
      };
    }
    // Zona operativa de piso: código controlado por convención.
    const n = Number.parseInt(String(val.zone_number ?? ""), 10);
    return {
      code: buildFloorZoneCode(val.type, n),
      type: val.type,
      column_letter: null,
      side: null,
      level: null,
      rack_number: null,
      capacity_notes: val.capacity_notes,
      occupancy_notes: val.occupancy_notes,
    };
  })
  .superRefine((val, ctx) => {
    // Defensa final: el código generado SIEMPRE debe respetar el formato.
    if (val.type === "rack") {
      if (!RACK_CODE_REGEX.test(val.code)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "El código de rack tiene un formato inválido.",
          path: ["code"],
        });
      }
      return;
    }
    const expectedPrefix = FLOOR_ZONE_PREFIXES[val.type];
    if (
      !expectedPrefix ||
      !val.code.startsWith(`${expectedPrefix}-`) ||
      !FLOOR_ZONE_CODE_REGEX.test(val.code)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El código de la zona operativa tiene un formato inválido.",
        path: ["code"],
      });
    }
  });

export function positionInputFromFormData(formData: FormData) {
  return {
    type: formData.get("type"),
    column_letter: formData.get("column_letter"),
    side: formData.get("side"),
    level: formData.get("level"),
    zone_number: formData.get("zone_number"),
    capacity_notes: formData.get("capacity_notes"),
    occupancy_notes: formData.get("occupancy_notes"),
  };
}

// ---------------------------------------------------------------------------
// Generación masiva por rango de columnas + lados + niveles
// ---------------------------------------------------------------------------

export const bulkGenerateSchema = z
  .object({
    from_column: z.enum(RACK_COLUMNS),
    to_column: z.enum(RACK_COLUMNS),
    sides: z
      .array(z.enum(POSITION_SIDES))
      .min(1, "Seleccioná al menos un lado"),
    levels: z
      .array(z.enum(POSITION_LEVELS))
      .min(1, "Seleccioná al menos un nivel"),
  })
  .refine(
    (val) =>
      RACK_COLUMNS.indexOf(val.from_column) <=
      RACK_COLUMNS.indexOf(val.to_column),
    {
      message: "La columna inicial debe ser anterior o igual a la final",
      path: ["to_column"],
    }
  );

export type BulkGenerateInput = z.infer<typeof bulkGenerateSchema>;

export function bulkGenerateInputFromFormData(formData: FormData) {
  return {
    from_column: formData.get("from_column"),
    to_column: formData.get("to_column"),
    sides: formData.getAll("sides"),
    levels: formData.getAll("levels"),
  };
}

/** Devuelve todas las celdas a generar para el rango indicado. */
export function buildBulkPositions(input: BulkGenerateInput) {
  const start = RACK_COLUMNS.indexOf(input.from_column);
  const end = RACK_COLUMNS.indexOf(input.to_column);
  const columns = RACK_COLUMNS.slice(start, end + 1);

  const out: {
    code: string;
    column_letter: string;
    side: string;
    level: string;
  }[] = [];

  for (const column of columns) {
    for (const side of input.sides) {
      for (const level of input.levels) {
        out.push({
          code: buildRackCode(column, side, level),
          column_letter: column,
          side,
          level,
        });
      }
    }
  }
  return out;
}
