import Link from "next/link";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireClientViewer } from "@/lib/portal/auth";
import { formatDate, orDash } from "@/lib/format";
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
  return query ? `/cliente/stock/export?${query}` : "/cliente/stock/export";
}

export default async function ClienteStockPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  await requireClientViewer();
  const q = (searchParams.q ?? "").trim().toLowerCase();

  const supabase = createClient();
  const { data: rows } = await supabase
    .from("client_portal_stock")
    .select(
      "client_id, client_name, client_tax_id, logistic_unit_id, logistic_unit_code, entry_date, product_id, product_name, sku, quantity, unit_of_measure, status_label"
    )
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Mi stock</h2>
          <p className="text-sm text-muted-foreground">
            Stock disponible en depósito (sin ubicación exacta).
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
              placeholder="Buscar por producto, SKU o unidad logística…"
              defaultValue={searchParams.q ?? ""}
              className="max-w-md"
            />
            <Button type="submit" variant="secondary" size="sm">
              Filtrar
            </Button>
          </form>

          {filtered.length === 0 ? (
            <EmptyState
              title="Sin stock"
              description={
                q
                  ? "No hay resultados para el filtro aplicado."
                  : "No hay stock registrado para tu cuenta."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Unidad logística</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead>Ingreso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow key={`${row.logistic_unit_id}-${row.product_id}`}>
                      <TableCell className="font-medium">
                        {row.product_name}
                      </TableCell>
                      <TableCell>{orDash(row.sku)}</TableCell>
                      <TableCell>{row.logistic_unit_code}</TableCell>
                      <TableCell>{row.status_label}</TableCell>
                      <TableCell className="text-right">
                        {row.quantity}
                        {row.unit_of_measure ? ` ${row.unit_of_measure}` : ""}
                      </TableCell>
                      <TableCell>{formatDate(row.entry_date)}</TableCell>
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
