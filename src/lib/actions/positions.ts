"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, isStaff } from "@/lib/auth";
import type { PositionStatus } from "@/lib/types/database";
import {
  positionSchema,
  positionInputFromFormData,
  bulkGenerateSchema,
  bulkGenerateInputFromFormData,
  buildBulkPositions,
  POSITION_STATUSES,
} from "@/lib/validation/position";
import {
  RACK_COLUMNS,
  POSITION_SIDES,
  POSITION_LEVELS,
  FLOOR_ZONE_CODE_REGEX,
  buildRackCode,
} from "@/lib/constants";

export type PositionFormState =
  | { error?: string; fieldErrors?: Record<string, string> }
  | undefined;

type ActionResult = { ok: boolean; error?: string };

function revalidatePosition(id?: string) {
  revalidatePath("/posiciones");
  revalidatePath("/mapa");
  if (id) revalidatePath(`/posiciones/${id}`);
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createPositionAction(
  _prev: PositionFormState,
  formData: FormData
): Promise<PositionFormState> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { error: "No tenés permisos para crear posiciones." };
  }

  const parsed = positionSchema.safeParse(positionInputFromFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("positions")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { error: `La posición ${parsed.data.code} ya existe.` };
    }
    return { error: error?.message ?? "No se pudo crear la posición." };
  }

  revalidatePosition();
  redirect(`/posiciones/${data.id}`);
}

/**
 * Alta rápida de una posición de rack (usada por el mapa al clickear una
 * celda "sin crear"). Devuelve el id creado para poder navegar a la ficha.
 */
export async function createRackPositionAction(
  column: string,
  side: string,
  level: string
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { ok: false, error: "No tenés permisos para crear posiciones." };
  }

  const col = column.toUpperCase();
  const sd = side.toUpperCase();
  const lv = level.toUpperCase();
  if (
    !(RACK_COLUMNS as readonly string[]).includes(col) ||
    !(POSITION_SIDES as readonly string[]).includes(sd) ||
    !(POSITION_LEVELS as readonly string[]).includes(lv)
  ) {
    return { ok: false, error: "Datos de posición inválidos." };
  }

  const code = buildRackCode(col, sd, lv);
  const supabase = createClient();
  const { data, error } = await supabase
    .from("positions")
    .insert({
      code,
      type: "rack",
      column_letter: col,
      side: sd,
      level: lv,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { ok: false, error: `La posición ${code} ya existe.` };
    }
    return { ok: false, error: error?.message ?? "No se pudo crear." };
  }

  revalidatePosition();
  return { ok: true, id: data.id };
}

export async function updatePositionAction(
  positionId: string,
  _prev: PositionFormState,
  formData: FormData
): Promise<PositionFormState> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { error: "No tenés permisos para editar posiciones." };
  }

  const parsed = positionSchema.safeParse(positionInputFromFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("positions")
    .update(parsed.data)
    .eq("id", positionId);

  if (error) {
    if (error.code === "23505") {
      return { error: `La posición ${parsed.data.code} ya existe.` };
    }
    return { error: error.message };
  }

  revalidatePosition(positionId);
  redirect(`/posiciones/${positionId}`);
}

/**
 * Elimina una posición SOLO si no tiene unidades, movimientos ni cliente
 * asignado (para no romper la trazabilidad).
 */
export async function deletePositionAction(
  positionId: string
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { ok: false, error: "No tenés permisos para eliminar posiciones." };
  }

  const supabase = createClient();

  const { data: pos } = await supabase
    .from("positions")
    .select("assigned_client_id")
    .eq("id", positionId)
    .single();

  if (pos?.assigned_client_id) {
    return {
      ok: false,
      error: "No se puede eliminar: la posición está asignada a un cliente. Liberala primero.",
    };
  }

  const checks = await Promise.all([
    supabase
      .from("logistic_units")
      .select("id", { count: "exact", head: true })
      .eq("current_position_id", positionId),
    supabase
      .from("received_units")
      .select("id", { count: "exact", head: true })
      .eq("current_position_id", positionId),
    supabase
      .from("movements")
      .select("id", { count: "exact", head: true })
      .or(`from_position_id.eq.${positionId},to_position_id.eq.${positionId}`),
  ]);

  const total = checks.reduce((acc, r) => acc + (r.count ?? 0), 0);
  if (total > 0) {
    return {
      ok: false,
      error:
        "No se puede eliminar: la posición tiene unidades o movimientos asociados.",
    };
  }

  const { error } = await supabase
    .from("positions")
    .delete()
    .eq("id", positionId);
  if (error) return { ok: false, error: error.message };

  revalidatePosition();
  return { ok: true };
}

/**
 * Limpieza segura de zonas operativas inválidas (datos de prueba).
 * Elimina posiciones que NO son rack y cuyo código no respeta la convención
 * controlada (FLOOR-INBOUND-01, FLOOR-OUTBOUND-01, FLOOR-INCIDENT-01, ...),
 * siempre que no tengan unidades, movimientos ni cliente asignado.
 */
export async function cleanupInvalidFloorZonesAction(): Promise<
  ActionResult & { eliminadas?: number; omitidas?: number }
> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { ok: false, error: "No tenés permisos para esta acción." };
  }

  const supabase = createClient();

  const { data: rows, error } = await supabase
    .from("positions")
    .select("id, code, type, assigned_client_id")
    .neq("type", "rack");
  if (error) return { ok: false, error: error.message };

  const invalid = (rows ?? []).filter(
    (p) => !FLOOR_ZONE_CODE_REGEX.test((p.code ?? "").toUpperCase())
  );

  let eliminadas = 0;
  let omitidas = 0;

  for (const pos of invalid) {
    if (pos.assigned_client_id) {
      omitidas += 1;
      continue;
    }
    const checks = await Promise.all([
      supabase
        .from("logistic_units")
        .select("id", { count: "exact", head: true })
        .eq("current_position_id", pos.id),
      supabase
        .from("received_units")
        .select("id", { count: "exact", head: true })
        .eq("current_position_id", pos.id),
      supabase
        .from("movements")
        .select("id", { count: "exact", head: true })
        .or(`from_position_id.eq.${pos.id},to_position_id.eq.${pos.id}`),
    ]);
    const total = checks.reduce((acc, r) => acc + (r.count ?? 0), 0);
    if (total > 0) {
      omitidas += 1;
      continue;
    }
    const { error: delErr } = await supabase
      .from("positions")
      .delete()
      .eq("id", pos.id);
    if (delErr) {
      omitidas += 1;
      continue;
    }
    eliminadas += 1;
  }

  revalidatePosition();
  return { ok: true, eliminadas, omitidas };
}

// ---------------------------------------------------------------------------
// Estado / bloqueo
// ---------------------------------------------------------------------------

export async function setPositionStatusAction(
  positionId: string,
  status: PositionStatus
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { ok: false, error: "No tenés permisos para cambiar el estado." };
  }
  if (!POSITION_STATUSES.includes(status)) {
    return { ok: false, error: "Estado inválido." };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("positions")
    .update({ status })
    .eq("id", positionId);

  if (error) return { ok: false, error: error.message };

  revalidatePosition(positionId);
  return { ok: true };
}

/** Bloquea (status=blocked) o desbloquea (status=free) una posición. */
export async function setPositionBlockedAction(
  positionId: string,
  blocked: boolean
): Promise<ActionResult> {
  return setPositionStatusAction(positionId, blocked ? "blocked" : "free");
}

// ---------------------------------------------------------------------------
// Asignación a cliente
// ---------------------------------------------------------------------------

/**
 * Asigna una posición a un cliente:
 *  - cierra la asignación activa anterior (released_at = now)
 *  - crea un registro activo en client_position_assignments
 *  - actualiza positions.assigned_client_id
 */
export async function assignPositionToClientAction(
  positionId: string,
  clientId: string,
  notes?: string | null
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { ok: false, error: "No tenés permisos para asignar posiciones." };
  }
  if (!clientId) {
    return { ok: false, error: "Seleccioná un cliente." };
  }

  const supabase = createClient();

  // Regla: solo las posiciones físicas de rack se asignan a un cliente. Las
  // zonas operativas de piso son temporales y compartidas.
  const { data: pos } = await supabase
    .from("positions")
    .select("type")
    .eq("id", positionId)
    .single();
  if (pos && pos.type !== "rack") {
    return {
      ok: false,
      error:
        "Las zonas operativas no se asignan a clientes. Solo las posiciones físicas de rack pueden asignarse.",
    };
  }

  const now = new Date().toISOString();

  // 1) Cerrar la asignación activa previa (si existía) para liberar el índice
  //    único parcial (una sola asignación activa por posición).
  const { error: closeErr } = await supabase
    .from("client_position_assignments")
    .update({ released_at: now })
    .eq("position_id", positionId)
    .is("released_at", null);
  if (closeErr) return { ok: false, error: closeErr.message };

  // 2) Crear la nueva asignación activa.
  const { error: insertErr } = await supabase
    .from("client_position_assignments")
    .insert({
      position_id: positionId,
      client_id: clientId,
      notes: notes?.trim() || null,
      created_by: profile.id,
    });
  if (insertErr) return { ok: false, error: insertErr.message };

  // 3) Reflejar el cliente asignado en la posición.
  const { error: posErr } = await supabase
    .from("positions")
    .update({ assigned_client_id: clientId })
    .eq("id", positionId);
  if (posErr) return { ok: false, error: posErr.message };

  revalidatePosition(positionId);
  return { ok: true };
}

/**
 * Libera una posición:
 *  - cierra la asignación activa (released_at = now)
 *  - setea positions.assigned_client_id = null
 *  - deja la posición en `free` o `blocked` según corresponda
 */
export async function releasePositionAction(
  positionId: string,
  finalStatus: "free" | "blocked" = "free"
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { ok: false, error: "No tenés permisos para liberar posiciones." };
  }

  const supabase = createClient();
  const now = new Date().toISOString();

  const { error: closeErr } = await supabase
    .from("client_position_assignments")
    .update({ released_at: now })
    .eq("position_id", positionId)
    .is("released_at", null);
  if (closeErr) return { ok: false, error: closeErr.message };

  const { error: posErr } = await supabase
    .from("positions")
    .update({ assigned_client_id: null, status: finalStatus })
    .eq("id", positionId);
  if (posErr) return { ok: false, error: posErr.message };

  revalidatePosition(positionId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Generación masiva
// ---------------------------------------------------------------------------

export async function bulkGeneratePositionsAction(
  _prev: PositionFormState,
  formData: FormData
): Promise<PositionFormState> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { error: "No tenés permisos para generar posiciones." };
  }

  const parsed = bulkGenerateSchema.safeParse(
    bulkGenerateInputFromFormData(formData)
  );
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const cells = buildBulkPositions(parsed.data);
  const supabase = createClient();

  // No pisar posiciones existentes: filtramos las que ya están por código.
  const codes = cells.map((c) => c.code);
  const { data: existing } = await supabase
    .from("positions")
    .select("code")
    .in("code", codes);

  const existingCodes = new Set((existing ?? []).map((r) => r.code));
  const toInsert = cells
    .filter((c) => !existingCodes.has(c.code))
    .map((c) => ({
      code: c.code,
      type: "rack" as const,
      column_letter: c.column_letter,
      side: c.side,
      level: c.level,
    }));

  const existentes = cells.length - toInsert.length;

  if (toInsert.length === 0) {
    return {
      error: `Todas las posiciones del rango ya existían (${cells.length}). No se generó ninguna nueva.`,
    };
  }

  const { error } = await supabase.from("positions").insert(toInsert);
  if (error) return { error: error.message };

  revalidatePosition();
  redirect(
    `/posiciones?generadas=${toInsert.length}&existentes=${existentes}`
  );
}
