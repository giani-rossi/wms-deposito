"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, isStaff } from "@/lib/auth";
import {
  classifyMoveDestination,
  moveDestinationOverrideRequiredMessage,
} from "@/lib/movements/classify-move-destination";
import { splitLogisticUnitSchema } from "@/lib/validation/logistic-unit-split";

export type SplitDestination = "relocate" | "outbound" | "rack";

export type SplitLogisticUnitResult =
  | {
      ok: true;
      childId: string;
      childCode: string;
      destination: SplitDestination;
      parentExited: boolean;
      inboundOrderId: string | null;
      targetPositionCode: string | null;
    }
  | { ok: false; error: string };

/**
 * Fracciona stock de una UL ubicada en rack o piso guardado hacia una UL hija en
 * piso ingreso, piso retiro o rack directo. Operación atómica vía RPC Postgres.
 *
 * TODO: Permitir destino floor_temporary (FLOOR-STORAGE-XX) como almacenamiento
 * final, igual que rack. Hoy el destino "rack" y el RPC validan solo type=rack.
 */
export async function splitLogisticUnitAction(
  input: unknown
): Promise<SplitLogisticUnitResult> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { ok: false, error: "No tenés permisos para fraccionar unidades." };
  }

  const parsed = splitLogisticUnitSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors[0]?.message ?? "Datos inválidos",
    };
  }

  const supabase = createClient();

  const { data: parent } = await supabase
    .from("logistic_units")
    .select("id, client_id, current_position_id, inbound_order_id")
    .eq("id", parsed.data.logistic_unit_id)
    .maybeSingle();

  if (!parent) {
    return { ok: false, error: "Unidad logística origen no encontrada." };
  }

  const positiveLines = parsed.data.lines.filter((l) => l.quantity > 0);
  if (positiveLines.length === 0) {
    return {
      ok: false,
      error: "Debés indicar al menos una línea con cantidad mayor a cero.",
    };
  }

  if (parsed.data.destination === "rack") {
    const targetId = parsed.data.target_position_id;
    if (!targetId) {
      return { ok: false, error: "Elegí la posición rack destino." };
    }
    if (targetId === parent.current_position_id) {
      return {
        ok: false,
        error: "La posición destino es la misma que la actual.",
      };
    }

    const [{ data: targetPos }, { data: occupants }] = await Promise.all([
      supabase
        .from("positions")
        .select("id, code, type, status, assigned_client_id")
        .eq("id", targetId)
        .maybeSingle(),
      supabase
        .from("logistic_units")
        .select("client_id")
        .eq("current_position_id", targetId)
        .eq("status", "located"),
    ]);

    if (!targetPos || targetPos.type !== "rack") {
      // TODO: aceptar floor_temporary (FLOOR-STORAGE-XX) como destino final.
      return {
        ok: false,
        error: "El destino debe ser una posición de rack.",
      };
    }

    const classification = classifyMoveDestination({
      position: {
        code: targetPos.code,
        status: targetPos.status,
        assigned_client_id: targetPos.assigned_client_id,
      },
      unitClientId: parent.client_id,
      occupantClientIds: (occupants ?? []).map((o) => o.client_id),
    });

    if (classification.requiresOverride && !parsed.data.override) {
      return {
        ok: false,
        error: `${moveDestinationOverrideRequiredMessage(classification)} Requiere confirmación de staff (override).`,
      };
    }

    if (
      classification.requiresOverride &&
      parsed.data.override &&
      !parsed.data.notes
    ) {
      return {
        ok: false,
        error:
          "Debés ingresar una nota obligatoria para confirmar este fraccionamiento.",
      };
    }
  }

  const { data, error } = await supabase.rpc("split_logistic_unit", {
    p_parent_unit_id: parsed.data.logistic_unit_id,
    p_user_id: profile.id,
    p_destination: parsed.data.destination,
    p_lines: positiveLines,
    p_target_position_id:
      parsed.data.destination === "rack"
        ? parsed.data.target_position_id ?? null
        : null,
    p_override: parsed.data.override ?? false,
    p_notes: parsed.data.notes ?? null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const result = data as {
    child_id?: string;
    child_code?: string;
    destination?: string;
    parent_exited?: boolean;
    target_position_code?: string | null;
  } | null;

  if (!result?.child_id || !result.child_code) {
    return { ok: false, error: "No se pudo completar el fraccionamiento." };
  }

  const destination: SplitDestination =
    result.destination === "outbound"
      ? "outbound"
      : result.destination === "rack"
        ? "rack"
        : "relocate";

  revalidatePath("/movimientos");
  revalidatePath("/mapa");
  revalidatePath("/posiciones");
  revalidatePath("/unidades-logisticas");
  if (parent.current_position_id) {
    revalidatePath(`/posiciones/${parent.current_position_id}`);
  }
  if (
    parsed.data.destination === "rack" &&
    parsed.data.target_position_id
  ) {
    revalidatePath(`/posiciones/${parsed.data.target_position_id}`);
  }
  if (parent.inbound_order_id) {
    revalidatePath(`/ordenes-ingreso/${parent.inbound_order_id}`);
  }

  return {
    ok: true,
    childId: result.child_id,
    childCode: result.child_code,
    destination,
    parentExited: Boolean(result.parent_exited),
    inboundOrderId: parent.inbound_order_id,
    targetPositionCode: result.target_position_code ?? null,
  };
}
