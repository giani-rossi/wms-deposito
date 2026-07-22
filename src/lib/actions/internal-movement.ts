"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, isStaff } from "@/lib/auth";
import { isFinalStoragePosition } from "@/lib/constants";
import {
  classifyMoveDestination,
  moveDestinationOverrideRequiredMessage,
} from "@/lib/movements/classify-move-destination";
import { internalMoveSchema } from "@/lib/validation/internal-movement";

type ActionResult = { ok: boolean; error?: string };

function revalidateAfterMove(params: {
  positionIds: string[];
  clientId: string;
  inboundOrderId?: string | null;
}) {
  revalidatePath("/movimientos");
  revalidatePath("/mapa");
  revalidatePath("/posiciones");
  revalidatePath(`/clientes/${params.clientId}`);
  for (const pid of params.positionIds) {
    revalidatePath(`/posiciones/${pid}`);
  }
  if (params.inboundOrderId) {
    revalidatePath(`/ordenes-ingreso/${params.inboundOrderId}`);
  }
}

/** Cantidad física asociada a la unidad logística (movimiento de ubicación inicial). */
async function quantityForLogisticUnit(
  supabase: ReturnType<typeof createClient>,
  logisticUnitId: string
): Promise<number> {
  const { data } = await supabase
    .from("movements")
    .select("quantity")
    .eq("logistic_unit_id", logisticUnitId)
    .eq("movement_type", "location_assignment")
    .order("date_time", { ascending: false })
    .limit(1)
    .maybeSingle();
  const q = data?.quantity != null ? Number(data.quantity) : 1;
  return q > 0 ? q : 1;
}

/**
 * Mueve una unidad logística ubicada de un rack a otro rack.
 * Registra movement `internal_movement`. No genera servicio facturable (MVP).
 * No recalcula estados de posición (permanecen manuales).
 */
export async function moveLogisticUnitAction(
  input: unknown
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { ok: false, error: "No tenés permisos para mover unidades." };
  }

  const parsed = internalMoveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors[0]?.message ?? "Datos inválidos",
    };
  }
  const { logistic_unit_id, to_position_id, notes, override } = parsed.data;

  const supabase = createClient();

  const { data: unit } = await supabase
    .from("logistic_units")
    .select(
      "id, code, client_id, inbound_order_id, type, status, current_position_id"
    )
    .eq("id", logistic_unit_id)
    .single();

  if (!unit) {
    return { ok: false, error: "Unidad logística no encontrada." };
  }
  if (unit.status !== "located") {
    return {
      ok: false,
      error: "Solo se pueden mover unidades en estado ubicada.",
    };
  }
  if (!unit.current_position_id) {
    return {
      ok: false,
      error: "La unidad no tiene posición actual registrada.",
    };
  }
  if (unit.current_position_id === to_position_id) {
    return {
      ok: false,
      error: "La posición destino es la misma que la actual.",
    };
  }

  const [{ data: fromPos }, { data: toPos }] = await Promise.all([
    supabase
      .from("positions")
      .select("id, code, type, status")
      .eq("id", unit.current_position_id)
      .single(),
    supabase
      .from("positions")
      .select("id, code, type, status, assigned_client_id")
      .eq("id", to_position_id)
      .single(),
  ]);

  if (!fromPos) {
    return { ok: false, error: "Posición origen no encontrada." };
  }
  if (!toPos) {
    return { ok: false, error: "Posición destino no encontrada." };
  }
  if (!isFinalStoragePosition(fromPos.type)) {
    return {
      ok: false,
      error:
        "Solo se pueden mover unidades desde rack o piso guardado.",
    };
  }
  if (!isFinalStoragePosition(toPos.type)) {
    return {
      ok: false,
      error:
        "El movimiento interno solo permite destino en rack o piso guardado.",
    };
  }

  const { data: occupants } = await supabase
    .from("logistic_units")
    .select("client_id")
    .eq("current_position_id", to_position_id)
    .eq("status", "located");

  const occupantClientIds = (occupants ?? []).map((o) => o.client_id);

  const destination = classifyMoveDestination({
    position: {
      code: toPos.code,
      status: toPos.status,
      assigned_client_id: toPos.assigned_client_id,
    },
    unitClientId: unit.client_id,
    occupantClientIds,
  });

  if (destination.requiresOverride && !override) {
    return {
      ok: false,
      error: `${moveDestinationOverrideRequiredMessage(destination)} Requiere confirmación de staff (override).`,
    };
  }

  if (destination.requiresOverride && override && !notes) {
    return {
      ok: false,
      error:
        "Debés ingresar una nota obligatoria para confirmar este movimiento.",
    };
  }

  const quantity = await quantityForLogisticUnit(supabase, unit.id);

  let movementNotes = notes ?? "Movimiento interno entre posiciones";
  if (override && destination.overrideNoteFragments.length > 0) {
    movementNotes += ` · ${destination.overrideNoteFragments.join(" · ")}`;
  }

  const { error: moveErr } = await supabase.from("movements").insert({
    movement_type: "internal_movement",
    logistic_unit_id: unit.id,
    client_id: unit.client_id,
    inbound_order_id: unit.inbound_order_id,
    user_id: profile.id,
    quantity,
    from_position_id: unit.current_position_id,
    to_position_id,
    notes: movementNotes,
  });
  if (moveErr) {
    return { ok: false, error: moveErr.message };
  }

  const { error: updateErr } = await supabase
    .from("logistic_units")
    .update({ current_position_id: to_position_id })
    .eq("id", unit.id);
  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  revalidateAfterMove({
    positionIds: [unit.current_position_id, to_position_id],
    clientId: unit.client_id,
    inboundOrderId: unit.inbound_order_id,
  });

  return { ok: true };
}
