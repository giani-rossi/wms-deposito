import Link from "next/link";
import { Package } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { ModuleStatusBanner } from "@/components/layout/module-status-banner";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { orDash } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProductosPage() {
  const supabase = createClient();
  const [{ data: products }, { data: clients }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku, unit_of_measure, client_id, created_at")
      .order("name"),
    supabase.from("clients").select("id, nombre"),
  ]);

  const clientMap = new Map((clients ?? []).map((c) => [c.id, c.nombre]));
  const rows = products ?? [];

  return (
    <>
      <PageHeader
        title="Productos"
        description="Catálogo de productos/SKU por cliente"
      />

      <div className="space-y-6">
        <ModuleStatusBanner
          status="preview"
          message="Mostramos el catálogo existente (incluye productos creados al cargar contenido en ingresos). El ABM completo de productos se implementará en fase 2."
        />

        <Card>
          <CardContent className="pt-6">
            {rows.length === 0 ? (
              <EmptyState
                icon={Package}
                title="Sin productos en el catálogo"
                description="Los productos se crean al cargar contenido en una orden de ingreso, o cuando se implemente el alta manual."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Unidad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link
                          href={`/clientes/${p.client_id}`}
                          className="font-medium hover:underline"
                        >
                          {clientMap.get(p.client_id) ?? "—"}
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {orDash(p.sku)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {orDash(p.unit_of_measure)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
