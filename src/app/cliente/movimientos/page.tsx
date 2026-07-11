import Link from "next/link";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireClientViewer } from "@/lib/portal/auth";
import { mapMovementTypeToClientLabel } from "@/lib/portal/movement-labels";
import { formatDateTime, orDash } from "@/lib/format";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

function buildExportHref(q: string) {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  const query = params.toString();
  return query ? `/cliente/movimientos/export?${query}` : "/cliente/movimientos/export";
}

export default async function ClienteMovimientosPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  await requireClientViewer();
  const q = (searchParams.q ?? "").trim().toLowerCase();

  const supabase = createClient();
  const { data: rows } = await supabase
    .from("client_portal_movements")
    .select(
      "id, date_time, client_id, movement_type, quantity, sku, product_name, logistic_unit_code"
    )
    .order("date_time", { ascending: false })
    .limit(500);

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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Movimientos</h2>
          <p className="text-sm text-muted-foreground">
            Historial de ingresos, movimientos y egresos de tu mercadería.
          </p>
        </div>
        <Link
          href={buildExportHref(q)}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Download className="mr-2 h-4 w-4" />
          Descargar CSV
        </Link>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              name="q"
              placeholder="Buscar por producto, SKU, unidad o tipo…"
              defaultValue={searchParams.q ?? ""}
              className="max-w-md"
            />
            <Button type="submit" variant="secondary" size="sm">
              Filtrar
            </Button>
          </form>

          {filtered.length === 0 ? (
            <EmptyState
              title="Sin movimientos"
              description={
                q
                  ? "No hay resultados para el filtro aplicado."
                  : "Aún no hay movimientos registrados."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Unidad logística</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{formatDateTime(row.date_time)}</TableCell>
                      <TableCell>
                        {mapMovementTypeToClientLabel(row.movement_type)}
                      </TableCell>
                      <TableCell>{orDash(row.product_name)}</TableCell>
                      <TableCell>{orDash(row.sku)}</TableCell>
                      <TableCell>{orDash(row.logistic_unit_code)}</TableCell>
                      <TableCell className="text-right">{row.quantity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
