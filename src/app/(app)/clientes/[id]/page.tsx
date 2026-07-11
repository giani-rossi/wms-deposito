import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Pencil,
  Grid3x3,
  Boxes,
  Truck,
  PackageMinus,
  ArrowLeftRight,
  Receipt,
  AlertTriangle,
  Mail,
  Phone,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isStaff } from "@/lib/auth";
import { canManagePortalAccess, clientHasInvitableCuit } from "@/lib/portal/access";
import { listPortalAccessUsers } from "@/lib/actions/portal-access";
import {
  PICKING_STRATEGY_LABELS,
  POSITION_TYPE_LABELS,
  MOVEMENT_TYPE_LABELS,
  BILLABLE_SERVICE_TYPE_LABELS,
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
  InboundStatusBadge,
  OutboundStatusBadge,
  StockStatusBadge,
  BillableStatusBadge,
  ContentStatusBadge,
  LogisticUnitStatusBadge,
} from "@/components/status-badges";
import { DeleteClientButton } from "../_components/delete-client-button";
import { ToggleActiveButton } from "../_components/toggle-active-button";
import { PortalAccessSection } from "./_components/portal-access-section";

export const dynamic = "force-dynamic";

export default async function ClienteFichaPage({
  params,
}: {
  params: { id: string };
}) {
  const id = params.id;
  const profile = await getCurrentProfile();
  const staff = profile ? isStaff(profile.role) : false;
  const canManagePortal = profile ? canManagePortalAccess(profile.role) : false;

  const supabase = createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .single();

  if (!client) notFound();

  const portalUsers = canManagePortal ? await listPortalAccessUsers(id) : [];

  const [
    { data: positions },
    { data: stock },
    { data: inbound },
    { data: outbound },
    { data: movements },
    { data: services },
    { data: pendingUnits },
    { data: incidentUnits },
    productsCount,
  ] = await Promise.all([
    supabase
      .from("positions")
      .select("*")
      .eq("assigned_client_id", id)
      .order("code"),
    supabase.from("stock_by_position").select("*").eq("client_id", id),
    supabase
      .from("inbound_orders")
      .select("*")
      .eq("client_id", id)
      .order("date_time", { ascending: false }),
    supabase
      .from("outbound_orders")
      .select("*")
      .eq("client_id", id)
      .order("date_time", { ascending: false }),
    supabase
      .from("movements")
      .select("*")
      .eq("client_id", id)
      .order("date_time", { ascending: false })
      .limit(50),
    supabase
      .from("billable_services")
      .select("*")
      .eq("client_id", id)
      .order("date", { ascending: false }),
    supabase
      .from("received_units")
      .select("*")
      .eq("client_id", id)
      .or(
        "content_status.in.(incident,discrepancy),requires_classification.eq.true"
      ),
    supabase
      .from("logistic_units")
      .select("*")
      .eq("client_id", id)
      .eq("status", "in_incident"),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("client_id", id),
  ]);

  const stockRows = stock ?? [];
  const totalStock = stockRows.reduce((acc, r) => acc + Number(r.quantity), 0);
  const pendingBilling = (services ?? []).filter(
    (s) => s.status === "pending_billing"
  ).length;
  const incidentsTotal = (pendingUnits?.length ?? 0) + (incidentUnits?.length ?? 0);

  // ----- Tab: Resumen -----
  const resumen = (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardContent className="space-y-4 pt-6">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Datos de contacto
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoRow icon={User} label="Contacto" value={client.contact_name} />
            <InfoRow icon={Mail} label="Email" value={client.contact_email} />
            <InfoRow icon={Phone} label="Teléfono" value={client.contact_phone} />
            <InfoRow label="Razón social" value={client.razon_social} />
            <InfoRow label="CUIT / Tax ID" value={client.tax_id} />
            <InfoRow
              label="Picking por defecto"
              value={PICKING_STRATEGY_LABELS[client.default_picking_strategy]}
            />
          </div>

          <Separator />

          <div className="flex flex-wrap gap-2">
            <Badge variant={client.is_active === false ? "outline" : "default"}>
              {client.is_active === false ? "Inactivo" : "Activo"}
            </Badge>
          </div>

          {(client.operational_rules || client.billing_notes || client.notes) && (
            <>
              <Separator />
              <div className="space-y-3 text-sm">
                {client.operational_rules && (
                  <div>
                    <p className="font-medium">Reglas operativas</p>
                    <p className="text-muted-foreground">
                      {client.operational_rules}
                    </p>
                  </div>
                )}
                {client.billing_notes && (
                  <div>
                    <p className="font-medium">Notas de facturación</p>
                    <p className="text-muted-foreground">
                      {client.billing_notes}
                    </p>
                  </div>
                )}
                {client.notes && (
                  <div>
                    <p className="font-medium">Notas</p>
                    <p className="text-muted-foreground">{client.notes}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <MiniStat label="Posiciones" value={positions?.length ?? 0} icon={Grid3x3} />
        <MiniStat label="Productos" value={productsCount.count ?? 0} icon={Boxes} />
        <MiniStat label="Órdenes ingreso" value={inbound?.length ?? 0} icon={Truck} />
        <MiniStat
          label="Órdenes retiro"
          value={outbound?.length ?? 0}
          icon={PackageMinus}
        />
        <MiniStat
          label="Stock (u.)"
          value={totalStock}
          icon={Boxes}
        />
        <MiniStat
          label="Serv. a facturar"
          value={pendingBilling}
          icon={Receipt}
        />
      </div>
    </div>
  );

  // ----- Tab: Posiciones -----
  const posicionesTab =
    positions && positions.length > 0 ? (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Nivel</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.code}</TableCell>
              <TableCell>{POSITION_TYPE_LABELS[p.type]}</TableCell>
              <TableCell>{orDash(p.level)}</TableCell>
              <TableCell>
                <PositionStatusBadge status={p.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    ) : (
      <EmptyState
        icon={Grid3x3}
        title="Sin posiciones asignadas"
        description="Asigná posiciones de rack a este cliente desde el módulo de Posiciones."
      />
    );

  // ----- Tab: Stock -----
  const stockTab =
    stockRows.length > 0 ? (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Producto</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead>Unidad logística</TableHead>
            <TableHead>Posición</TableHead>
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
              <TableCell>{orDash(s.position_code)}</TableCell>
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
        title="Sin stock actual"
        description="El stock aparece cuando se clasifican unidades recibidas en unidades logísticas con contenido."
      />
    );

  // ----- Tab: Órdenes de ingreso -----
  const ingresosTab =
    inbound && inbound.length > 0 ? (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Remito</TableHead>
            <TableHead>Transporte</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {inbound.map((o) => (
            <TableRow key={o.id}>
              <TableCell>{formatDateTime(o.date_time)}</TableCell>
              <TableCell className="font-medium">
                {orDash(o.remittance_number)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {orDash(o.truck_company)}
              </TableCell>
              <TableCell>
                <InboundStatusBadge status={o.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    ) : (
      <EmptyState
        icon={Truck}
        title="Sin órdenes de ingreso"
        description="Las órdenes de ingreso se crean cuando llega un camión con material."
      />
    );

  // ----- Tab: Órdenes de retiro -----
  const retirosTab =
    outbound && outbound.length > 0 ? (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Documento</TableHead>
            <TableHead>Destino</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {outbound.map((o) => (
            <TableRow key={o.id}>
              <TableCell>{formatDateTime(o.date_time)}</TableCell>
              <TableCell className="font-medium">
                {orDash(o.document_number)}
              </TableCell>
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
    ) : (
      <EmptyState
        icon={PackageMinus}
        title="Sin órdenes de retiro"
        description="Las órdenes de retiro se crean cuando el cliente solicita material."
      />
    );

  // ----- Tab: Movimientos -----
  const movimientosTab =
    movements && movements.length > 0 ? (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="text-right">Cantidad</TableHead>
            <TableHead>Notas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movements.map((m) => (
            <TableRow key={m.id}>
              <TableCell>{formatDateTime(m.date_time)}</TableCell>
              <TableCell>
                <Badge variant="secondary">
                  {MOVEMENT_TYPE_LABELS[m.movement_type]}
                </Badge>
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
        description="Cada operación física o lógica genera un movimiento. Todavía no hay ninguno para este cliente."
      />
    );

  // ----- Tab: Servicios facturables -----
  const serviciosTab =
    services && services.length > 0 ? (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Servicio</TableHead>
            <TableHead className="text-right">Cantidad</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {services.map((s) => (
            <TableRow key={s.id}>
              <TableCell>{formatDate(s.date)}</TableCell>
              <TableCell className="font-medium">
                {BILLABLE_SERVICE_TYPE_LABELS[s.service_type]}
              </TableCell>
              <TableCell className="text-right">
                {Number(s.quantity)} {s.unit ?? ""}
              </TableCell>
              <TableCell>
                <BillableStatusBadge status={s.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    ) : (
      <EmptyState
        icon={Receipt}
        title="Sin servicios facturables"
        description="Los servicios se generan automáticamente a partir de las operaciones y movimientos."
      />
    );

  // ----- Tab: Incidencias / pendientes -----
  const incidenciasTab =
    incidentsTotal > 0 ? (
      <div className="space-y-6">
        {pendingUnits && pendingUnits.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Unidades recibidas pendientes</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado de contenido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingUnits.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.code}</TableCell>
                    <TableCell>{u.type}</TableCell>
                    <TableCell>
                      <ContentStatusBadge status={u.content_status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {incidentUnits && incidentUnits.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Unidades logísticas en incidencia</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidentUnits.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.code}</TableCell>
                    <TableCell>{u.type}</TableCell>
                    <TableCell>
                      <LogisticUnitStatusBadge status={u.status} />
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
        icon={AlertTriangle}
        title="Sin incidencias ni pendientes"
        description="Acá aparecerán unidades pendientes de clasificación, discrepancias e incidencias."
      />
    );

  const portalAccessTab = canManagePortal ? (
    <PortalAccessSection
      clientId={id}
      clientName={client.nombre}
      clientLegalName={client.razon_social}
      clientTaxId={client.tax_id}
      users={portalUsers}
      canInvite={clientHasInvitableCuit(client.tax_id)}
    />
  ) : null;

  const tabs = [
    { id: "resumen", label: "Resumen", content: resumen },
    {
      id: "posiciones",
      label: "Posiciones",
      badge: positions?.length ?? 0,
      content: posicionesTab,
    },
    { id: "stock", label: "Stock actual", badge: stockRows.length, content: stockTab },
    {
      id: "ingresos",
      label: "Órdenes de ingreso",
      badge: inbound?.length ?? 0,
      content: ingresosTab,
    },
    {
      id: "retiros",
      label: "Órdenes de retiro",
      badge: outbound?.length ?? 0,
      content: retirosTab,
    },
    {
      id: "movimientos",
      label: "Movimientos",
      badge: movements?.length ?? 0,
      content: movimientosTab,
    },
    {
      id: "servicios",
      label: "Servicios facturables",
      badge: services?.length ?? 0,
      content: serviciosTab,
    },
    {
      id: "incidencias",
      label: "Revisión / pendientes",
      badge: incidentsTotal,
      content: incidenciasTab,
    },
    ...(canManagePortal
      ? [
          {
            id: "portal",
            label: "Accesos portal",
            badge: portalUsers.length,
            content: portalAccessTab,
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader title={client.nombre} description={orDash(client.razon_social)}>
        {staff && (
          <>
            <Link
              href={`/clientes/${id}/editar`}
              className={buttonVariants({ variant: "outline" })}
            >
              <Pencil className="h-4 w-4" />
              Editar
            </Link>
            <ToggleActiveButton
              clientId={id}
              isActive={client.is_active !== false}
              withLabel
            />
            <DeleteClientButton
              clientId={id}
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
  icon: Icon,
  label,
  value,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex items-start gap-2">
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{orDash(value)}</p>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-6">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <span className="text-2xl font-bold">{value}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </CardContent>
    </Card>
  );
}
