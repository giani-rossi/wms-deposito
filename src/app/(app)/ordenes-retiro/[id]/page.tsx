import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, Calendar, FileText, Hash } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isStaff } from "@/lib/auth";
import {
  MOVEMENT_TYPE_LABELS,
  BILLABLE_SERVICE_TYPE_LABELS,
  LOGISTIC_UNIT_TYPE_LABELS,
  OUTBOUND_ORDER_STATUS_LABELS,
  positionPrimaryLabel,
} from "@/lib/constants";
import { formatDate, formatDateTime, orDash } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Tabs } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  OutboundStatusBadge,
  BillableStatusBadge,
  LogisticUnitStatusBadge,
} from "@/components/status-badges";
import type {
  OutboundOrderLineStatus,
  OutboundOrderStatus,
} from "@/lib/types/database";
import {
  OutboundOrderActions,
  AddUnitButton,
  RemoveUnitButton,
} from "../_components/outbound-order-actions";

export const dynamic = "force-dynamic";

const FLOOR_OUTBOUND_CODE = "FLOOR-OUTBOUND-01";
const TERMINAL: OutboundOrderStatus[] = ["closed", "loaded"];

const LINE_STATUS_LABELS: Record<OutboundOrderLineStatus, string> = {
  pending: "Pendiente",
  prepared: "Preparada",
  loaded: "Cargada",
  cancelled: "Cancelada",
};

type ContentSummary = { label: string; quantity: number; unit: string | null };

function formatContentSummary(items: ContentSummary[]): string {
  if (!items.length) return "Sin contenido";
  return items
    .map((i) => `${i.label}: ${i.quantity}${i.unit ? ` ${i.unit}` : ""}`)
    .join(" · ");
}

export default async function OrdenRetiroFichaPage({
  params,
}: {
  params: { id: string };
}) {
  const id = params.id;
  const profile = await getCurrentProfile();
  const staff = profile ? isStaff(profile.role) : false;

  const supabase = createClient();
  const { data: order } = await supabase
    .from("outbound_orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!order) notFound();

  const [{ data: client }, { data: lines }, { data: movements }, { data: services }] =
    await Promise.all([
      supabase.from("clients").select("id, nombre").eq("id", order.client_id).single(),
      supabase
        .from("outbound_order_logistic_units")
        .select("*")
        .eq("outbound_order_id", id)
        .order("created_at"),
      supabase
        .from("movements")
        .select("*")
        .eq("outbound_order_id", id)
        .in("movement_type", ["outbound_preparation", "outbound_loaded"])
        .order("date_time", { ascending: false }),
      supabase
        .from("billable_services")
        .select("*")
        .eq("outbound_order_id", id)
        .order("date", { ascending: false }),
    ]);

  const lineRows = lines ?? [];
  const lineUnitIds = lineRows.map((l) => l.logistic_unit_id);

  const { data: lineUnits } = lineUnitIds.length
    ? await supabase
        .from("logistic_units")
        .select("id, code, status, type, current_position_id")
        .in("id", lineUnitIds)
    : { data: [] };

  const lineUnitMap = new Map((lineUnits ?? []).map((u) => [u.id, u]));

  const { data: activeReserved } = await supabase
    .from("outbound_order_logistic_units")
    .select("logistic_unit_id")
    .in("line_status", ["pending", "prepared"]);

  const reservedIds = new Set(
    (activeReserved ?? [])
      .map((r) => r.logistic_unit_id)
      .filter((uid) => !lineUnitIds.includes(uid))
  );

  const { data: candidateUnits } = await supabase
    .from("logistic_units")
    .select("id, code, status, type, current_position_id")
    .eq("client_id", order.client_id)
    .eq("is_available", true)
    .in("status", ["located", "in_floor_outbound"]);

  const candidateIds = (candidateUnits ?? [])
    .filter((u) => !reservedIds.has(u.id) && !lineUnitIds.includes(u.id))
    .map((u) => u.id);

  const positionIds = [
    ...new Set(
      [...(lineUnits ?? []), ...(candidateUnits ?? [])]
        .map((u) => u.current_position_id)
        .filter(Boolean) as string[]
    ),
  ];

  const { data: positions } = positionIds.length
    ? await supabase.from("positions").select("id, code, type").in("id", positionIds)
    : { data: [] };

  const posMap = new Map((positions ?? []).map((p) => [p.id, p]));

  const [{ data: lineContentsRaw }, { data: candidateContentsRaw }] =
    await Promise.all([
      lineUnitIds.length
        ? supabase
            .from("logistic_unit_contents")
            .select("logistic_unit_id, product_id, quantity, unit_of_measure")
            .in("logistic_unit_id", lineUnitIds)
            .neq("status", "exited")
            .gt("quantity", 0)
        : Promise.resolve({ data: [] as { logistic_unit_id: string; product_id: string; quantity: number; unit_of_measure: string | null }[] }),
      candidateIds.length
        ? supabase
            .from("logistic_unit_contents")
            .select("logistic_unit_id, product_id, quantity, unit_of_measure")
            .in("logistic_unit_id", candidateIds)
            .neq("status", "exited")
            .gt("quantity", 0)
        : Promise.resolve({ data: [] as { logistic_unit_id: string; product_id: string; quantity: number; unit_of_measure: string | null }[] }),
    ]);

  const productIds = [
    ...new Set(
      [...(lineContentsRaw ?? []), ...(candidateContentsRaw ?? [])].map(
        (r) => r.product_id
      )
    ),
  ];

  const { data: products } = productIds.length
    ? await supabase.from("products").select("id, name, sku").in("id", productIds)
    : { data: [] };

  const productMap = new Map((products ?? []).map((p) => [p.id, p]));

  function buildContentMap(
    rows: {
      logistic_unit_id: string;
      product_id: string;
      quantity: number;
      unit_of_measure: string | null;
    }[]
  ) {
    const map = new Map<string, ContentSummary[]>();
    for (const row of rows) {
      const product = productMap.get(row.product_id);
      const list = map.get(row.logistic_unit_id) ?? [];
      list.push({
        label: product
          ? `${product.name}${product.sku ? ` (${product.sku})` : ""}`
          : "Producto",
        quantity: Number(row.quantity),
        unit: row.unit_of_measure,
      });
      map.set(row.logistic_unit_id, list);
    }
    return map;
  }

  const contentsByUnit = buildContentMap(lineContentsRaw ?? []);
  const candidateContentMap = buildContentMap(candidateContentsRaw ?? []);

  const eligibleUnits = (candidateUnits ?? []).filter((unit) => {
    if (!candidateContentMap.has(unit.id)) return false;
    const pos = unit.current_position_id
      ? posMap.get(unit.current_position_id)
      : null;
    if (unit.status === "located") {
      return pos?.type === "rack";
    }
    if (unit.status === "in_floor_outbound") {
      return pos?.code === FLOOR_OUTBOUND_CODE;
    }
    return false;
  });

  const counts = {
    pending: lineRows.filter((l) => l.line_status === "pending").length,
    prepared: lineRows.filter((l) => l.line_status === "prepared").length,
    loaded: lineRows.filter((l) => l.line_status === "loaded").length,
  };

  const editable = staff && !TERMINAL.includes(order.status);

  const tabs = [
    {
      id: "resumen",
      label: "Resumen",
      content: (
        <div className="space-y-6">
          <Card>
            <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <Hash className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Documento</p>
                  <p className="font-medium">{orDash(order.document_number)}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Building2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Cliente</p>
                  <Link
                    href={`/clientes/${order.client_id}`}
                    className="font-medium hover:underline"
                  >
                    {client?.nombre ?? "—"}
                  </Link>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Fecha solicitada</p>
                  <p className="font-medium">
                    {order.requested_date ? formatDate(order.requested_date) : "—"}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Creada</p>
                  <p className="font-medium">{formatDateTime(order.date_time)}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 sm:col-span-2">
                <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Notas</p>
                  <p className="whitespace-pre-wrap text-sm">
                    {orDash(order.notes)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <OutboundOrderActions
            orderId={order.id}
            status={order.status}
            staff={staff}
            counts={counts}
          />
        </div>
      ),
    },
    {
      id: "unidades",
      label: "Unidades a retirar",
      content: (
        <Card>
          <CardContent className="pt-6">
            {lineRows.filter((l) => l.line_status !== "cancelled").length === 0 ? (
              <EmptyState
                title="Sin unidades asignadas"
                description="Agregá unidades logísticas desde la pestaña Stock disponible."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>UL</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Estado UL</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead>Contenido</TableHead>
                    <TableHead>Línea</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineRows
                    .filter((l) => l.line_status !== "cancelled")
                    .map((line) => {
                      const unit = lineUnitMap.get(line.logistic_unit_id);
                      const pos = unit?.current_position_id
                        ? posMap.get(unit.current_position_id)
                        : null;
                      return (
                        <TableRow key={line.id}>
                          <TableCell className="font-medium">
                            {unit?.code ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {unit?.type
                              ? LOGISTIC_UNIT_TYPE_LABELS[unit.type]
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {unit?.status ? (
                              <LogisticUnitStatusBadge status={unit.status} />
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {pos ? positionPrimaryLabel(pos.code) : "—"}
                          </TableCell>
                          <TableCell className="max-w-xs text-sm text-muted-foreground">
                            {formatContentSummary(
                              contentsByUnit.get(line.logistic_unit_id) ?? []
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {LINE_STATUS_LABELS[line.line_status]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {editable && line.line_status === "pending" && (
                              <RemoveUnitButton
                                orderId={order.id}
                                lineId={line.id}
                                staff={staff}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ),
    },
    {
      id: "stock",
      label: "Stock disponible",
      content: (
        <Card>
          <CardContent className="pt-6">
            {!editable ? (
              <p className="text-sm text-muted-foreground">
                La orden está cerrada o cargada; no se pueden agregar unidades.
              </p>
            ) : eligibleUnits.length === 0 ? (
              <EmptyState
                title="Sin stock elegible"
                description="No hay unidades del cliente en rack o piso retiro disponibles para esta orden."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>UL</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Contenido</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eligibleUnits.map((unit) => {
                    const pos = unit.current_position_id
                      ? posMap.get(unit.current_position_id)
                      : null;
                    return (
                      <TableRow key={unit.id}>
                        <TableCell className="font-medium">{unit.code}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {pos ? positionPrimaryLabel(pos.code) : "—"}
                        </TableCell>
                        <TableCell>
                          <LogisticUnitStatusBadge status={unit.status} />
                        </TableCell>
                        <TableCell className="max-w-md text-sm text-muted-foreground">
                          {formatContentSummary(
                            candidateContentMap.get(unit.id) ?? []
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <AddUnitButton
                            orderId={order.id}
                            logisticUnitId={unit.id}
                            staff={staff}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ),
    },
    {
      id: "movimientos",
      label: "Movimientos",
      content: (
        <Card>
          <CardContent className="pt-6">
            {!movements?.length ? (
              <EmptyState title="Sin movimientos" description="Aún no hay preparación ni salida registrada." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Notas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{formatDateTime(m.date_time)}</TableCell>
                      <TableCell>{MOVEMENT_TYPE_LABELS[m.movement_type]}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {orDash(m.notes)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ),
    },
    {
      id: "servicios",
      label: "Servicios facturables",
      content: (
        <Card>
          <CardContent className="pt-6">
            {!services?.length ? (
              <EmptyState
                title="Sin servicios"
                description="Se generará carga de camión al confirmar la salida."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Servicio</TableHead>
                    <TableHead>Cantidad</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{formatDate(s.date)}</TableCell>
                      <TableCell>
                        {BILLABLE_SERVICE_TYPE_LABELS[s.service_type]}
                      </TableCell>
                      <TableCell>
                        {s.quantity}
                        {s.unit ? ` ${s.unit}` : ""}
                      </TableCell>
                      <TableCell>
                        <BillableStatusBadge status={s.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={orDash(order.document_number)}
        description={`Orden de retiro · ${OUTBOUND_ORDER_STATUS_LABELS[order.status]}`}
      >
        <Link href="/ordenes-retiro" className={buttonVariants({ variant: "outline" })}>
          Volver al listado
        </Link>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <OutboundStatusBadge status={order.status} />
        <Badge variant="secondary">{counts.pending + counts.prepared + counts.loaded} ULs</Badge>
      </div>

      <Tabs tabs={tabs} defaultTab="resumen" />
    </>
  );
}
