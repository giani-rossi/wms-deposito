"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, isStaff } from "@/lib/auth";
import { splitLogisticUnitSchema } from "@/lib/validation/logistic-unit-split";

export type SplitLogisticUnitResult =
  | {
      ok: true;
      childId: string;
      childCode: string;
      destination: "relocate" | "outbound";
      parentExited: boolean;
      inboundOrderId: string | null;
    }
  | { ok: false; error: string };

/**
 * Fracciona stock de una UL ubicada en rack hacia una UL hija en piso ingreso
 * o piso retiro. Operación atómica vía RPC Postgres.
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
    .select("id, current_position_id, inbound_order_id")
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

  const { data, error } = await supabase.rpc("split_logistic_unit", {
    p_parent_unit_id: parsed.data.logistic_unit_id,
    p_user_id: profile.id,
    p_destination: parsed.data.destination,
    p_lines: positiveLines,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const result = data as {
    child_id?: string;
    child_code?: string;
    destination?: string;
    parent_exited?: boolean;
  } | null;

  if (!result?.child_id || !result.child_code) {
    return { ok: false, error: "No se pudo completar el fraccionamiento." };
  }

  const destination =
    result.destination === "outbound" ? "outbound" : "relocate";

  revalidatePath("/movimientos");
  revalidatePath("/mapa");
  revalidatePath("/posiciones");
  revalidatePath("/unidades-logisticas");
  if (parent.current_position_id) {
    revalidatePath(`/posiciones/${parent.current_position_id}`);
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
  };
}
