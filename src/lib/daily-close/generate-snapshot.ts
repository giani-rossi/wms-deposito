import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { dailyCloseDateSchema } from "@/lib/validation/daily-close";
import type { PositionStatus } from "@/lib/types/database";
import { FINAL_STORAGE_POSITION_TYPES } from "@/lib/constants";
import {
  aggregateOccupancySnapshot,
  countMixedPositions,
  distinctOccupiedPositions,
} from "@/lib/daily-close/aggregate-snapshot";

export type GenerateDailyOccupancySnapshotResult =
  | {
      ok: true;
      date: string;
      rowsWritten: number;
      rowsDeleted: number;
      occupiedPositions: number;
      mixedPositions: number;
    }
  | {
      ok: false;
      date: string;
      error: string;
    };

type Supabase = SupabaseClient<Database>;

/**
 * Genera (o regenera) el snapshot diario de ocupación por posición para estadía.
 * Idempotente por fecha: upsert por (date, client_id, position_id) y elimina
 * filas obsoletas del mismo día. No modifica stock ni movimientos.
 */
export async function generateDailyOccupancySnapshot(
  supabase: Supabase,
  date: string
): Promise<GenerateDailyOccupancySnapshotResult> {
  const parsed = dailyCloseDateSchema.safeParse(date);
  if (!parsed.success) {
    return {
      ok: false,
      date,
      error: parsed.error.errors[0]?.message ?? "Fecha inválida",
    };
  }
  const closeDate = parsed.data;

  const [{ data: storagePositions, error: posErr }, { data: units, error: unitsErr }] =
    await Promise.all([
      supabase
        .from("positions")
        .select("id, code, status")
        .in("type", FINAL_STORAGE_POSITION_TYPES),
      supabase
        .from("logistic_units")
        .select("id, client_id, current_position_id")
        .eq("status", "located")
        .not("current_position_id", "is", null),
    ]);

  if (posErr) return { ok: false, date: closeDate, error: posErr.message };
  if (unitsErr) return { ok: false, date: closeDate, error: unitsErr.message };

  const aggregated = aggregateOccupancySnapshot(
    (storagePositions ?? []).map((p) => ({
      id: p.id,
      code: p.code,
      status: p.status as PositionStatus,
    })),
    units ?? []
  );

  const rows = aggregated.map((r) => ({
    date: closeDate,
    client_id: r.client_id,
    position_id: r.position_id,
    position_code: r.position_code,
    occupied_units_count: r.occupied_units_count,
    position_status: r.position_status,
  }));

  const mixedPositions = countMixedPositions(aggregated);
  const occupiedPositions = distinctOccupiedPositions(aggregated);

  const newKeys = new Set(rows.map((r) => `${r.client_id}:${r.position_id}`));

  const { data: existing, error: existingErr } = await supabase
    .from("daily_position_occupancy")
    .select("id, client_id, position_id")
    .eq("date", closeDate);

  if (existingErr) {
    return { ok: false, date: closeDate, error: existingErr.message };
  }

  const staleIds =
    existing
      ?.filter((e) => !newKeys.has(`${e.client_id}:${e.position_id}`))
      .map((e) => e.id) ?? [];

  let rowsDeleted = 0;
  if (staleIds.length > 0) {
    const { error: deleteErr } = await supabase
      .from("daily_position_occupancy")
      .delete()
      .in("id", staleIds);
    if (deleteErr) {
      return { ok: false, date: closeDate, error: deleteErr.message };
    }
    rowsDeleted = staleIds.length;
  }

  if (rows.length === 0) {
    return {
      ok: true,
      date: closeDate,
      rowsWritten: 0,
      rowsDeleted,
      occupiedPositions: 0,
      mixedPositions: 0,
    };
  }

  const { error: upsertErr } = await supabase
    .from("daily_position_occupancy")
    .upsert(rows, { onConflict: "date,client_id,position_id" });

  if (upsertErr) {
    return { ok: false, date: closeDate, error: upsertErr.message };
  }

  return {
    ok: true,
    date: closeDate,
    rowsWritten: rows.length,
    rowsDeleted,
    occupiedPositions,
    mixedPositions,
  };
}
