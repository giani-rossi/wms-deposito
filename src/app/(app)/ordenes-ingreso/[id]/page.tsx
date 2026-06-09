import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Pencil,
  ArrowLeftRight,
  Receipt,
  Building2,
  User,
  Truck,
  Hash,
  FileText,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isAdmin, isStaff } from "@/lib/auth";
import {
  MOVEMENT_TYPE_LABELS,
  BILLABLE_SERVICE_TYPE_LABELS,
  LOGISTIC_UNIT_TYPE_LABELS,
  RECEIVED_UNIT_TYPE_LABELS,
  receivedUnitRequiresProcessing,
  positionPrimaryLabel,
} from "@/lib/constants";
import { formatDate, formatDateTime, orDash } from "@/lib/format";
import {
  ocrDataSchema,
  EMPTY_OCR_DATA,
  type OcrData,
} from "@/lib/validation/inbound";
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
  InboundStatusBadge,
  BillableStatusBadge,
} from "@/components/status-badges";
import { InboundStatusControl } from "../_components/inbound-status-control";
import { InboundDeleteButton } from "../_components/inbound-delete-button";
import { DocumentSection } from "../_components/document-section";
import { OcrReview } from "../_components/ocr-review";
import { ReceivedUnitsSection } from "../_components/received-units-section";
import { LocationSection } from "../_components/location-section";
import { ContentSection } from "../_components/content-section";

export const dynamic = "force-dynamic";

function parseOcr(value: unknown): OcrData {
  if (!value) return EMPTY_OCR_DATA;
  const parsed = ocrDataSchema.safeParse(value);
  return parsed.success ? parsed.data : EMPTY_OCR_DATA;
}

export default async function OrdenIngresoFichaPage({
  params,
}: {
  params: { id: string };
}) {
  const id = params.id;
  const profile = await getCurrentProfile();
  const staff = profile ? isStaff(profile.role) : false;
  const admin = profile ? isAdmin(profile.role) : false;

  const supabase = createClient();
  const { data: order } = await supabase
    .from("inbound_orders")
    .select("*")
    .eq("id", id)
    .single();

  if (!order) notFound();

  const [
    { data: client },
    { data: units },
    { data: movements },
    { data: services },
    { data: files },
    { data: positions },
    { data: discharge },
  ] = await Promise.all([
    supabase.from("clients").select("id, nombre").eq("id", order.client_id).single(),
    supabase
      .from("received_units")
      .select("*")
      .eq("inbound_order_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("movements")
      .select("*")
      .eq("inbound_order_id", id)
      .order("date_time", { ascending: false }),
    supabase
      .from("billable_services")
      .select("*")
      .eq("inbound_order_id", id)
      .order("date", { ascending: false }),
    supabase
      .from("uploaded_files")
      .select("*")
      .eq("related_entity_type", "inbound_order")
      .eq("related_entity_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("positions")
      .select("id, code, status, assigned_client_id, type")
      .order("code"),
    supabase
      .from("inbound_order_discharge")
      .select("*")
      .eq("inbound_order_id", id)
      .maybeSingle(),
  ]);

  const { data: logisticUnits } = await supabase
    .from("logistic_units")
    .select("*")
    .eq("inbound_order_id", id)
    .order("created_at", { ascending: false });

  // Unidades logísticas ubicadas en TODO el depósito (para conocer la situación
  // real de cada posición candidata) + nombres de clientes.
  const [{ data: allLocatedUnits }, { data: allClients }] = await Promise.all([
    supabase
      .from("logistic_units")
      .select("id, code, current_position_id, client_id, entry_date")
      .eq("status", "located"),
    supabase.from("clients").select("id, nombre"),
  ]);

  const posMap = new Map((positions ?? []).map((p) => [p.id, p.code]));
  const clientNameMap = new Map((allClients ?? []).map((c) => [c.id, c.nombre]));

  // Agregado por posición: cuántas unidades logísticas tiene, sus códigos,
  // última fecha de ingreso y clientes ocupantes.
  const posAgg = new Map<
    string,
    { count: number; codes: string[]; lastEntry: string | null; clientIds: Set<string> }
  >();
  for (const lu of allLocatedUnits ?? []) {
    if (!lu.current_position_id) continue;
    const a =
      posAgg.get(lu.current_position_id) ??
      { count: 0, codes: [] as string[], lastEntry: null as string | null, clientIds: new Set<string>() };
    a.count += 1;
    if (a.codes.length < 8) a.codes.push(lu.code);
    if (lu.client_id) a.clientIds.add(lu.client_id);
    if (lu.entry_date && (!a.lastEntry || lu.entry_date > a.lastEntry)) {
      a.lastEntry = lu.entry_date;
    }
    posAgg.set(lu.current_position_id, a);
  }

  // Enlaces firmados para los documentos
  const fileRows = files ?? [];
  const signedFiles = await Promise.all(
    fileRows.map(async (f) => {
      const { data: signed } = await supabase.storage
        .from("wms-files")
        .createSignedUrl(f.path, 600);
      return {
        id: f.id,
        path: f.path,
        file_type: f.file_type,
        created_at: f.created_at,
        url: signed?.signedUrl ?? null,
      };
    })
  );

  const unitRows = units ?? [];
  const movementRows = movements ?? [];
  const serviceRows = services ?? [];

  const ocrInitial = order.human_confirmed_data_json
    ? parseOcr(order.human_confirmed_data_json)
    : parseOcr(order.ai_extracted_data_json);

  // Contenido/stock por unidad recibida (para flujo guiado e indicadores).
  const unitIds = unitRows.map((u) => u.id);
  const [{ data: products }, { data: contents }, { data: locatedStock }] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, name, sku, unit_of_measure")
        .eq("client_id", order.client_id)
        .order("name"),
      unitIds.length
        ? supabase
            .from("received_unit_contents")
            .select("*")
            .in("received_unit_id", unitIds)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] }),
      supabase
        .from("stock_by_position")
        .select("*")
        .eq("inbound_order_id", id),
    ]);

  const unitsWithContent = new Set(
    (contents ?? []).map((c) => c.received_unit_id)
  );
  const hasContentByUnitId = Object.fromEntries(
    unitRows.map((u) => [u.id, unitsWithContent.has(u.id)])
  ) as Record<string, boolean>;

  // ----- Cómputo de ubicación + flujo guiado (próximo paso) -----
  const locatedByRU = new Map<string, number>();
  const qtyByLU = new Map<string, number>();
  for (const m of movementRows) {
    if (m.movement_type !== "location_assignment") continue;
    if (m.received_unit_id) {
      locatedByRU.set(
        m.received_unit_id,
        (locatedByRU.get(m.received_unit_id) ?? 0) + (Number(m.quantity) || 0)
      );
    }
    if (m.logistic_unit_id) {
      qtyByLU.set(
        m.logistic_unit_id,
        (qtyByLU.get(m.logistic_unit_id) ?? 0) + (Number(m.quantity) || 0)
      );
    }
  }

  const pendingUnits = unitRows
    .map((u) => {
      const located = locatedByRU.get(u.id) ?? 0;
      return {
        id: u.id,
        code: u.code,
        type: u.type,
        physical_quantity: Number(u.physical_quantity),
        available: Number(u.physical_quantity) - located,
        content_status: u.content_status,
        current_position_code: u.current_position_id
          ? posMap.get(u.current_position_id) ?? null
          : null,
        requires_classification: u.requires_classification,
        requires_desconsolidation: u.requires_desconsolidation,
        requires_assembly: u.requires_assembly,
        requires_repackaging: u.requires_repackaging,
        hasContent: unitsWithContent.has(u.id),
      };
    })
    .filter((u) => u.available > 0);

  // Gating de clasificación: solo por flags operativos (no por content_status).
  const unitsToClassify = pendingUnits.filter(receivedUnitRequiresProcessing);
  const unitsToLocate = pendingUnits.filter(
    (u) => !receivedUnitRequiresProcessing(u)
  );

  const flow = {
    unitsCount: unitRows.length,
    hasDischarge: Boolean(discharge),
    needContent: unitRows.filter((u) => !unitsWithContent.has(u.id)).length,
    needClassification: unitsToClassify.length,
    readyToLocate: unitsToLocate.length,
    allLocated: unitRows.length > 0 && pendingUnits.length === 0,
  };

  // ----- Tab: Resumen -----
  const resumen = (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <InboundStatusBadge status={order.status} />
            <Badge variant="outline" className="gap-1">
              <Building2 className="h-3 w-3" />
              {orDash(client?.nombre)}
            </Badge>
          </div>

          <Separator />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoRow icon={FileText} label="Remito" value={order.remittance_number} />
            <InfoRow label="Fecha y hora" value={formatDateTime(order.date_time)} />
            <InfoRow icon={Truck} label="Transporte" value={order.truck_company} />
            <InfoRow icon={User} label="Chofer" value={order.driver_name} />
            <InfoRow icon={Hash} label="Patente" value={order.license_plate} />
          </div>

          {order.notes && (
            <>
              <Separator />
              <div>
                <p className="text-sm font-medium">Notas</p>
                <p className="text-sm text-muted-foreground">{order.notes}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Gestión de la orden
          </h3>
          <InboundStatusControl
            orderId={order.id}
            status={order.status}
            discharge={discharge}
            flow={flow}
            staff={staff}
            admin={admin}
          />
        </CardContent>
      </Card>

      {discharge && (
        <Card className="lg:col-span-3">
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Resumen de descarga</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <DischargeStat label="Pallets" value={discharge.pallets_count} />
              <DischargeStat label="Cajas" value={discharge.boxes_count} />
              <DischargeStat label="Bultos" value={discharge.packages_count} />
              <DischargeStat
                label="Unidades sueltas"
                value={discharge.loose_items_count}
              />
              <DischargeStat
                label="Total"
                value={
                  discharge.total_units_count ??
                  discharge.pallets_count +
                    discharge.boxes_count +
                    discharge.packages_count +
                    discharge.loose_items_count
                }
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {discharge.requires_desconsolidation && (
                <Badge variant="outline">Requiere desconsolidación</Badge>
              )}
              {discharge.requires_classification && (
                <Badge variant="outline">Requiere clasificación</Badge>
              )}
              {discharge.requires_assembly && (
                <Badge variant="outline">Requiere armado</Badge>
              )}
            </div>
            {discharge.notes && (
              <p className="text-sm text-muted-foreground">{discharge.notes}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );

  // ----- Tab: Documentos / OCR -----
  const documentosTab = (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <h3 className="text-sm font-semibold">Documentos del remito</h3>
          <DocumentSection orderId={order.id} files={signedFiles} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <h3 className="text-sm font-semibold">
            Datos extraídos (revisión y confirmación)
          </h3>
          <OcrReview
            orderId={order.id}
            initial={ocrInitial}
            hasExtracted={Boolean(order.ai_extracted_data_json)}
            confirmed={Boolean(order.human_confirmed_data_json)}
          />
        </CardContent>
      </Card>
    </div>
  );

  // ----- Tab: Unidades recibidas -----
  // Unidades que ya generaron unidades logísticas (ubicadas/procesadas):
  // editar sus requisitos puede afectar la trazabilidad -> mostramos warning.
  const processedUnitIds = Array.from(
    new Set(
      (logisticUnits ?? [])
        .map((l) => l.received_unit_id)
        .filter((x): x is string => Boolean(x))
    )
  );

  const unidadesTab = (
    <ReceivedUnitsSection
      orderId={order.id}
      units={unitRows}
      positions={positions ?? []}
      discharge={discharge}
      processedUnitIds={processedUnitIds}
      hasContentByUnitId={hasContentByUnitId}
      staff={staff}
    />
  );

  // ----- Tab: Contenido / stock -----
  const productMap = new Map((products ?? []).map((p) => [p.id, p]));
  const processedSet = new Set(processedUnitIds);

  const contentsByUnit: Record<
    string,
    {
      id: string;
      productName: string;
      sku: string | null;
      quantity: number;
      unit_of_measure: string | null;
      lot: string | null;
      notes: string | null;
    }[]
  > = {};
  for (const c of contents ?? []) {
    const prod = productMap.get(c.product_id);
    (contentsByUnit[c.received_unit_id] ??= []).push({
      id: c.id,
      productName: prod?.name ?? "Producto",
      sku: prod?.sku ?? null,
      quantity: Number(c.quantity),
      unit_of_measure: c.unit_of_measure,
      lot: c.lot,
      notes: c.notes,
    });
  }

  const contenidoTab = (
    <ContentSection
      orderId={order.id}
      units={unitRows.map((u) => ({
        id: u.id,
        code: u.code,
        typeLabel: RECEIVED_UNIT_TYPE_LABELS[u.type],
        located: processedSet.has(u.id),
      }))}
      products={products ?? []}
      contentsByUnit={contentsByUnit}
      locatedStock={(locatedStock ?? []).map((s) => ({
        position_code: s.position_code,
        logistic_unit_code: s.logistic_unit_code,
        product_name: s.product_name,
        sku: s.sku,
        quantity: Number(s.quantity),
        unit_of_measure: s.unit_of_measure,
        entry_date: s.entry_date,
      }))}
      staff={staff}
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
                  ? positionPrimaryLabel(posMap.get(m.from_position_id))
                  : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {m.to_position_id
                  ? positionPrimaryLabel(posMap.get(m.to_position_id))
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
        description="Cada operación de la orden genera un movimiento trazable."
      />
    );

  // ----- Tab: Servicios facturables -----
  const serviciosTab =
    serviceRows.length > 0 ? (
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
          {serviceRows.map((s) => (
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
        description="Al registrar la descarga se genera el servicio de descarga de camión."
      />
    );

  const luRows = (logisticUnits ?? []).filter((l) => l.status === "located");
  const locatedUnits = luRows.map((l) => ({
    id: l.id,
    code: l.code,
    type: LOGISTIC_UNIT_TYPE_LABELS[l.type],
    position_code: l.current_position_id
      ? posMap.get(l.current_position_id) ?? null
      : null,
    quantity: qtyByLU.get(l.id) ?? null,
  }));
  const usedPositions = Array.from(
    new Set(
      luRows
        .map((l) =>
          l.current_position_id ? posMap.get(l.current_position_id) : null
        )
        .filter((c): c is string => Boolean(c))
    )
  );

  // Ubicación final = SOLO posiciones físicas de rack. Las zonas operativas
  // (piso ingreso/retiro/revisión) son origen o ubicación temporal, nunca
  // destino final de stock. Con metadatos para que el modal valide la
  // situación (otro cliente / bloqueada / en revisión requieren override).
  const candidatePositions = (positions ?? [])
    .filter((p) => p.type === "rack")
    .map((p) => {
      const agg = posAgg.get(p.id);
      const assignedToClient = p.assigned_client_id === order.client_id;
      const otherClient =
        (p.assigned_client_id != null &&
          p.assigned_client_id !== order.client_id) ||
        (agg ? [...agg.clientIds].some((c) => c !== order.client_id) : false);
      const blocked = p.status === "blocked" || p.status === "incident";
      const free = p.assigned_client_id == null && (agg?.count ?? 0) === 0;
      return {
        id: p.id,
        code: p.code,
        status: p.status,
        assignedToClient,
        free,
        otherClient,
        blocked,
        assignedClientName: p.assigned_client_id
          ? clientNameMap.get(p.assigned_client_id) ?? null
          : null,
        currentUnitsCount: agg?.count ?? 0,
        currentUnitCodes: agg?.codes ?? [],
        lastEntryDate: agg?.lastEntry ?? null,
      };
    })
    .sort((a, b) => {
      // Eligibles primero (asignadas al cliente, luego libres), luego el resto.
      const rank = (x: typeof a) =>
        x.assignedToClient ? 0 : x.free ? 1 : x.blocked ? 3 : 2;
      const r = rank(a) - rank(b);
      return r !== 0 ? r : a.code.localeCompare(b.code);
    });

  const locationMovements = movementRows.filter(
    (m) => m.movement_type === "location_assignment"
  );
  const locationServices = serviceRows.filter(
    (s) => s.service_type === "location_assignment"
  );

  const ubicacionTab = (
    <div className="space-y-6">
      <LocationSection
        unitsToClassify={unitsToClassify}
        unitsToLocate={unitsToLocate}
        candidatePositions={candidatePositions}
        locatedUnits={locatedUnits}
        usedPositions={usedPositions}
        staff={staff}
      />

      <Card>
        <CardContent className="space-y-3 pt-6">
          <h3 className="text-sm font-semibold">Movimientos de ubicación</h3>
          {locationMovements.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin movimientos de ubicación todavía.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Desde</TableHead>
                  <TableHead>Hacia</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locationMovements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{formatDateTime(m.date_time)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.from_position_id
                        ? positionPrimaryLabel(posMap.get(m.from_position_id))
                        : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {m.to_position_id
                        ? positionPrimaryLabel(posMap.get(m.to_position_id))
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {m.quantity != null ? Number(m.quantity) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <h3 className="text-sm font-semibold">
            Servicios de ubicación generados
          </h3>
          {locationServices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin servicios de ubicación todavía.
            </p>
          ) : (
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
                {locationServices.map((s) => (
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
          )}
        </CardContent>
      </Card>
    </div>
  );

  const tabs = [
    { id: "resumen", label: "Resumen", content: resumen },
    {
      id: "documentos",
      label: "Documentos / OCR",
      badge: signedFiles.length,
      content: documentosTab,
    },
    {
      id: "unidades",
      label: "Unidades recibidas",
      badge: unitRows.length,
      content: unidadesTab,
    },
    {
      id: "contenido",
      label: "Contenido / stock",
      badge: flow.needContent,
      content: contenidoTab,
    },
    {
      id: "ubicacion",
      label: "Ubicación",
      badge: pendingUnits.length,
      content: ubicacionTab,
    },
    {
      id: "movimientos",
      label: "Movimientos",
      badge: movementRows.length,
      content: movimientosTab,
    },
    {
      id: "servicios",
      label: "Servicios facturables",
      badge: serviceRows.length,
      content: serviciosTab,
    },
  ];

  return (
    <>
      <PageHeader
        title={
          order.remittance_number
            ? `Remito ${order.remittance_number}`
            : "Orden de ingreso"
        }
        description={`${orDash(client?.nombre)} · ${formatDateTime(order.date_time)}`}
      >
        <Link
          href="/ordenes-ingreso"
          className={buttonVariants({ variant: "ghost" })}
        >
          Volver
        </Link>
        <Link
          href={`/ordenes-ingreso/${id}/editar`}
          className={buttonVariants({ variant: "outline" })}
        >
          <Pencil className="h-4 w-4" />
          Editar
        </Link>
        {staff && <InboundDeleteButton orderId={id} />}
      </PageHeader>

      <Tabs tabs={tabs} />
    </>
  );
}

function DischargeStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
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
