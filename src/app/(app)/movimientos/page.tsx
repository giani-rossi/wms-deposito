import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MOVEMENT_TYPE_LABELS, positionPrimaryLabel } from "@/lib/constants";
import type { MovementType } from "@/lib/types/database";
import { formatDateTime, orDash } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { ModuleStatusBanner } from "@/components/layout/module-status-banner";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

export const dynamic = "force-dynamic";

const MOVEMENT_TYPES = Object.keys(MOVEMENT_TYPE_LABELS) as MovementType[];

export default async function MovimientosPage({
  searchParams,
}: {
  searchParams: { cliente?: string; tipo?: string };
}) {
  const cliente = (searchParams.cliente ?? "").trim();
  const tipo = (searchParams.tipo ?? "").trim();

  const supabase = createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, nombre")
    .order("nombre");
  const clientMap = new Map((clients ?? []).map((c) => [c.id, c.nombre]));

  let query = supabase
    .from("movements")
    .select("*")
    .order("date_time", { ascending: false })
    .limit(200);
  if (cliente) query = query.eq("client_id", cliente);
  if (tipo) query = query.eq("movement_type", tipo as MovementType);

  const { data: movements } = await query;
  const rows = movements ?? [];

  const positionIds = [
    ...new Set(
      rows.flatMap((m) => [m.from_position_id, m.to_position_id]).filter(Boolean)
    ),
  ] as string[];
  const luIds = [
    ...new Set(rows.map((m) => m.logistic_unit_id).filter(Boolean)),
  ] as string[];

  const [{ data: positions }, { data: logisticUnits }] = await Promise.all([
    positionIds.length
      ? supabase.from("positions").select("id, code").in("id", positionIds)
      : Promise.resolve({ data: [] }),
    luIds.length
      ? supabase.from("logistic_units").select("id, code").in("id", luIds)
      : Promise.resolve({ data: [] }),
  ]);

  const posCodeMap = new Map((positions ?? []).map((p) => [p.id, p.code]));
  const luCodeMap = new Map((logisticUnits ?? []).map((u) => [u.id, u.code]));

  return (
    <>
      <PageHeader
        title="Movimientos"
        description="Bitácora de operaciones del depósito"
      />

      <div className="space-y-6">
        <ModuleStatusBanner
          status="preview"
          message="Listado de los últimos 200 movimientos. Filtros avanzados, exportación y detalle ampliado quedan para fase 2."
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
                  {MOVEMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {MOVEMENT_TYPE_LABELS[t]}
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
                icon={ArrowLeftRight}
                title="Sin movimientos"
                description="Los movimientos se generan al operar órdenes de ingreso (creación, descarga, unidades, ubicación)."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead>Desde → Hacia</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead>Orden ingreso</TableHead>
                    <TableHead>Notas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDateTime(m.date_time)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {MOVEMENT_TYPE_LABELS[m.movement_type]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {m.client_id
                          ? clientMap.get(m.client_id) ?? "—"
                          : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {m.logistic_unit_id
                          ? luCodeMap.get(m.logistic_unit_id) ?? "—"
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {m.from_position_id || m.to_position_id ? (
                          <>
                            {m.from_position_id
                              ? positionPrimaryLabel(
                                  posCodeMap.get(m.from_position_id)
                                )
                              : "—"}
                            {" → "}
                            {m.to_position_id
                              ? positionPrimaryLabel(
                                  posCodeMap.get(m.to_position_id)
                                )
                              : "—"}
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {m.quantity != null ? Number(m.quantity) : "—"}
                      </TableCell>
                      <TableCell>
                        {m.inbound_order_id ? (
                          <Link
                            href={`/ordenes-ingreso/${m.inbound_order_id}`}
                            className="text-sm hover:underline"
                          >
                            Ver orden
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">
                        {orDash(m.notes)}
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
