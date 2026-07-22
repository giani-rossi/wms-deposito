import type { ServiceClient } from "./supabase-client";

export const SEED = {
  clientId: "c0000001-0000-0000-0000-000000000001",
  productId: "40000001-0000-0000-0000-000000000001",
  inboundOrderId: "10000001-0000-0000-0000-000000000001",
} as const;

export async function getPositionId(
  admin: ServiceClient,
  code: string
): Promise<string> {
  const { data, error } = await admin
    .from("positions")
    .select("id")
    .eq("code", code)
    .single();
  if (error || !data) throw error ?? new Error(`Posición ${code} no encontrada`);
  return data.id;
}

/** Asegura una posición FLOOR-STORAGE-XX para tests de piso guardado. */
export async function ensureFloorStoragePosition(
  admin: ServiceClient,
  code = "FLOOR-STORAGE-01"
): Promise<string> {
  const { data: existing } = await admin
    .from("positions")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data, error } = await admin
    .from("positions")
    .insert({ code, type: "floor_temporary", status: "free" })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error(`No se pudo crear ${code}`);
  return data.id;
}

export async function createLocatedUnit(
  admin: ServiceClient,
  opts: { quantity: number; rackCode?: string }
) {
  const rackCode = opts.rackCode ?? "R2-A-PISO";
  const rackId = await getPositionId(admin, rackCode);
  const { data: code, error: codeErr } = await admin.rpc(
    "next_logistic_unit_code"
  );
  if (codeErr || !code) throw codeErr ?? new Error("No se pudo generar código UL");

  const unitId = crypto.randomUUID();
  const { error: unitErr } = await admin.from("logistic_units").insert({
    id: unitId,
    code,
    client_id: SEED.clientId,
    inbound_order_id: SEED.inboundOrderId,
    type: "box",
    status: "located",
    current_position_id: rackId,
    is_available: true,
    entry_date: new Date().toISOString(),
  });
  if (unitErr) throw unitErr;

  const { data: content, error: contentErr } = await admin
    .from("logistic_unit_contents")
    .insert({
      logistic_unit_id: unitId,
      product_id: SEED.productId,
      quantity: opts.quantity,
      unit_of_measure: "unidad",
      status: "available",
    })
    .select("id, quantity")
    .single();
  if (contentErr || !content) throw contentErr ?? new Error("Sin contenido");

  return {
    unitId,
    contentId: content.id,
    rackId,
    rackCode,
    initialQuantity: Number(content.quantity),
  };
}

export async function deleteLogisticUnit(admin: ServiceClient, unitId: string) {
  await admin.from("movements").delete().eq("logistic_unit_id", unitId);
  await admin
    .from("outbound_order_logistic_units")
    .delete()
    .eq("logistic_unit_id", unitId);
  await admin
    .from("logistic_unit_contents")
    .delete()
    .eq("logistic_unit_id", unitId);
  await admin.from("logistic_units").delete().eq("id", unitId);
}

export async function createOutboundOrder(
  admin: ServiceClient,
  createdBy: string | null
) {
  const { data: documentNumber, error: codeErr } = await admin.rpc(
    "next_outbound_order_code"
  );
  if (codeErr || !documentNumber) {
    throw codeErr ?? new Error("No se pudo generar document_number");
  }

  const orderId = crypto.randomUUID();
  const { error } = await admin.from("outbound_orders").insert({
    id: orderId,
    client_id: SEED.clientId,
    document_number: documentNumber,
    status: "pending_validation",
    created_by: createdBy,
  });
  if (error) throw error;
  return orderId;
}

export async function deleteOutboundOrder(admin: ServiceClient, orderId: string) {
  await admin.from("billable_services").delete().eq("outbound_order_id", orderId);
  await admin.from("movements").delete().eq("outbound_order_id", orderId);
  await admin
    .from("outbound_order_logistic_units")
    .delete()
    .eq("outbound_order_id", orderId);
  await admin.from("outbound_orders").delete().eq("id", orderId);
}

export async function sumUnitQuantity(admin: ServiceClient, unitId: string) {
  const { data } = await admin
    .from("logistic_unit_contents")
    .select("quantity")
    .eq("logistic_unit_id", unitId)
    .neq("status", "exited");
  return (data ?? []).reduce((sum, row) => sum + Number(row.quantity), 0);
}

export async function addUnitToOutboundOrder(
  admin: ServiceClient,
  orderId: string,
  unitId: string,
  lineStatus: "pending" | "prepared"
) {
  const { error } = await admin.from("outbound_order_logistic_units").insert({
    outbound_order_id: orderId,
    logistic_unit_id: unitId,
    line_status: lineStatus,
    prepared_at: lineStatus === "prepared" ? new Date().toISOString() : null,
  });
  if (error) throw error;
}

export async function canCancelOutboundOrder(
  admin: ServiceClient,
  orderId: string
): Promise<boolean> {
  const { count } = await admin
    .from("outbound_order_logistic_units")
    .select("id", { count: "exact", head: true })
    .eq("outbound_order_id", orderId)
    .in("line_status", ["prepared", "loaded"]);
  return (count ?? 0) === 0;
}
