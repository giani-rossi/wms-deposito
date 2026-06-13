import type { createClient } from "@/lib/supabase/server";
import type { InboundOrderStatus } from "@/lib/types/database";

type SupabaseClient = ReturnType<typeof createClient>;

/** Cantidad ya ubicada de una unidad recibida (suma de location_assignment). */
export async function locatedQtyForReceivedUnit(
  supabase: SupabaseClient,
  receivedUnitId: string
): Promise<number> {
  const { data } = await supabase
    .from("movements")
    .select("quantity")
    .eq("received_unit_id", receivedUnitId)
    .eq("movement_type", "location_assignment");
  return (data ?? []).reduce((acc, m) => acc + (Number(m.quantity) || 0), 0);
}

async function allChildLogisticUnitsLocated(
  supabase: SupabaseClient,
  receivedUnitId: string
): Promise<boolean> {
  const { data: children } = await supabase
    .from("logistic_units")
    .select("status")
    .eq("received_unit_id", receivedUnitId);
  if (!children || children.length === 0) return false;
  return children.every((c) => c.status === "located");
}

/**
 * Recalcula el estado de la orden según cuánto se ubicó:
 *  - UR procesadas: todas sus UL hijas deben estar `located`
 *  - UR directas: cantidad ubicada = physical_quantity y sin flags pendientes
 */
export async function refreshInboundLocationStatus(
  supabase: SupabaseClient,
  orderId: string
): Promise<void> {
  const { data: units } = await supabase
    .from("received_units")
    .select(
      "id, physical_quantity, processed_at, requires_classification, requires_desconsolidation, requires_assembly, requires_repackaging"
    )
    .eq("inbound_order_id", orderId);

  if (!units || units.length === 0) return;

  let allLocated = true;
  for (const u of units) {
    if (u.processed_at) {
      if (!(await allChildLogisticUnitsLocated(supabase, u.id))) {
        allLocated = false;
      }
      continue;
    }

    const requiresProcessing =
      u.requires_classification ||
      u.requires_desconsolidation ||
      u.requires_assembly ||
      u.requires_repackaging;
    const located = await locatedQtyForReceivedUnit(supabase, u.id);
    if (requiresProcessing || located < Number(u.physical_quantity)) {
      allLocated = false;
    }
  }

  const { data: order } = await supabase
    .from("inbound_orders")
    .select("status")
    .eq("id", orderId)
    .single();
  if (!order) return;

  const current = order.status as InboundOrderStatus;
  if (allLocated) {
    if (current !== "located" && current !== "closed") {
      await supabase
        .from("inbound_orders")
        .update({ status: "located" })
        .eq("id", orderId);
    }
    return;
  }

  const beforeLocate: InboundOrderStatus[] = [
    "pending_download",
    "downloaded",
    "pending_validation",
    "pending_classification",
    "partially_classified",
  ];
  if (beforeLocate.includes(current)) {
    await supabase
      .from("inbound_orders")
      .update({ status: "ready_to_locate" })
      .eq("id", orderId);
  }
}
