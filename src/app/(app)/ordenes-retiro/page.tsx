import Link from "next/link";
import { PackageMinus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, orDash } from "@/lib/format";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";
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
import { OutboundStatusBadge } from "@/components/status-badges";

export const dynamic = "force-dynamic";

export default async function OrdenesRetiroPage() {
  const supabase = createClient();

  const [{ data: orders }, { data: clients }] = await Promise.all([
    supabase
      .from("outbound_orders")
      .select("*")
      .order("date_time", { ascending: false })
      .limit(100),
    supabase.from("clients").select("id, nombre"),
  ]);

  const clientMap = new Map((clients ?? []).map((c) => [c.id, c.nombre]));
  const rows = orders ?? [];

  const listado =
    rows.length > 0 ? (
      <Card>
        <CardContent className="pt-6">
          <p className="mb-4 text-sm text-muted-foreground">
            Órdenes existentes en el sistema (solo lectura hasta que el módulo
            esté operativo).
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDateTime(o.date_time)}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/clientes/${o.client_id}`}
                      className="font-medium hover:underline"
                    >
                      {clientMap.get(o.client_id) ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell>{orDash(o.document_number)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {orDash(o.destination)}
                  </TableCell>
                  <TableCell>
                    <OutboundStatusBadge status={o.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    ) : (
      <Card>
        <CardContent className="pt-6">
          <EmptyState
            icon={PackageMinus}
            title="Sin órdenes de retiro"
            description="Cuando el módulo esté operativo podrás crear retiros, asignar picking FIFO y registrar la carga de camión."
          />
        </CardContent>
      </Card>
    );

  return (
    <ModulePlaceholder
      title="Órdenes de retiro"
      description="Salida de mercadería, picking y carga de camión"
      status="phase2"
      nextStep="El flujo completo (alta, validación, picking FIFO, preparación y carga) se implementará en fase 2. El ítem queda visible en el menú para ubicar el módulo en la operación."
    >
      {listado}
    </ModulePlaceholder>
  );
}
