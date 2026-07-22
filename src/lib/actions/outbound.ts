"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, isStaff } from "@/lib/auth";
import { isFinalStoragePosition } from "@/lib/constants";
import type { OutboundOrderStatus } from "@/lib/types/database";
import {
  createOutboundOrderSchema,
  createOutboundOrderInputFromFormData,
  outboundOrderUnitSchema,
  outboundOrderIdSchema,
  removeOutboundLineSchema,
} from "@/lib/validation/outbound";

export type OutboundFormState = { error?: string; ok?: boolean } | undefined;

type ActionResult = { ok: boolean; error?: string };

const FLOOR_OUTBOUND_CODE = "FLOOR-OUTBOUND-01";

const TERMINAL_ORDER_STATUSES: OutboundOrderStatus[] = ["closed", "loaded"];

const BLOCKED_UNIT_STATUSES = [
  "blocked",
  "reserved",
  "partially_picked",
  "exited",
] as const;

function revalidateOutbound(orderId?: string) {
  revalidatePath("/ordenes-retiro");
  revalidatePath("/movimientos");
  revalidatePath("/servicios-facturables");
  revalidatePath("/mapa");
  revalidatePath("/posiciones");
  if (orderId) revalidatePath(`/ordenes-retiro/${orderId}`);
}

async function recomputeOutboundOrderStatus(
  supabase: ReturnType<typeof createClient>,
  orderId: string
) {
  const { data: order } = await supabase
    .from("outbound_orders")
    .select("status")
    .eq("id", orderId)
    .single();

  if (!order || TERMINAL_ORDER_STATUSES.includes(order.status)) return;

  const { data: lines } = await supabase
    .from("outbound_order_logistic_units")
    .select("line_status")
    .eq("outbound_order_id", orderId)
    .in("line_status", ["pending", "prepared"]);

  if (!lines?.length) {
    await supabase
      .from("outbound_orders")
      .update({ status: "pending_validation" })
      .eq("id", orderId);
    return;
  }

  const anyPending = lines.some((l) => l.line_status === "pending");
  const allPrepared = lines.every((l) => l.line_status === "prepared");

  let status: OutboundOrderStatus;
  if (allPrepared) {
    status = "ready_to_load";
  } else if (anyPending && lines.some((l) => l.line_status === "prepared")) {
    status = "in_preparation";
  } else {
    status = "pending_stock_assignment";
  }

  await supabase.from("outbound_orders").update({ status }).eq("id", orderId);
}

async function assertOrderEditable(
  supabase: ReturnType<typeof createClient>,
  orderId: string
) {
  const { data: order } = await supabase
    .from("outbound_orders")
    .select("id, status, client_id")
    .eq("id", orderId)
    .single();

  if (!order) {
    return { ok: false as const, error: "Orden de retiro no encontrada." };
  }
  if (TERMINAL_ORDER_STATUSES.includes(order.status)) {
    return {
      ok: false as const,
      error: "La orden está cerrada o cargada y no admite cambios.",
    };
  }
  return { ok: true as const, order };
}

async function validateEligibleLogisticUnit(
  supabase: ReturnType<typeof createClient>,
  logisticUnitId: string,
  clientId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: unit } = await supabase
    .from("logistic_units")
    .select("id, code, client_id, status, is_available, current_position_id")
    .eq("id", logisticUnitId)
    .single();

  if (!unit) {
    return { ok: false, error: "Unidad logística no encontrada." };
  }
  if (unit.client_id !== clientId) {
    return {
      ok: false,
      error: "La unidad logística pertenece a otro cliente.",
    };
  }
  if (!unit.is_available) {
    return { ok: false, error: "La unidad logística no está disponible." };
  }
  if (
    BLOCKED_UNIT_STATUSES.includes(
      unit.status as (typeof BLOCKED_UNIT_STATUSES)[number]
    )
  ) {
    return {
      ok: false,
      error: `La unidad está en estado ${unit.status} y no puede retirarse.`,
    };
  }
  if (unit.status !== "located" && unit.status !== "in_floor_outbound") {
    return {
      ok: false,
      error: "Solo se pueden retirar unidades ubicadas en rack o en piso retiro.",
    };
  }

  let pos: { id: string; code: string; type: string } | null = null;
  if (unit.current_position_id) {
    const { data } = await supabase
      .from("positions")
      .select("id, code, type")
      .eq("id", unit.current_position_id)
      .maybeSingle();
    pos = data;
  }

  if (unit.status === "located") {
    if (!pos || !isFinalStoragePosition(pos.type)) {
      return {
        ok: false,
        error:
          "La unidad ubicada debe estar en rack o piso guardado.",
      };
    }
  } else if (!pos || pos.code !== FLOOR_OUTBOUND_CODE) {
    return {
      ok: false,
      error: "La unidad en piso retiro debe estar en FLOOR-OUTBOUND-01.",
    };
  }

  const { count: contentCount } = await supabase
    .from("logistic_unit_contents")
    .select("id", { count: "exact", head: true })
    .eq("logistic_unit_id", logisticUnitId)
    .neq("status", "exited")
    .gt("quantity", 0);

  if (!contentCount) {
    return {
      ok: false,
      error: "La unidad logística no tiene contenido disponible.",
    };
  }

  const { count: activeLines } = await supabase
    .from("outbound_order_logistic_units")
    .select("id", { count: "exact", head: true })
    .eq("logistic_unit_id", logisticUnitId)
    .in("line_status", ["pending", "prepared"]);

  if (activeLines) {
    return {
      ok: false,
      error: "La unidad ya está asociada a otra orden de retiro activa.",
    };
  }

  return { ok: true };
}

export async function createOutboundOrderAction(
  _prev: OutboundFormState,
  formData: FormData
): Promise<OutboundFormState> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { error: "No tenés permisos para crear órdenes de retiro." };
  }

  const parsed = createOutboundOrderSchema.safeParse(
    createOutboundOrderInputFromFormData(formData)
  );
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const supabase = createClient();
  const { data: docCode, error: codeErr } = await supabase.rpc(
    "next_outbound_order_code"
  );
  if (codeErr || !docCode) {
    return { error: codeErr?.message ?? "No se pudo generar el número de orden." };
  }

  const { data, error } = await supabase
    .from("outbound_orders")
    .insert({
      client_id: parsed.data.client_id,
      requested_date: parsed.data.requested_date ?? null,
      notes: parsed.data.notes ?? null,
      document_number: docCode,
      status: "pending_validation",
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "No se pudo crear la orden." };
  }

  revalidateOutbound(data.id);
  redirect(`/ordenes-retiro/${data.id}`);
}

export async function addLogisticUnitToOutboundOrderAction(
  input: unknown
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { ok: false, error: "No tenés permisos." };
  }

  const parsed = outboundOrderUnitSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors[0]?.message ?? "Datos inválidos",
    };
  }

  const supabase = createClient();
  const editable = await assertOrderEditable(
    supabase,
    parsed.data.outbound_order_id
  );
  if (!editable.ok) return editable;

  const validation = await validateEligibleLogisticUnit(
    supabase,
    parsed.data.logistic_unit_id,
    editable.order.client_id
  );
  if (!validation.ok) return validation;

  const { data: unit } = await supabase
    .from("logistic_units")
    .select("status")
    .eq("id", parsed.data.logistic_unit_id)
    .single();

  const lineStatus = unit?.status === "in_floor_outbound" ? "prepared" : "pending";

  const { error } = await supabase.from("outbound_order_logistic_units").insert({
    outbound_order_id: parsed.data.outbound_order_id,
    logistic_unit_id: parsed.data.logistic_unit_id,
    line_status: lineStatus,
    prepared_at: lineStatus === "prepared" ? new Date().toISOString() : null,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "La unidad ya está asociada a otra orden de retiro activa.",
      };
    }
    return { ok: false, error: error.message };
  }

  await recomputeOutboundOrderStatus(supabase, parsed.data.outbound_order_id);
  revalidateOutbound(parsed.data.outbound_order_id);
  return { ok: true };
}

export async function removeLogisticUnitFromOutboundOrderAction(
  input: unknown
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { ok: false, error: "No tenés permisos." };
  }

  const parsed = removeOutboundLineSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors[0]?.message ?? "Datos inválidos",
    };
  }

  const supabase = createClient();
  const editable = await assertOrderEditable(
    supabase,
    parsed.data.outbound_order_id
  );
  if (!editable.ok) return editable;

  const { data: line } = await supabase
    .from("outbound_order_logistic_units")
    .select("id, line_status")
    .eq("id", parsed.data.line_id)
    .eq("outbound_order_id", parsed.data.outbound_order_id)
    .single();

  if (!line) {
    return { ok: false, error: "Línea no encontrada en la orden." };
  }
  if (line.line_status !== "pending") {
    return {
      ok: false,
      error: "Solo se pueden quitar unidades en estado pendiente.",
    };
  }

  const { error } = await supabase
    .from("outbound_order_logistic_units")
    .delete()
    .eq("id", parsed.data.line_id);

  if (error) return { ok: false, error: error.message };

  await recomputeOutboundOrderStatus(supabase, parsed.data.outbound_order_id);
  revalidateOutbound(parsed.data.outbound_order_id);
  return { ok: true };
}

export async function prepareOutboundOrderAction(
  input: unknown
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { ok: false, error: "No tenés permisos." };
  }

  const parsed = outboundOrderIdSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors[0]?.message ?? "Datos inválidos",
    };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("prepare_outbound_order", {
    p_order_id: parsed.data.outbound_order_id,
    p_user_id: profile.id,
  });

  if (error) return { ok: false, error: error.message };

  revalidateOutbound(parsed.data.outbound_order_id);
  return { ok: true };
}

export async function confirmOutboundLoadAction(
  input: unknown
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { ok: false, error: "No tenés permisos." };
  }

  const parsed = outboundOrderIdSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors[0]?.message ?? "Datos inválidos",
    };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("confirm_outbound_load", {
    p_order_id: parsed.data.outbound_order_id,
    p_user_id: profile.id,
  });

  if (error) return { ok: false, error: error.message };

  revalidateOutbound(parsed.data.outbound_order_id);
  return { ok: true };
}

export async function cancelOutboundOrderAction(
  input: unknown
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { ok: false, error: "No tenés permisos." };
  }

  const parsed = outboundOrderIdSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors[0]?.message ?? "Datos inválidos",
    };
  }

  const supabase = createClient();
  const { data: order } = await supabase
    .from("outbound_orders")
    .select("id, status, notes")
    .eq("id", parsed.data.outbound_order_id)
    .single();

  if (!order) {
    return { ok: false, error: "Orden de retiro no encontrada." };
  }
  if (TERMINAL_ORDER_STATUSES.includes(order.status)) {
    return { ok: false, error: "La orden ya está cerrada." };
  }

  const { count: blockedLines } = await supabase
    .from("outbound_order_logistic_units")
    .select("id", { count: "exact", head: true })
    .eq("outbound_order_id", parsed.data.outbound_order_id)
    .in("line_status", ["prepared", "loaded"]);

  if (blockedLines) {
    return {
      ok: false,
      error:
        "No se puede cancelar: hay unidades preparadas o ya cargadas. Retirá las pendientes primero o completá la salida.",
    };
  }

  const cancelNote = "Cancelada";
  const mergedNotes = order.notes?.trim()
    ? `${order.notes.trim()} · ${cancelNote}`
    : cancelNote;

  const { error: lineErr } = await supabase
    .from("outbound_order_logistic_units")
    .update({ line_status: "cancelled" })
    .eq("outbound_order_id", parsed.data.outbound_order_id)
    .eq("line_status", "pending");

  if (lineErr) return { ok: false, error: lineErr.message };

  const { error } = await supabase
    .from("outbound_orders")
    .update({ status: "closed", notes: mergedNotes })
    .eq("id", parsed.data.outbound_order_id);

  if (error) return { ok: false, error: error.message };

  revalidateOutbound(parsed.data.outbound_order_id);
  return { ok: true };
}
