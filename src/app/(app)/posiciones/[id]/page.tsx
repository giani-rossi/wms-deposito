import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Pencil,
  Boxes,
  Package,
  ArrowLeftRight,
  Truck,
  History,
  Building2,
  ArrowDownToLine,
  ArrowUpFromLine,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isStaff } from "@/lib/auth";
import {
  POSITION_TYPE_LABELS,
  MOVEMENT_TYPE_LABELS,
  SIDE_LABELS,
  LEVEL_LABELS,
  describeRackPosition,
  positionPrimaryLabel,
} from "@/lib/constants";
import { formatDate, formatDateTime, orDash } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Tabs } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  PositionStatusBadge,
  StockStatusBadge,
  LogisticUnitStatusBadge,
  InboundStatusBadge,
  OutboundStatusBadge,
} from "@/components/status-badges";
import { DeletePositionButton } from "../_components/delete-position-button";
import { PositionControls } from "../_components/position-controls";

export const dynamic = "force-dynamic";

export default async function PosicionFichaPage({
  params,
}: {
  params: { id: string };
}) {
  const id = params.id;
  const profile = await getCurrentProfile();
  const staff = profile ? isStaff(profile.role) : false;

  const supabase = createClient();
  const { data: position } = await supabase
    .from("positions")
    .select("*")
    .eq("id", id)
    .single();

  if (!position) notFound();

  const [
    { data: units },
    { data: stock },
    { data: movements },
    { data: assignments },
    { data: clients },
  ] = await Promise.all([
    supabase
      .from("logistic_units")
      .select("*")
      .eq("current_position_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("stock_by_position").select("*").eq("position_id", id),
    supabase
      .from("movements")
      .select("*")
      .or(`from_position_id.eq.${id},to_position_id.eq.${id}`)
      .order("date_time", { ascending: false })
      .limit(100),
    supabase
      .from("client_position_assignments")
      .select("*")
      .eq("position_id", id)
      .order("assigned_at", { ascending: false }),
    supabase.from("clients").select("id, nombre").order("nombre"),
  ]);

  const clientMap = new Map((clients ?? []).map((c) => [c.id, c.nombre]));
  const assignedClientName = position.assigned_client_id
    ? clientMap.get(position.assigned_client_id) ?? null
    : null;

  // Resolver códigos de posición para las columnas desde/hacia de movimientos
  const movementRows = movements ?? [];
  const otherPositionIds = Array.from(
    new Set(
      movementRows
        .flatMap((m) => [m.from_position_id, m.to_position_id])
        .filter((v): v is string => Boolean(v) && v !== id)
    )
  );
  const posCodeMap = new Map<string, string>([[id, position.code]]);
  if (otherPositionIds.length > 0) {
    const { data: otherPos } = await supabase
      .from("positions")
      .select("id, code")
      .in("id", otherPositionIds);
    for (const p of otherPos ?? []) posCodeMap.set(p.id, p.code);
  }

  // Órdenes relacionadas (a partir de movimientos y unidades en la posición)
  const inboundIds = Array.from(
    new Set(
      [
        ...movementRows.map((m) => m.inbound_order_id),
        ...(units ?? []).map((u) => u.inbound_order_id),
      ].filter((v): v is string => Boolean(v))
    )
  );
  const outboundIds = Array.from(
    new Set(
      movementRows
        .map((m) => m.outbound_order_id)
        .filter((v): v is string => Boolean(v))
    )
  );

  const [{ data: inboundOrders }, { data: outboundOrders }] = await Promise.all([
    inboundIds.length
      ? supabase.from("inbound_orders").select("*").in("id", inboundIds)
      : Promise.resolve({ data: [] as never[] }),
    outboundIds.length
      ? supabase.from("outbound_orders").select("*").in("id", outboundIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const stockRows = stock ?? [];
  const unitRows = units ?? [];
  const assignmentRows = assignments ?? [];
  const relatedOrdersCount =
    (inboundOrders?.length ?? 0) + (outboundOrders?.length ?? 0);

  // ----- Tab: Resumen -----
  const resumen = (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <PositionStatusBadge status={position.status} />
            <Badge variant="secondary">
              {POSITION_TYPE_LABELS[position.type]}
            </Badge>
            {assignedClientName && (
              <Badge variant="outline" className="gap-1">
                <Building2 className="h-3 w-3" />
                {assignedClientName}
              </Badge>
            )}
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <InfoRow label="Código" value={position.code} />
            <InfoRow label="Tipo" value={POSITION_TYPE_LABELS[position.type]} />
            <InfoRow label="Estado" value={undefined}>
              <PositionStatusBadge status={position.status} />
            </InfoRow>
            <InfoRow label="Columna" value={orDash(position.column_letter)} />
            <InfoRow
              label="Lado"
              value={position.side ? SIDE_LABELS[position.side] : "—"}
            />
            <InfoRow
              label="Nivel"
              value={
                position.level
                  ? LEVEL_LABELS[position.level] ?? position.level
                  : "—"
              }
            />
            <InfoRow
              label="Ubicación"
              value={describeRackPosition(
                position.column_letter,
                position.side,
                position.level
              )}
            />
            <InfoRow
              label="Cliente asignado"
              value={assignedClientName ?? "—"}
            />
          </div>

          {(position.capacity_notes || position.occupancy_notes) && (
            <>
              <Separator />
              <div className="space-y-3 text-sm">
                {position.capacity_notes && (
                  <div>
                    <p className="font-medium">Notas de capacidad</p>
                    <p className="text-muted-foreground">
                      {position.capacity_notes}
                    </p>
                  </div>
                )}
                {position.occupancy_notes && (
                  <div>
                    <p className="font-medium">Notas de ocupación</p>
                    <p className="text-muted-foreground">
                      {position.occupancy_notes}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {staff && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Gestión de la posición
            </h3>
            <PositionControls
              positionId={position.id}
              status={position.status}
              assignedClientId={position.assigned_client_id}
              assignedClientName={assignedClientName}
              clients={clients ?? []}
              canAssignClient={position.type === "rack"}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );

  // ----- Tab: Unidades logísticas -----
  const unidadesTab =
    unitRows.length > 0 ? (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Ingreso</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {unitRows.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.code}</TableCell>
              <TableCell>{u.type}</TableCell>
              <TableCell className="text-muted-foreground">
                {orDash(clientMap.get(u.client_id))}
              </TableCell>
              <TableCell>
                <LogisticUnitStatusBadge status={u.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(u.entry_date)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    ) : (
      <EmptyState
        icon={Package}
        title="Sin unidades logísticas"
        description="No hay unidades logísticas ubicadas actualmente en esta posición."
      />
    );

  // ----- Tab: Productos -----
  const productosTab =
    stockRows.length > 0 ? (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Producto</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead>Unidad logística</TableHead>
            <TableHead className="text-right">Cantidad</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Ingreso</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stockRows.map((s) => (
            <TableRow key={`${s.logistic_unit_id}-${s.product_id}`}>
              <TableCell className="font-medium">{s.product_name}</TableCell>
              <TableCell className="text-muted-foreground">
                {orDash(s.sku)}
              </TableCell>
              <TableCell>{s.logistic_unit_code}</TableCell>
              <TableCell className="text-right">
                {Number(s.quantity)} {s.unit_of_measure ?? ""}
              </TableCell>
              <TableCell>
                <StockStatusBadge status={s.stock_status} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(s.entry_date)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    ) : (
      <EmptyState
        icon={Boxes}
        title="Sin productos"
        description="No hay stock de productos asociado a esta posición."
      />
    );

  // ----- Tab: Movimientos -----
  const movimientosTab =
    movementRows.length > 0 ? (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Desde</TableHead>
            <TableHead>Hacia</TableHead>
            <TableHead className="text-right">Cantidad</TableHead>
            <TableHead>Notas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movementRows.map((m) => (
            <TableRow key={m.id}>
              <TableCell>{formatDateTime(m.date_time)}</TableCell>
              <TableCell>
                <Badge variant="secondary">
                  {MOVEMENT_TYPE_LABELS[m.movement_type]}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {m.from_position_id
                  ? positionPrimaryLabel(posCodeMap.get(m.from_position_id))
                  : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {m.to_position_id
                  ? positionPrimaryLabel(posCodeMap.get(m.to_position_id))
                  : "—"}
              </TableCell>
              <TableCell className="text-right">
                {m.quantity != null ? Number(m.quantity) : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {orDash(m.notes)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    ) : (
      <EmptyState
        icon={ArrowLeftRight}
        title="Sin movimientos"
        description="Todavía no hay movimientos que entren o salgan de esta posición."
      />
    );

  // ----- Tab: Órdenes relacionadas -----
  const ordenesTab =
    relatedOrdersCount > 0 ? (
      <div className="space-y-6">
        {inboundOrders && inboundOrders.length > 0 && (
          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ArrowDownToLine className="h-4 w-4" /> Órdenes de ingreso
            </h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Remito</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inboundOrders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>{formatDateTime(o.date_time)}</TableCell>
                    <TableCell className="font-medium">
                      {orDash(o.remittance_number)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {orDash(clientMap.get(o.client_id))}
                    </TableCell>
                    <TableCell>
                      <InboundStatusBadge status={o.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {outboundOrders && outboundOrders.length > 0 && (
          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ArrowUpFromLine className="h-4 w-4" /> Órdenes de retiro
            </h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outboundOrders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>{formatDateTime(o.date_time)}</TableCell>
                    <TableCell className="font-medium">
                      {orDash(o.document_number)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {orDash(clientMap.get(o.client_id))}
                    </TableCell>
                    <TableCell>
                      <OutboundStatusBadge status={o.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    ) : (
      <EmptyState
        icon={Truck}
        title="Sin órdenes relacionadas"
        description="Acá aparecen las órdenes de ingreso/retiro vinculadas a los movimientos de esta posición."
      />
    );

  // ----- Tab: Historial de asignaciones -----
  const asignacionesTab =
    assignmentRows.length > 0 ? (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Asignada</TableHead>
            <TableHead>Liberada</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Notas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assignmentRows.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-medium">
                {orDash(clientMap.get(a.client_id))}
              </TableCell>
              <TableCell>{formatDateTime(a.assigned_at)}</TableCell>
              <TableCell className="text-muted-foreground">
                {a.released_at ? formatDateTime(a.released_at) : "—"}
              </TableCell>
              <TableCell>
                {a.released_at ? (
                  <Badge variant="outline" className="text-muted-foreground">
                    Cerrada
                  </Badge>
                ) : (
                  <Badge>Activa</Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {orDash(a.notes)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    ) : (
      <EmptyState
        icon={History}
        title="Sin historial de asignaciones"
        description="Esta posición todavía no fue asignada a ningún cliente."
      />
    );

  const tabs = [
    { id: "resumen", label: "Resumen", content: resumen },
    {
      id: "unidades",
      label: "Unidades logísticas",
      badge: unitRows.length,
      content: unidadesTab,
    },
    {
      id: "productos",
      label: "Productos",
      badge: stockRows.length,
      content: productosTab,
    },
    {
      id: "movimientos",
      label: "Movimientos",
      badge: movementRows.length,
      content: movimientosTab,
    },
    {
      id: "ordenes",
      label: "Órdenes relacionadas",
      badge: relatedOrdersCount,
      content: ordenesTab,
    },
    {
      id: "asignaciones",
      label: "Historial de asignaciones",
      badge: assignmentRows.length,
      content: asignacionesTab,
    },
  ];

  return (
    <>
      <PageHeader
        title={position.code}
        description={POSITION_TYPE_LABELS[position.type]}
      >
        <Link href="/posiciones" className={buttonVariants({ variant: "ghost" })}>
          Volver
        </Link>
        {staff && (
          <>
            <Link
              href={`/posiciones/${id}/editar`}
              className={buttonVariants({ variant: "outline" })}
            >
              <Pencil className="h-4 w-4" />
              Editar
            </Link>
            <DeletePositionButton
              positionId={id}
              redirectToList
              variant="destructive"
            />
          </>
        )}
      </PageHeader>

      <Tabs tabs={tabs} />
    </>
  );
}

function InfoRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      {children ?? <p className="text-sm font-medium">{orDash(value)}</p>}
    </div>
  );
}
