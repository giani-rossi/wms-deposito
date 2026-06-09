"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, isStaff } from "@/lib/auth";
import type { PositionStatus } from "@/lib/types/database";
import { dailyCloseDateSchema } from "@/lib/validation/daily-close";

export type GenerateDailyCloseResult = {
  ok: boolean;
  error?: string;
  rowsWritten?: number;
  /** Posiciones rack con mercadería de más de un cliente (override / mezcla). */
  mixedPositions?: number;
};

type OccupancyAgg = {
  client_id: string;
  position_id: string;
  position_code: string;
  position_status: PositionStatus;
  occupied_units_count: number;
};

/**
 * Genera (o regenera) el snapshot diario de ocupación por posición para estadía.
 * Idempotente por fecha: reemplaza el corte del día sin duplicar filas.
 * No modifica stock ni movimientos.
 */
export async function generateDailyPositionOccupancyAction(
  date: string
): Promise<GenerateDailyCloseResult> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { ok: false, error: "No tenés permisos para generar el cierre del día." };
  }

  const parsed = dailyCloseDateSchema.safeParse(date);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Fecha inválida" };
  }
  const closeDate = parsed.data;

  const supabase = createClient();

  const [{ data: rackPositions, error: posErr }, { data: units, error: unitsErr }] =
    await Promise.all([
      supabase
        .from("positions")
        .select("id, code, status")
        .eq("type", "rack"),
      supabase
        .from("logistic_units")
        .select("id, client_id, current_position_id")
        .eq("status", "located")
        .not("current_position_id", "is", null),
    ]);

  if (posErr) return { ok: false, error: posErr.message };
  if (unitsErr) return { ok: false, error: unitsErr.message };

  const posMap = new Map(
    (rackPositions ?? []).map((p) => [
      p.id,
      {
        id: p.id,
        code: p.code,
        status: p.status as PositionStatus,
      },
    ])
  );

  const aggMap = new Map<string, OccupancyAgg>();
  for (const row of units ?? []) {
    if (!row.current_position_id) continue;
    const pos = posMap.get(row.current_position_id);
    if (!pos) continue;

    const key = `${row.client_id}:${pos.id}`;
    const existing = aggMap.get(key);
    if (existing) {
      existing.occupied_units_count += 1;
    } else {
      aggMap.set(key, {
        client_id: row.client_id,
        position_id: pos.id,
        position_code: pos.code,
        position_status: pos.status,
        occupied_units_count: 1,
      });
    }
  }

  const rows = Array.from(aggMap.values()).map((r) => ({
    date: closeDate,
    client_id: r.client_id,
    position_id: r.position_id,
    position_code: r.position_code,
    occupied_units_count: r.occupied_units_count,
    position_status: r.position_status,
  }));

  // Posiciones con más de un cliente ese día (mezcla por override).
  const clientsByPosition = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = clientsByPosition.get(r.position_id) ?? new Set<string>();
    set.add(r.client_id);
    clientsByPosition.set(r.position_id, set);
  }
  const mixedPositions = [...clientsByPosition.values()].filter(
    (s) => s.size > 1
  ).length;

  // Idempotente: reemplaza el snapshot de la fecha (corte actual del sistema).
  const { error: deleteErr } = await supabase
    .from("daily_position_occupancy")
    .delete()
    .eq("date", closeDate);
  if (deleteErr) {
    return { ok: false, error: deleteErr.message };
  }

  if (rows.length > 0) {
    const { error: insertErr } = await supabase
      .from("daily_position_occupancy")
      .insert(rows);
    if (insertErr) {
      return { ok: false, error: insertErr.message };
    }
  }

  revalidatePath("/cierre-dia");
  return {
    ok: true,
    rowsWritten: rows.length,
    mixedPositions,
  };
}
