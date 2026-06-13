import { createClient } from "@/lib/supabase/server";
import { receivedUnitRequiresProcessing } from "@/lib/constants";
import type { ReceivedUnitType } from "@/lib/types/database";
import {
  buildProcessableUnit,
  type ProcessableUnit,
  type ProcessableUnitContent,
} from "@/lib/processing/processable-unit";

export async function loadProcessableUnitsForOrders(
  orderIds: string[]
): Promise<ProcessableUnit[]> {
  if (orderIds.length === 0) return [];

  const supabase = createClient();

  const [{ data: openOrders }, { data: clients }] = await Promise.all([
    supabase
      .from("inbound_orders")
      .select("id, client_id, remittance_number")
      .in("id", orderIds),
    supabase.from("clients").select("id, nombre"),
  ]);

  const clientMap = new Map((clients ?? []).map((c) => [c.id, c.nombre]));
  const orderMap = new Map((openOrders ?? []).map((o) => [o.id, o]));

  const [{ data: units }, { data: movements }] = await Promise.all([
    supabase
      .from("received_units")
      .select(
        "id, code, display_label, type, inbound_order_id, client_id, physical_quantity, processed_at, requires_classification, requires_desconsolidation, requires_assembly, requires_repackaging"
      )
      .in("inbound_order_id", orderIds)
      .is("processed_at", null),
    supabase
      .from("movements")
      .select("received_unit_id, quantity, movement_type")
      .in("inbound_order_id", orderIds)
      .eq("movement_type", "location_assignment"),
  ]);

  const locatedByRU = new Map<string, number>();
  for (const m of movements ?? []) {
    if (!m.received_unit_id) continue;
    locatedByRU.set(
      m.received_unit_id,
      (locatedByRU.get(m.received_unit_id) ?? 0) + (Number(m.quantity) || 0)
    );
  }

  const candidateIds = (units ?? [])
    .filter(
      (u) =>
        receivedUnitRequiresProcessing(u) &&
        (locatedByRU.get(u.id) ?? 0) === 0
    )
    .map((u) => u.id);

  const { data: contents } = candidateIds.length
    ? await supabase
        .from("received_unit_contents")
        .select("received_unit_id, product_id, quantity, unit_of_measure")
        .in("received_unit_id", candidateIds)
    : { data: [] as never[] };

  const productIds = [...new Set((contents ?? []).map((c) => c.product_id))];
  const { data: products } = productIds.length
    ? await supabase.from("products").select("id, name, sku").in("id", productIds)
    : { data: [] as { id: string; name: string; sku: string | null }[] };

  const productMap = new Map((products ?? []).map((p) => [p.id, p]));
  const contentsByUnit = new Map<string, ProcessableUnitContent[]>();

  for (const row of contents ?? []) {
    const product = productMap.get(row.product_id);
    const line: ProcessableUnitContent = {
      product_id: row.product_id,
      name: product?.name ?? "Producto",
      sku: product?.sku ?? null,
      unit_of_measure: row.unit_of_measure,
      quantity: Number(row.quantity),
    };
    const arr = contentsByUnit.get(row.received_unit_id) ?? [];
    arr.push(line);
    contentsByUnit.set(row.received_unit_id, arr);
  }

  return (units ?? [])
    .filter((u) => candidateIds.includes(u.id))
    .map((u) => {
      const order = orderMap.get(u.inbound_order_id);
      return buildProcessableUnit({
        unit: { ...u, type: u.type as ReceivedUnitType },
        clientName: clientMap.get(u.client_id) ?? "—",
        orderLabel: order?.remittance_number ?? "Ver orden",
        contents: contentsByUnit.get(u.id) ?? [],
      });
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}
