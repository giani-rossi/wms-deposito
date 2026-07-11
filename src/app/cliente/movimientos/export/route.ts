import { createClient } from "@/lib/supabase/server";
import { requireClientViewer } from "@/lib/portal/auth";
import { csvDownloadResponse } from "@/lib/portal/csv";
import { logPortalAuditEvent } from "@/lib/portal/audit";
import { mapMovementTypeToClientLabel } from "@/lib/portal/movement-labels";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const HEADERS = [
  "fecha",
  "tipo",
  "producto",
  "sku",
  "unidad_logistica",
  "cantidad",
] as const;

export async function GET(request: Request) {
  const { profile, client } = await requireClientViewer();
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();

  const supabase = createClient();
  const { data: rows } = await supabase
    .from("client_portal_movements")
    .select("*")
    .order("date_time", { ascending: false })
    .limit(5000);

  const filtered = (rows ?? []).filter((row) => {
    if (!q) return true;
    const label = mapMovementTypeToClientLabel(row.movement_type);
    const haystack = [
      label,
      row.product_name,
      row.sku,
      row.logistic_unit_code,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  const csvRows = filtered.map((row) => [
    formatDateTime(row.date_time),
    mapMovementTypeToClientLabel(row.movement_type),
    row.product_name,
    row.sku,
    row.logistic_unit_code,
    row.quantity,
  ]);

  await logPortalAuditEvent({
    profileId: profile.id,
    clientId: client.id,
    eventType: "export_movements",
    metadata: { row_count: csvRows.length, filter: q || null },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return csvDownloadResponse(`movimientos-${stamp}.csv`, [...HEADERS], csvRows);
}
