"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, isStaff } from "@/lib/auth";
import { generateDailyOccupancySnapshot } from "@/lib/daily-close/generate-snapshot";

export type GenerateDailyCloseResult = {
  ok: boolean;
  error?: string;
  date?: string;
  rowsWritten?: number;
  rowsDeleted?: number;
  occupiedPositions?: number;
  /** Posiciones de almacenamiento final con mercadería de más de un cliente (override / mezcla). */
  mixedPositions?: number;
};

/** Cierre manual desde UI (requiere staff autenticado). */
export async function generateDailyPositionOccupancyAction(
  date: string
): Promise<GenerateDailyCloseResult> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { ok: false, error: "No tenés permisos para generar el cierre del día." };
  }

  const supabase = createClient();
  const result = await generateDailyOccupancySnapshot(supabase, date);

  if (!result.ok) {
    return { ok: false, error: result.error, date: result.date };
  }

  revalidatePath("/cierre-dia");
  return {
    ok: true,
    date: result.date,
    rowsWritten: result.rowsWritten,
    rowsDeleted: result.rowsDeleted,
    occupiedPositions: result.occupiedPositions,
    mixedPositions: result.mixedPositions,
  };
}
