import { Suspense } from "react";
import { CalendarCheck, AlertTriangle } from "lucide-react";
import { parseISO, format } from "date-fns";
import { es } from "date-fns/locale";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isStaff } from "@/lib/auth";
import { POSITION_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import {
  computeDailyClientDetails,
  computeMonthlySummaries,
  countMissingCloseDays,
  getMonthBounds,
  parseMonthParam,
  todayInArgentina,
} from "@/lib/daily-close/monthly-summary";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DailyCloseControls } from "./_components/daily-close-controls";
import { MonthlyStayControls } from "./_components/monthly-stay-controls";

export const dynamic = "force-dynamic";

function formatMonthLabel(month: string): string {
  try {
    const label = format(parseISO(`${month}-01`), "MMMM yyyy", { locale: es });
    return label.charAt(0).toUpperCase() + label.slice(1);
  } catch {
    return month;
  }
}

export default async function CierreDiaPage({
  searchParams,
}: {
  searchParams: { fecha?: string; mes?: string; cliente_mes?: string };
}) {
  const fecha =
    searchParams.fecha && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.fecha)
      ? searchParams.fecha
      : todayInArgentina();

  const mes = parseMonthParam(searchParams.mes);
  const clienteMes = (searchParams.cliente_mes ?? "").trim();
  const monthBounds = getMonthBounds(mes);

  const profile = await getCurrentProfile();
  const staff = profile ? isStaff(profile.role) : false;

  const supabase = createClient();
  const [
    { data: snapshot },
    { data: clients },
    { data: monthRowsAll },
    { data: latestClose },
  ] = await Promise.all([
    supabase
      .from("daily_position_occupancy")
      .select("*")
      .eq("date", fecha)
      .order("position_code"),
    supabase.from("clients").select("id, nombre").order("nombre"),
    supabase
      .from("daily_position_occupancy")
      .select("*")
      .gte("date", monthBounds.start)
      .lte("date", monthBounds.end)
      .order("date", { ascending: false }),
    supabase
      .from("daily_position_occupancy")
      .select("date")
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const lastCloseDate = latestClose?.date ?? null;
  let lastCloseOccupiedPositions = 0;
  if (lastCloseDate) {
    const { data: lastCloseRows } = await supabase
      .from("daily_position_occupancy")
      .select("position_id")
      .eq("date", lastCloseDate);
    lastCloseOccupiedPositions = new Set(
      (lastCloseRows ?? []).map((r) => r.position_id)
    ).size;
  }

  const clientMap = new Map((clients ?? []).map((c) => [c.id, c.nombre]));
  const clientOptions = (clients ?? []).map((c) => ({
    id: c.id,
    nombre: c.nombre,
  }));
  const rows = snapshot ?? [];

  const monthRowsRaw = monthRowsAll ?? [];
  const monthRowsFiltered = clienteMes
    ? monthRowsRaw.filter((r) => r.client_id === clienteMes)
    : monthRowsRaw;

  const monthlySummaries = computeMonthlySummaries(
    monthRowsFiltered,
    monthBounds.calendarDays
  )
    .map((s) => ({
      ...s,
      clientName: clientMap.get(s.clientId) ?? "Cliente",
    }))
    .sort((a, b) => a.clientName.localeCompare(b.clientName));

  const dailyDetails = computeDailyClientDetails(monthRowsFiltered).map((d) => ({
    ...d,
    clientName: clientMap.get(d.clientId) ?? "Cliente",
  }));

  const missingCloseDays = countMissingCloseDays(monthRowsRaw, monthBounds);

  // Posiciones con más de un cliente en el snapshot (mezcla / override).
  const clientsPerPosition = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = clientsPerPosition.get(r.position_id) ?? new Set<string>();
    set.add(r.client_id);
    clientsPerPosition.set(r.position_id, set);
  }
  const mixedPositionIds = new Set(
    [...clientsPerPosition.entries()]
      .filter(([, clientSet]) => clientSet.size > 1)
      .map(([posId]) => posId)
  );

  // Resumen por cliente: posiciones distintas usadas ese día.
  const summaryByClient = new Map<string, number>();
  for (const r of rows) {
    summaryByClient.set(
      r.client_id,
      (summaryByClient.get(r.client_id) ?? 0) + 1
    );
  }
  const summaryRows = [...summaryByClient.entries()]
    .map(([clientId, positionsUsed]) => ({
      clientId,
      clientName: clientMap.get(clientId) ?? "Cliente",
      positionsUsed,
    }))
    .sort((a, b) => a.clientName.localeCompare(b.clientName));

  return (
    <>
      <PageHeader
        title="Cierre del día"
        description="Snapshot diario de posiciones usadas por cliente (estadía por posición-día)"
      />

      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <h3 className="text-sm font-semibold">Cierre diario</h3>
            <p className="text-sm text-muted-foreground">
              Este cierre registra las posiciones rack usadas por cliente para
              calcular estadía mensual. No modifica stock ni movimientos.
            </p>

            {lastCloseDate ? (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <p>
                  <span className="font-medium">Último día cerrado:</span>{" "}
                  {formatDate(lastCloseDate)} ·{" "}
                  <span className="font-medium">
                    {lastCloseOccupiedPositions} posición
                    {lastCloseOccupiedPositions === 1 ? "" : "es"} ocupada
                    {lastCloseOccupiedPositions === 1 ? "" : "s"}
                  </span>
                </p>
                {missingCloseDays > 0 && (
                  <p className="mt-1 text-amber-800">
                    Faltan {missingCloseDays} día
                    {missingCloseDays === 1 ? "" : "s"} de cierre en{" "}
                    {formatMonthLabel(mes)}.
                  </p>
                )}
              </div>
            ) : (
              <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                Todavía no hay cierres registrados. El cron automático corre a
                las 19:00 hs Argentina; podés ejecutar un cierre manual como
                respaldo.
              </p>
            )}

            <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
              <DailyCloseControls
                defaultDate={fecha}
                suggestedManualDate={todayInArgentina()}
                staff={staff}
              />
            </Suspense>
          </CardContent>
        </Card>

        {mixedPositionIds.size > 0 && (
          <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Hay {mixedPositionIds.size} posición(es) con mercadería de más de un
            cliente. Revisá mezclas por override antes de facturar estadía.
          </p>
        )}

        <Card>
          <CardContent className="space-y-4 pt-6">
            <h3 className="text-sm font-semibold">
              Snapshot del {formatDate(fecha)}
            </h3>
            {rows.length === 0 ? (
              <EmptyState
                icon={CalendarCheck}
                title="Sin cierre para esta fecha"
                description={
                  staff
                    ? "Elegí la fecha y generá el cierre del día para registrar las posiciones rack usadas por cada cliente."
                    : "Todavía no hay un cierre registrado para esta fecha."
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Posición</TableHead>
                    <TableHead className="text-right">Unidades logísticas</TableHead>
                    <TableHead>Estado posición</TableHead>
                    <TableHead>Notas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{formatDate(r.date)}</TableCell>
                      <TableCell className="font-medium">
                        {clientMap.get(r.client_id) ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {r.position_code}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.occupied_units_count}
                      </TableCell>
                      <TableCell>
                        {POSITION_STATUS_LABELS[r.position_status]}
                      </TableCell>
                      <TableCell>
                        {mixedPositionIds.has(r.position_id) ? (
                          <Badge
                            variant="outline"
                            className="text-amber-700"
                          >
                            Mezcla de clientes
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {summaryRows.length > 0 && (
          <Card>
            <CardContent className="space-y-4 pt-6">
              <h3 className="text-sm font-semibold">
                Resumen por cliente — {formatDate(fecha)}
              </h3>
              <p className="text-xs text-muted-foreground">
                Cantidad de posiciones rack distintas usadas ese día (base para
                facturar posición-día).
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Posiciones usadas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaryRows.map((s) => (
                    <TableRow key={s.clientId}>
                      <TableCell className="font-medium">{s.clientName}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {s.positionsUsed}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Separator />

        <Card>
          <CardContent className="space-y-4 pt-6">
            <h3 className="text-sm font-semibold">Resumen mensual de estadía</h3>
            <p className="text-sm text-muted-foreground">
              Este resumen suma las posiciones usadas por cliente en los cierres
              diarios generados. Si falta un día de cierre, ese día no se incluye.
              Solo lectura — números de referencia para facturación manual.
            </p>

            <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
              <MonthlyStayControls
                defaultMonth={mes}
                defaultClientId={clienteMes}
                clients={clientOptions}
              />
            </Suspense>

            {missingCloseDays > 0 && (
              <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Hay {missingCloseDays} día
                {missingCloseDays === 1 ? "" : "s"} del mes sin cierre generado.
                El total mensual puede estar incompleto.
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              Mes: {formatMonthLabel(mes)} · {monthBounds.calendarDays} días
              calendario
              {monthBounds.elapsedDays < monthBounds.calendarDays &&
                monthBounds.elapsedDays > 0 &&
                ` · ${monthBounds.elapsedDays} días transcurridos`}
            </p>

            {monthlySummaries.length === 0 ? (
              <EmptyState
                icon={CalendarCheck}
                title="Sin datos de estadía en este mes"
                description={
                  staff
                    ? "Generá los cierres diarios del mes para acumular posición-día por cliente."
                    : "Todavía no hay cierres registrados en el rango seleccionado."
                }
              />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">
                        Total posición-día
                      </TableHead>
                      <TableHead className="text-right">
                        Días con ocupación
                      </TableHead>
                      <TableHead className="text-right">
                        Prom. / día con ocupación
                      </TableHead>
                      <TableHead className="text-right">
                        Prom. / día calendario
                      </TableHead>
                      <TableHead>Primera fecha</TableHead>
                      <TableHead>Última fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlySummaries.map((s) => (
                      <TableRow key={s.clientId}>
                        <TableCell className="font-medium">{s.clientName}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {s.totalPositionDays}
                        </TableCell>
                        <TableCell className="text-right">
                          {s.daysWithOccupancy}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {s.avgPerOccupiedDay}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {s.avgPerCalendarDay}
                        </TableCell>
                        <TableCell>
                          {s.firstOccupancyDate
                            ? formatDate(s.firstOccupancyDate)
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {s.lastOccupancyDate
                            ? formatDate(s.lastOccupancyDate)
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {dailyDetails.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <h4 className="text-sm font-semibold">Detalle diario por cliente</h4>
                    <p className="text-xs text-muted-foreground">
                      Posiciones rack distintas usadas cada día (según cierres
                      generados).
                    </p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead className="text-right">
                            Posiciones usadas
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dailyDetails.map((d) => (
                          <TableRow key={`${d.date}-${d.clientId}`}>
                            <TableCell>{formatDate(d.date)}</TableCell>
                            <TableCell className="font-medium">
                              {d.clientName}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {d.positionsUsed}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
