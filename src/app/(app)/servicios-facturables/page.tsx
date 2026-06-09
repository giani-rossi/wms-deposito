import Link from "next/link";
import { Receipt } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  BILLABLE_SERVICE_STATUS_LABELS,
  BILLABLE_SERVICE_TYPE_LABELS,
} from "@/lib/constants";
import type {
  BillableServiceStatus,
  BillableServiceType,
} from "@/lib/types/database";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { ModuleStatusBanner } from "@/components/layout/module-status-banner";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BillableStatusBadge } from "@/components/status-badges";

export const dynamic = "force-dynamic";

const SERVICE_TYPES = Object.keys(
  BILLABLE_SERVICE_TYPE_LABELS
) as BillableServiceType[];
const SERVICE_STATUSES = Object.keys(
  BILLABLE_SERVICE_STATUS_LABELS
) as BillableServiceStatus[];

export default async function ServiciosFacturablesPage({
  searchParams,
}: {
  searchParams: { cliente?: string; estado?: string; tipo?: string };
}) {
  const cliente = (searchParams.cliente ?? "").trim();
  const estado = (searchParams.estado ?? "").trim();
  const tipo = (searchParams.tipo ?? "").trim();

  const supabase = createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, nombre")
    .order("nombre");
  const clientMap = new Map((clients ?? []).map((c) => [c.id, c.nombre]));

  let query = supabase
    .from("billable_services")
    .select("*")
    .order("date", { ascending: false })
    .limit(200);
  if (cliente) query = query.eq("client_id", cliente);
  if (estado) query = query.eq("status", estado as BillableServiceStatus);
  if (tipo) query = query.eq("service_type", tipo as BillableServiceType);

  const { data: services } = await query;
  const rows = services ?? [];

  return (
    <>
      <PageHeader
        title="Servicios facturables"
        description="Servicios generados por las operaciones del depósito"
      />

      <div className="space-y-6">
        <ModuleStatusBanner
          status="preview"
          message="Listado de servicios existentes. El cambio de estado de facturación, exportación y reglas avanzadas quedan para fase 2."
        />

        <Card>
          <CardContent className="pt-6">
            <form className="mb-6 flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label htmlFor="filtro-cliente">Cliente</Label>
                <Select
                  id="filtro-cliente"
                  name="cliente"
                  defaultValue={cliente}
                >
                  <option value="">Todos</option>
                  {(clients ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="filtro-tipo">Tipo</Label>
                <Select id="filtro-tipo" name="tipo" defaultValue={tipo}>
                  <option value="">Todos</option>
                  {SERVICE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {BILLABLE_SERVICE_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="filtro-estado">Estado</Label>
                <Select id="filtro-estado" name="estado" defaultValue={estado}>
                  <option value="">Todos</option>
                  {SERVICE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {BILLABLE_SERVICE_STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </div>
              <button type="submit" className={buttonVariants()}>
                Filtrar
              </button>
            </form>

            {rows.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="Sin servicios facturables"
                description="Los servicios se generan automáticamente al descargar camiones, ubicar mercadería y otras operaciones."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Servicio</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Orden</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{formatDate(s.date)}</TableCell>
                      <TableCell>
                        <Link
                          href={`/clientes/${s.client_id}`}
                          className="font-medium hover:underline"
                        >
                          {clientMap.get(s.client_id) ?? "—"}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {BILLABLE_SERVICE_TYPE_LABELS[s.service_type]}
                      </TableCell>
                      <TableCell className="text-right">
                        {Number(s.quantity)} {s.unit ?? ""}
                      </TableCell>
                      <TableCell>
                        <BillableStatusBadge status={s.status} />
                      </TableCell>
                      <TableCell>
                        {s.inbound_order_id ? (
                          <Link
                            href={`/ordenes-ingreso/${s.inbound_order_id}`}
                            className="text-sm hover:underline"
                          >
                            Ingreso
                          </Link>
                        ) : s.outbound_order_id ? (
                          <Link
                            href="/ordenes-retiro"
                            className="text-sm hover:underline"
                          >
                            Retiro
                          </Link>
                        ) : (
                          "—"
                        )}
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
