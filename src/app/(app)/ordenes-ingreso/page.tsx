import Link from "next/link";
import { Plus, Search, Eye, Pencil, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isStaff } from "@/lib/auth";
import { INBOUND_ORDER_STATUS_LABELS } from "@/lib/constants";
import { formatDateTime, orDash } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InboundStatusBadge } from "@/components/status-badges";
import type { InboundOrderStatus } from "@/lib/types/database";

export const dynamic = "force-dynamic";

const INBOUND_STATUSES: InboundOrderStatus[] = [
  "pending_download",
  "downloaded",
  "pending_validation",
  "pending_classification",
  "partially_classified",
  "ready_to_locate",
  "located",
  "incident",
  "closed",
];

export default async function OrdenesIngresoPage({
  searchParams,
}: {
  searchParams: { q?: string; cliente?: string; estado?: string };
}) {
  const q = (searchParams.q ?? "").trim();
  const cliente = (searchParams.cliente ?? "").trim();
  const estado = (searchParams.estado ?? "").trim();

  const profile = await getCurrentProfile();
  const staff = profile ? isStaff(profile.role) : false;

  const supabase = createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, nombre")
    .order("nombre");
  const clientMap = new Map((clients ?? []).map((c) => [c.id, c.nombre]));

  let query = supabase
    .from("inbound_orders")
    .select("*")
    .order("date_time", { ascending: false });
  if (q) query = query.ilike("remittance_number", `%${q}%`);
  if (cliente) query = query.eq("client_id", cliente);
  if (estado) query = query.eq("status", estado as InboundOrderStatus);

  const { data: orders } = await query;
  const hasFilters = Boolean(q || cliente || estado);

  return (
    <>
      <PageHeader
        title="Órdenes de ingreso"
        description="Llegada de mercadería, remitos y unidades recibidas"
      >
        <Link href="/ordenes-ingreso/nueva" className={buttonVariants()}>
          <Plus className="h-4 w-4" />
          Nueva orden
        </Link>
      </PageHeader>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <form className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1 lg:col-span-2">
              <Label htmlFor="q" className="text-xs">
                Buscar por remito
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="q"
                  name="q"
                  defaultValue={q}
                  placeholder="N° de remito"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cliente" className="text-xs">
                Cliente
              </Label>
              <Select id="cliente" name="cliente" defaultValue={cliente}>
                <option value="">Todos</option>
                {(clients ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="estado" className="text-xs">
                Estado
              </Label>
              <Select id="estado" name="estado" defaultValue={estado}>
                <option value="">Todos</option>
                {INBOUND_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {INBOUND_ORDER_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
              <Button type="submit">Aplicar filtros</Button>
              {hasFilters && (
                <Link
                  href="/ordenes-ingreso"
                  className={buttonVariants({ variant: "ghost" })}
                >
                  Limpiar
                </Link>
              )}
              <span className="ml-auto self-center text-sm text-muted-foreground">
                {orders?.length ?? 0} órdenes
              </span>
            </div>
          </form>

          {!orders || orders.length === 0 ? (
            <EmptyState
              icon={Truck}
              title={hasFilters ? "Sin resultados" : "Todavía no hay órdenes"}
              description={
                hasFilters
                  ? "Probá ajustar los filtros."
                  : "Creá la primera orden de ingreso cuando llegue un camión."
              }
              action={
                !hasFilters ? (
                  <Link
                    href="/ordenes-ingreso/nueva"
                    className={buttonVariants()}
                  >
                    <Plus className="h-4 w-4" />
                    Nueva orden
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Remito</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Transporte</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>{formatDateTime(o.date_time)}</TableCell>
                    <TableCell className="font-medium">
                      <Link
                        href={`/ordenes-ingreso/${o.id}`}
                        className="hover:underline"
                      >
                        {orDash(o.remittance_number)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {orDash(clientMap.get(o.client_id))}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {orDash(o.truck_company)}
                    </TableCell>
                    <TableCell>
                      <InboundStatusBadge status={o.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/ordenes-ingreso/${o.id}`}
                          className={buttonVariants({ variant: "outline" })}
                          aria-label="Ver ficha"
                          title="Ver ficha"
                        >
                          <Eye className="h-4 w-4" />
                          <span>Ver ficha</span>
                        </Link>
                        {staff && (
                          <Link
                            href={`/ordenes-ingreso/${o.id}/editar`}
                            className={buttonVariants({
                              variant: "ghost",
                              size: "icon",
                            })}
                            aria-label="Editar"
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Link>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
