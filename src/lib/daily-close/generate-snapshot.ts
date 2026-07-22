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

export type DailyCloseSnapshotDiagnostics = {
  storagePositionsCount: number;
  locatedUnitsCount: number;
  aggregatedRowsCount: number;
  /** ULs con status=located pero fuera de rack / piso guardado (zonas operativas, etc.). */
  locatedUnitsOutsideFinalStorage: number;
  storagePositionTypes: readonly string[];
};

export type GenerateDailyOccupancySnapshotResult =
  | {
      ok: true;
      date: string;
      rowsWritten: number;
      rowsDeleted: number;
      occupiedPositions: number;
      mixedPositions: number;
      diagnostics: DailyCloseSnapshotDiagnostics;
    }
  | {
      ok: false;
      date: string;
      error: string;
      diagnostics?: DailyCloseSnapshotDiagnostics;
    };

type Supabase = SupabaseClient<Database>;

function buildDiagnostics(
  storagePositions: { id: string }[],
  units: { current_position_id: string | null }[],
  aggregatedRowsCount: number
): DailyCloseSnapshotDiagnostics {
  const storagePositionIds = new Set(storagePositions.map((p) => p.id));
  let locatedUnitsOutsideFinalStorage = 0;

  for (const unit of units) {
    if (
      unit.current_position_id &&
      !storagePositionIds.has(unit.current_position_id)
    ) {
      locatedUnitsOutsideFinalStorage += 1;
    }
  }

  return {
    storagePositionsCount: storagePositions.length,
    locatedUnitsCount: units.length,
    aggregatedRowsCount,
    locatedUnitsOutsideFinalStorage,
    storagePositionTypes: FINAL_STORAGE_POSITION_TYPES,
  };
}

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

  if (posErr) {
    console.error("[daily-close] Supabase positions query failed:", posErr.message);
    return { ok: false, date: closeDate, error: posErr.message };
  }
  if (unitsErr) {
    console.error("[daily-close] Supabase logistic_units query failed:", unitsErr.message);
    return { ok: false, date: closeDate, error: unitsErr.message };
  }

  const storagePositionsList = storagePositions ?? [];
  const unitsList = units ?? [];

  const aggregated = aggregateOccupancySnapshot(
    storagePositionsList.map((p) => ({
      id: p.id,
      code: p.code,
      status: p.status as PositionStatus,
    })),
    unitsList
  );

  const diagnostics = buildDiagnostics(
    storagePositionsList,
    unitsList,
    aggregated.length
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
    console.error(
      "[daily-close] Supabase daily_position_occupancy select failed:",
      existingErr.message
    );
    return {
      ok: false,
      date: closeDate,
      error: existingErr.message,
      diagnostics,
    };
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
      console.error(
        "[daily-close] Supabase daily_position_occupancy delete failed:",
        deleteErr.message
      );
      return {
        ok: false,
        date: closeDate,
        error: deleteErr.message,
        diagnostics,
      };
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
      diagnostics,
    };
  }

  const { error: upsertErr } = await supabase
    .from("daily_position_occupancy")
    .upsert(rows, { onConflict: "date,client_id,position_id" });

  if (upsertErr) {
    console.error(
      "[daily-close] Supabase daily_position_occupancy upsert failed:",
      upsertErr.message
    );
    return {
      ok: false,
      date: closeDate,
      error: upsertErr.message,
      diagnostics,
    };
  }

  return {
    ok: true,
    date: closeDate,
    rowsWritten: rows.length,
    rowsDeleted,
    occupiedPositions,
    mixedPositions,
    diagnostics,
  };
}
