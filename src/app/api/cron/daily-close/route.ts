import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateDailyOccupancySnapshot } from "@/lib/daily-close/generate-snapshot";
import { todayInArgentina } from "@/lib/daily-close/monthly-summary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Cierre automático diario (Vercel Cron).
 * Procesa el día actual en hora Argentina (corte operativo de fin de jornada).
 *
 * Requiere header: Authorization: Bearer <CRON_SECRET>
 * (Vercel lo envía automáticamente si CRON_SECRET está configurado).
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const date = todayInArgentina();
  const startedAt = Date.now();

  try {
    const supabase = createAdminClient();
    const result = await generateDailyOccupancySnapshot(supabase, date);

    const logPayload = {
      source: "cron",
      date: result.date,
      ok: result.ok,
      durationMs: Date.now() - startedAt,
      rowsWritten: result.ok ? result.rowsWritten : undefined,
      rowsDeleted: result.ok ? result.rowsDeleted : undefined,
      occupiedPositions: result.ok ? result.occupiedPositions : undefined,
      mixedPositions: result.ok ? result.mixedPositions : undefined,
      diagnostics: result.diagnostics,
      error: result.ok ? undefined : result.error,
    };

    if (result.ok) {
      console.log("[daily-close/cron]", JSON.stringify(logPayload));
    } else {
      console.error("[daily-close/cron]", JSON.stringify(logPayload));
    }

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          date: result.date,
          error: result.error,
          diagnostics: result.diagnostics,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      date: result.date,
      rowsWritten: result.rowsWritten,
      rowsDeleted: result.rowsDeleted,
      occupiedPositions: result.occupiedPositions,
      mixedPositions: result.mixedPositions,
      diagnostics: result.diagnostics,
      source: "cron",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado";
    console.error(
      "[daily-close/cron]",
      JSON.stringify({
        source: "cron",
        date,
        ok: false,
        durationMs: Date.now() - startedAt,
        error: message,
      })
    );
    return NextResponse.json(
      { ok: false, date, error: message },
      { status: 500 }
    );
  }
}
