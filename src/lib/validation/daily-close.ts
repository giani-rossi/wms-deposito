import { z } from "zod";

export const dailyCloseDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (usá formato AAAA-MM-DD)");

export type DailyCloseDateInput = z.infer<typeof dailyCloseDateSchema>;
