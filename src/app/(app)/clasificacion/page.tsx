import Link from "next/link";
import { SplitSquareVertical } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  RECEIVED_UNIT_TYPE_LABELS,
  receivedUnitRequiresProcessing,
} from "@/lib/constants";
import type { ContentStatus, ReceivedUnitType } from "@/lib/types/database";
import { PageHeader } from "@/components/layout/page-header";
import { ModuleStatusBanner } from "@/components/layout/module-status-banner";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ContentStatusBadge } from "@/components/status-badges";

export const dynamic = "force-dynamic";

function processingLabels(u: {
  requires_classification: boolean;
  requires_desconsolidation: boolean;
  requires_assembly: boolean;
  requires_repackaging: boolean;
}): string[] {
  const labels: string[] = [];
  if (u.requires_classification) labels.push("Clasificación");
  if (u.requires_desconsolidation) labels.push("Desconsolidación");
  if (u.requires_assembly) labels.push("Armado");
  if (u.requires_repackaging) labels.push("Reembalaje");
  return labels;
}

export default async function ClasificacionPage() {
  const supabase = createClient();

  const [{ data: openOrders }, { data: clients }] = await Promise.all([
    supabase
      .from("inbound_orders")
      .select("id, client_id, remittance_number, status")
      .neq("status", "closed"),
    supabase.from("clients").select("id, nombre"),
  ]);

  const clientMap = new Map((clients ?? []).map((c) => [c.id, c.nombre]));
  const orderMap = new Map((openOrders ?? []).map((o) => [o.id, o]));
  const orderIds = [...orderMap.keys()];

  let pendingUnits: Array<{
    id: string;
    code: string;
    type: ReceivedUnitType;
    inbound_order_id: string;
    content_status: ContentStatus;
    physical_quantity: number;
    requires_classification: boolean;
    requires_desconsolidation: boolean;
    requires_assembly: boolean;
    requires_repackaging: boolean;
  }> = [];

  if (orderIds.length > 0) {
    const { data: units } = await supabase
      .from("received_units")
      .select(
        "id, code, type, inbound_order_id, content_status, physical_quantity, requires_classification, requires_desconsolidation, requires_assembly, requires_repackaging"
      )
      .in("inbound_order_id", orderIds);

    pendingUnits = (units ?? [])
      .filter(receivedUnitRequiresProcessing)
      .map((u) => ({
        ...u,
        type: u.type as ReceivedUnitType,
        content_status: u.content_status as ContentStatus,
        physical_quantity: Number(u.physical_quantity),
      }));
  }

  return (
    <>
      <PageHeader
        title="Clasificación"
        description="Transformar unidades recibidas en unidades logísticas"
      />

      <div className="space-y-6">
        <ModuleStatusBanner
          status="next"
          message="Próximo módulo a desarrollar. Mientras tanto, las unidades con procesamiento pendiente se gestionan desde cada orden de ingreso; acá ves el backlog de referencia."
        />

        <Card>
          <CardContent className="pt-6">
            {pendingUnits.length === 0 ? (
              <EmptyState
                icon={SplitSquareVertical}
                title="Sin unidades pendientes de procesamiento"
                description="Cuando marques flags de clasificación, desconsolidación, armado o reembalaje en una unidad recibida, aparecerán acá como referencia."
              />
            ) : (
              <>
                <p className="mb-4 text-sm text-muted-foreground">
                  {pendingUnits.length} unidad
                  {pendingUnits.length === 1 ? "" : "es"} en órdenes abiertas con
                  procesamiento pendiente.
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Unidad</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Orden</TableHead>
                      <TableHead>Procesamiento</TableHead>
                      <TableHead>Contenido</TableHead>
                      <TableHead className="text-right">Cant.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingUnits.map((u) => {
                      const order = orderMap.get(u.inbound_order_id);
                      const flags = processingLabels(u);
                      return (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{u.code}</TableCell>
                          <TableCell>
                            {order?.client_id
                              ? clientMap.get(order.client_id) ?? "—"
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {order ? (
                              <Link
                                href={`/ordenes-ingreso/${order.id}`}
                                className="hover:underline"
                              >
                                {order.remittance_number ?? "Ver orden"}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {flags.map((f) => (
                                <Badge key={f} variant="secondary">
                                  {f}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <ContentStatusBadge status={u.content_status} />
                          </TableCell>
                          <TableCell className="text-right">
                            {u.physical_quantity}{" "}
                            <span className="text-muted-foreground">
                              {RECEIVED_UNIT_TYPE_LABELS[u.type]}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
