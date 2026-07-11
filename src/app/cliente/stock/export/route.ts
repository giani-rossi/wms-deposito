import { createClient } from "@/lib/supabase/server";
import { requireClientViewer } from "@/lib/portal/auth";
import { csvDownloadResponse } from "@/lib/portal/csv";
import { logPortalAuditEvent } from "@/lib/portal/audit";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const HEADERS = [
  "producto",
  "sku",
  "unidad_logistica",
  "estado",
  "cantidad",
  "unidad_medida",
  "fecha_ingreso",
] as const;

const STOCK_SELECT =
  "product_name, sku, logistic_unit_code, status_label, quantity, unit_of_measure, entry_date" as const;

export async function GET(request: Request) {
  const { profile, client } = await requireClientViewer();
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();

  const supabase = createClient();
  const { data: rows } = await supabase
    .from("client_portal_stock")
    .select(STOCK_SELECT)
    .order("product_name")
    .order("logistic_unit_code");

  const filtered = (rows ?? []).filter((row) => {
    if (!q) return true;
    const haystack = [
      row.product_name,
      row.sku,
      row.logistic_unit_code,
      row.status_label,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  const csvRows = filtered.map((row) => [
    row.product_name,
    row.sku,
    row.logistic_unit_code,
    row.status_label,
    row.quantity,
    row.unit_of_measure,
    formatDate(row.entry_date),
  ]);

  await logPortalAuditEvent({
    userId: profile.id,
    clientId: client.id,
    eventType: "stock_export",
    resource: "client_portal_stock",
    metadata: { format: "csv", row_count: csvRows.length },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return csvDownloadResponse(`stock-${stamp}.csv`, [...HEADERS], csvRows);
}
