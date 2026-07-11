import { createClient } from "@/lib/supabase/server";
import { requireClientViewer } from "@/lib/portal/auth";
import { csvDownloadResponse } from "@/lib/portal/csv";
import { logPortalAuditEvent } from "@/lib/portal/audit";
import { LOGISTIC_UNIT_TYPE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const HEADERS = [
  "producto",
  "sku",
  "unidad_logistica",
  "tipo_unidad",
  "cantidad",
  "unidad_medida",
  "lote",
  "fecha_ingreso",
] as const;

export async function GET(request: Request) {
  const { profile, client } = await requireClientViewer();
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();

  const supabase = createClient();
  const { data: rows } = await supabase
    .from("client_portal_stock")
    .select("*")
    .order("product_name")
    .order("logistic_unit_code");

  const filtered = (rows ?? []).filter((row) => {
    if (!q) return true;
    const haystack = [row.product_name, row.sku, row.logistic_unit_code]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  const csvRows = filtered.map((row) => [
    row.product_name,
    row.sku,
    row.logistic_unit_code,
    LOGISTIC_UNIT_TYPE_LABELS[row.logistic_unit_type],
    row.quantity,
    row.unit_of_measure,
    row.lot,
    formatDate(row.entry_date),
  ]);

  await logPortalAuditEvent({
    profileId: profile.id,
    clientId: client.id,
    eventType: "export_stock",
    metadata: { row_count: csvRows.length, filter: q || null },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return csvDownloadResponse(`stock-${stamp}.csv`, [...HEADERS], csvRows);
}
