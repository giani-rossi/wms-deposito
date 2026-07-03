import Link from "next/link";
import { Plus, Search, Eye, PackageMinus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isStaff } from "@/lib/auth";
import { OUTBOUND_ORDER_STATUS_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime, orDash } from "@/lib/format";
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
import { OutboundStatusBadge } from "@/components/status-badges";
import type { OutboundOrderStatus } from "@/lib/types/database";

export const dynamic = "force-dynamic";

const OUTBOUND_STATUSES: OutboundOrderStatus[] = [
  "pending_validation",
  "pending_stock_assignment",
  "picking_assigned",
  "in_preparation",
  "ready_to_load",
  "loaded",
  "closed",
  "incident",
];

export default async function OrdenesRetiroPage({
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
    .from("outbound_orders")
    .select("*")
    .order("date_time", { ascending: false });
  if (q) query = query.ilike("document_number", `%${q}%`);
  if (cliente) query = query.eq("client_id", cliente);
  if (estado) query = query.eq("status", estado as OutboundOrderStatus);

  const { data: orders } = await query;
  const orderIds = (orders ?? []).map((o) => o.id);

  const unitCounts = new Map<string, number>();
  if (orderIds.length) {
    const { data: lines } = await supabase
      .from("outbound_order_logistic_units")
      .select("outbound_order_id")
      .in("outbound_order_id", orderIds)
      .in("line_status", ["pending", "prepared", "loaded"]);
    for (const line of lines ?? []) {
      unitCounts.set(
        line.outbound_order_id,
        (unitCounts.get(line.outbound_order_id) ?? 0) + 1
      );
    }
  }

  const hasFilters = Boolean(q || cliente || estado);

  return (
    <>
      <PageHeader
        title="Órdenes de retiro"
        description="Salida de mercadería por unidad logística completa"
      >
        {staff && (
          <Link href="/ordenes-retiro/nueva" className={buttonVariants()}>
            <Plus className="h-4 w-4" />
            Nueva orden
          </Link>
        )}
      </PageHeader>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <form className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1 lg:col-span-2">
              <Label htmlFor="q" className="text-xs">
                Buscar por documento
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="q"
                  name="q"
                  defaultValue={q}
                  placeholder="OUT-2026-0001"
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
                {OUTBOUND_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {OUTBOUND_ORDER_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
              <Button type="submit">Aplicar filtros</Button>
              {hasFilters && (
                <Link
                  href="/ordenes-retiro"
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
              icon={PackageMinus}
              title={hasFilters ? "Sin resultados" : "Todavía no hay órdenes"}
              description={
                hasFilters
                  ? "Probá ajustar los filtros."
                  : "Creá la primera orden de retiro cuando un cliente retire mercadería."
              }
              action={
                !hasFilters && staff ? (
                  <Link href="/ordenes-retiro/nueva" className={buttonVariants()}>
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
                  <TableHead>Documento</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>ULs</TableHead>
                  <TableHead>Solicitada</TableHead>
                  <TableHead>Creada</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">
                      {orDash(o.document_number)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {orDash(clientMap.get(o.client_id))}
                    </TableCell>
                    <TableCell>
                      <OutboundStatusBadge status={o.status} />
                    </TableCell>
                    <TableCell>{unitCounts.get(o.id) ?? 0}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {o.requested_date ? formatDate(o.requested_date) : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(o.date_time)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Link
                          href={`/ordenes-retiro/${o.id}`}
                          className={buttonVariants({ variant: "outline" })}
                        >
                          <Eye className="h-4 w-4" />
                          Ver
                        </Link>
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
