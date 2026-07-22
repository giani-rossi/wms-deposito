"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, isStaff } from "@/lib/auth";
import { refreshInboundLocationStatus } from "@/lib/actions/inbound-location-status";
import { BILLING_UNIT_BY_LOGISTIC_TYPE, isFinalStoragePosition } from "@/lib/constants";
import { locateReadyLogisticUnitSchema } from "@/lib/validation/inbound";
import type { PositionStatus } from "@/lib/types/database";

type ActionResult = { ok: boolean; error?: string };

const FLOOR_INBOUND_CODE = "FLOOR-INBOUND-01";

/**
 * Ubica una unidad logística en `ready_to_locate` (típicamente resultante de
 * clasificación/procesamiento) desde piso ingreso hacia un rack.
 * Reutiliza las mismas validaciones de destino que la ubicación desde UR.
 */
export async function locateReadyLogisticUnitAction(
  input: unknown
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { ok: false, error: "No tenés permisos para ubicar mercadería." };
  }

  const parsed = locateReadyLogisticUnitSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors[0]?.message ?? "Datos inválidos",
    };
  }

  const { logistic_unit_id, destination: dest } = parsed.data;
  const supabase = createClient();

  const { data: unit } = await supabase
    .from("logistic_units")
    .select(
      "id, code, client_id, inbound_order_id, received_unit_id, parent_logistic_unit_id, type, status, current_position_id"
    )
    .eq("id", logistic_unit_id)
    .single();

  if (!unit) {
    return { ok: false, error: "Unidad logística no encontrada." };
  }
  if (unit.status !== "ready_to_locate") {
    return {
      ok: false,
      error: "Solo se pueden ubicar unidades logísticas en estado listas para ubicar.",
    };
  }
  if (!unit.received_unit_id && !unit.parent_logistic_unit_id) {
    return {
      ok: false,
      error:
        "Esta unidad logística no proviene de un procesamiento de ingreso ni de un fraccionamiento.",
    };
  }

  const { data: floor } = await supabase
    .from("positions")
    .select("id")
    .eq("code", FLOOR_INBOUND_CODE)
    .maybeSingle();

  if (!floor?.id) {
    return {
      ok: false,
      error: `No existe la posición operativa ${FLOOR_INBOUND_CODE}.`,
    };
  }
  if (unit.current_position_id !== floor.id) {
    return {
      ok: false,
      error: `La unidad debe estar en ${FLOOR_INBOUND_CODE} antes de ubicarse en rack.`,
    };
  }

  const { data: pos } = await supabase
    .from("positions")
    .select("id, code, type, assigned_client_id, status")
    .eq("id", dest.position_id)
    .single();
  if (!pos) {
    return { ok: false, error: "Posición destino no encontrada." };
  }
  if (!isFinalStoragePosition(pos.type)) {
    return {
      ok: false,
      error: "El destino debe ser una posición de rack o piso guardado.",
    };
  }

  const { data: occupants } = await supabase
    .from("logistic_units")
    .select("client_id")
    .eq("current_position_id", dest.position_id)
    .eq("status", "located");

  const hasOtherClient =
    (pos.assigned_client_id != null &&
      pos.assigned_client_id !== unit.client_id) ||
    (occupants ?? []).some((o) => o.client_id !== unit.client_id);
  const isBlocked = pos.status === "blocked" || pos.status === "incident";

  let overrideNote = "";
  if (isBlocked) {
    if (!dest.override) {
      return {
        ok: false,
        error:
          "La posición está bloqueada o en revisión. Requiere confirmación (override) para ubicar.",
      };
    }
    overrideNote += " · Override: ubicada en posición bloqueada/en revisión";
  }
  if (hasOtherClient) {
    if (!dest.override) {
      return {
        ok: false,
        error:
          "La posición tiene mercadería de otro cliente. Requiere confirmación (override) para mezclar clientes.",
      };
    }
    overrideNote += " · Override: mezcla de clientes en la misma posición";
  }

  if (!pos.assigned_client_id && dest.assign_to_client) {
    await supabase
      .from("client_position_assignments")
      .update({ released_at: new Date().toISOString() })
      .eq("position_id", dest.position_id)
      .is("released_at", null);
    await supabase.from("client_position_assignments").insert({
      position_id: dest.position_id,
      client_id: unit.client_id,
      created_by: profile.id,
      notes: "Asignada al ubicar mercadería",
    });
    await supabase
      .from("positions")
      .update({ assigned_client_id: unit.client_id })
      .eq("id", dest.position_id);
  }

  const billingUnit = BILLING_UNIT_BY_LOGISTIC_TYPE[unit.type];
  const quantity = 1;

  const { data: service } = await supabase
    .from("billable_services")
    .insert({
      client_id: unit.client_id,
      service_type: "location_assignment",
      quantity,
      unit: billingUnit,
      inbound_order_id: unit.inbound_order_id,
      status: "pending_billing",
      notes: `Asignación de ubicación (${unit.code})`,
    })
    .select("id")
    .single();

  const { error: moveErr } = await supabase.from("movements").insert({
    movement_type: "location_assignment",
    received_unit_id: unit.received_unit_id,
    logistic_unit_id: unit.id,
    client_id: unit.client_id,
    inbound_order_id: unit.inbound_order_id,
    user_id: profile.id,
    quantity,
    from_position_id: floor.id,
    to_position_id: dest.position_id,
    billable_service_id: service?.id ?? null,
    notes: `Ubicación de ${unit.code} desde piso ingreso` + overrideNote,
  });
  if (moveErr) {
    return { ok: false, error: moveErr.message };
  }

  const { error: updateErr } = await supabase
    .from("logistic_units")
    .update({
      status: "located",
      current_position_id: dest.position_id,
    })
    .eq("id", unit.id);
  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  let newStatus: PositionStatus | null = null;
  if (dest.final_status === "partially_occupied" || dest.final_status === "occupied") {
    newStatus = dest.final_status;
  } else if (pos.status === "free") {
    newStatus = "partially_occupied";
  }
  if (newStatus && newStatus !== pos.status) {
    await supabase
      .from("positions")
      .update({ status: newStatus })
      .eq("id", dest.position_id);
  }

  if (unit.inbound_order_id) {
    await refreshInboundLocationStatus(supabase, unit.inbound_order_id);
    revalidatePath(`/ordenes-ingreso/${unit.inbound_order_id}`);
  }

  revalidatePath("/posiciones");
  revalidatePath("/mapa");
  revalidatePath("/unidades-logisticas");
  revalidatePath("/clasificacion");
  return { ok: true };
}
