import Link from "next/link";
import {
  Plus,
  Search,
  Pencil,
  Grid3x3,
  LayoutGrid,
  Wand2,
  CheckCircle2,
  Eye,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isStaff } from "@/lib/auth";
import {
  POSITION_TYPE_LABELS,
  POSITION_STATUS_LABELS,
  RACK_COLUMNS,
  POSITION_SIDES,
  POSITION_LEVELS,
  SIDE_LABELS,
  LEVEL_LABELS,
  OPERATIONAL_FLOOR_TYPES,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { orDash } from "@/lib/format";
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
import { PositionStatusBadge } from "@/components/status-badges";
import { POSITION_STATUSES } from "@/lib/validation/position";
import type { PositionStatus } from "@/lib/types/database";
import { DeletePositionButton } from "./_components/delete-position-button";
import { BlockToggleButton } from "./_components/block-toggle-button";

export const dynamic = "force-dynamic";

type ViewKey = "fisicas" | "operativas" | "todas";

type SearchParams = {
  q?: string;
  col?: string;
  lado?: string;
  nivel?: string;
  cliente?: string;
  estado?: string;
  vista?: string;
  generadas?: string;
  existentes?: string;
};

const VIEW_TABS: { key: ViewKey; label: string }[] = [
  { key: "fisicas", label: "Posiciones físicas" },
  { key: "operativas", label: "Zonas operativas" },
  { key: "todas", label: "Todas" },
];

export default async function PosicionesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const q = (searchParams.q ?? "").trim();
  const col = (searchParams.col ?? "").trim();
  const lado = (searchParams.lado ?? "").trim();
  const nivel = (searchParams.nivel ?? "").trim();
  const cliente = (searchParams.cliente ?? "").trim();
  const estado = (searchParams.estado ?? "").trim();
  const vista: ViewKey =
    searchParams.vista === "operativas" || searchParams.vista === "todas"
      ? searchParams.vista
      : "fisicas";
  const isRackView = vista === "fisicas";
  const isZoneView = vista === "operativas";

  const profile = await getCurrentProfile();
  const staff = profile ? isStaff(profile.role) : false;

  const supabase = createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, nombre")
    .order("nombre");
  const clientMap = new Map((clients ?? []).map((c) => [c.id, c.nombre]));

  let query = supabase.from("positions").select("*").order("code");
  // Por default mostramos solo posiciones físicas (rack). Las zonas operativas
  // viven en su propia vista para no mezclarse con las posiciones del cliente.
  if (isRackView) query = query.eq("type", "rack");
  if (isZoneView) query = query.in("type", OPERATIONAL_FLOOR_TYPES);
  if (q) query = query.ilike("code", `%${q}%`);
  // Los filtros de rack solo aplican a la vista de posiciones físicas.
  if (!isZoneView) {
    if (col) query = query.eq("column_letter", col);
    if (lado) query = query.eq("side", lado);
    if (nivel) query = query.eq("level", nivel);
  }
  if (cliente) query = query.eq("assigned_client_id", cliente);
  if (estado) query = query.eq("status", estado as PositionStatus);

  const { data: positions } = await query;

  const rackFilters = !isZoneView && Boolean(col || lado || nivel);
  const hasFilters = Boolean(q || cliente || estado) || rackFilters;
  const generadas = searchParams.generadas
    ? Number(searchParams.generadas)
    : null;
  const existentes = searchParams.existentes
    ? Number(searchParams.existentes)
    : null;

  // Helper para construir links de tab preservando filtros vigentes.
  const buildViewHref = (key: ViewKey) => {
    const sp = new URLSearchParams();
    if (key !== "fisicas") sp.set("vista", key);
    if (q) sp.set("q", q);
    if (estado) sp.set("estado", estado);
    if (cliente) sp.set("cliente", cliente);
    const qs = sp.toString();
    return qs ? `/posiciones?${qs}` : "/posiciones";
  };

  const countLabel = isRackView
    ? "posiciones físicas"
    : isZoneView
    ? "zonas operativas"
    : "posiciones";

  const emptyDescription = isZoneView
    ? "No hay zonas operativas cargadas. Deberían existir por default (piso ingreso, retiro y revisión)."
    : isRackView
    ? "Todavía no hay posiciones físicas creadas. Creá posiciones manualmente o generá posiciones por columna/lado/nivel."
    : "Creá posiciones manualmente o generá posiciones por columna/lado/nivel.";

  return (
    <>
      <PageHeader
        title="Posiciones"
        description="ABM y detalle de posiciones del depósito (racks y piso)"
      >
        <Link href="/mapa" className={buttonVariants({ variant: "outline" })}>
          <LayoutGrid className="h-4 w-4" />
          Mapa
        </Link>
        {staff && (
          <>
            <Link
              href="/posiciones/generar"
              className={buttonVariants({ variant: "outline" })}
            >
              <Wand2 className="h-4 w-4" />
              Generar posiciones físicas
            </Link>
            <Link href="/posiciones/nueva" className={buttonVariants()}>
              <Plus className="h-4 w-4" />
              Nueva posición
            </Link>
          </>
        )}
      </PageHeader>

      {generadas != null && generadas > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4" />
          Generación completada: {generadas} creadas
          {existentes != null && existentes > 0
            ? ` · ${existentes} ya existentes (omitidas)`
            : ""}
          .
        </div>
      )}

      {/* Tabs de vista: físicas (default) / operativas / todas */}
      <div className="mb-4 inline-flex rounded-lg border bg-muted/40 p-1">
        {VIEW_TABS.map((t) => (
          <Link
            key={t.key}
            href={buildViewHref(t.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              vista === t.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          {/* Filtros */}
          <form className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
            {vista !== "fisicas" && (
              <input type="hidden" name="vista" value={vista} />
            )}
            <div className="space-y-1 lg:col-span-2">
              <Label htmlFor="q" className="text-xs">
                Buscar por código
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="q"
                  name="q"
                  defaultValue={q}
                  placeholder="A-IZQ-PISO"
                  className="pl-9"
                />
              </div>
            </div>

            {!isZoneView && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="col" className="text-xs">
                    Columna / rack
                  </Label>
                  <Select id="col" name="col" defaultValue={col}>
                    <option value="">Todas</option>
                    {RACK_COLUMNS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="lado" className="text-xs">
                    Lado
                  </Label>
                  <Select id="lado" name="lado" defaultValue={lado}>
                    <option value="">Todos</option>
                    {POSITION_SIDES.map((s) => (
                      <option key={s} value={s}>
                        {SIDE_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="nivel" className="text-xs">
                    Nivel
                  </Label>
                  <Select id="nivel" name="nivel" defaultValue={nivel}>
                    <option value="">Todos</option>
                    {POSITION_LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {LEVEL_LABELS[l]}
                      </option>
                    ))}
                  </Select>
                </div>
              </>
            )}

            <div className="space-y-1">
              <Label htmlFor="estado" className="text-xs">
                Estado
              </Label>
              <Select id="estado" name="estado" defaultValue={estado}>
                <option value="">Todos</option>
                {POSITION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {POSITION_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1 sm:col-span-2 lg:col-span-3">
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

            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-7">
              <Button type="submit">Aplicar filtros</Button>
              {hasFilters && (
                <Link
                  href="/posiciones"
                  className={buttonVariants({ variant: "ghost" })}
                >
                  Limpiar
                </Link>
              )}
              <span className="ml-auto self-center text-sm text-muted-foreground">
                {positions?.length ?? 0} {countLabel}
              </span>
            </div>
          </form>

          {!positions || positions.length === 0 ? (
            <EmptyState
              icon={Grid3x3}
              title={
                hasFilters
                  ? "Sin resultados"
                  : isZoneView
                  ? "Sin zonas operativas"
                  : "Todavía no hay posiciones físicas creadas"
              }
              description={hasFilters ? "Probá ajustar los filtros." : emptyDescription}
            />
          ) : isZoneView ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zona operativa</TableHead>
                  <TableHead>Código interno</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link
                        href={`/posiciones/${p.id}`}
                        className="font-medium hover:underline"
                      >
                        {POSITION_TYPE_LABELS[p.type]}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {p.code}
                    </TableCell>
                    <TableCell>
                      <PositionStatusBadge status={p.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/posiciones/${p.id}`}
                          className={buttonVariants({ variant: "outline" })}
                          aria-label="Ver ficha"
                          title="Ver ficha"
                        >
                          <Eye className="h-4 w-4" />
                          <span>Ver ficha</span>
                        </Link>
                        {staff && (
                          <Link
                            href={`/posiciones/${p.id}/editar`}
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
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Columna</TableHead>
                  <TableHead>Lado</TableHead>
                  <TableHead>Nivel</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/posiciones/${p.id}`}
                        className="font-mono hover:underline"
                      >
                        {p.code}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {POSITION_TYPE_LABELS[p.type]}
                    </TableCell>
                    <TableCell>{orDash(p.column_letter)}</TableCell>
                    <TableCell>
                      {p.side ? orDash(SIDE_LABELS[p.side]) : "—"}
                    </TableCell>
                    <TableCell>
                      {p.level ? orDash(LEVEL_LABELS[p.level] ?? p.level) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.assigned_client_id
                        ? orDash(clientMap.get(p.assigned_client_id))
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <PositionStatusBadge status={p.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/posiciones/${p.id}`}
                          className={buttonVariants({ variant: "outline" })}
                          aria-label="Ver ficha"
                          title="Ver ficha"
                        >
                          <Eye className="h-4 w-4" />
                          <span>Ver ficha</span>
                        </Link>
                        {staff && (
                          <>
                            <Link
                              href={`/posiciones/${p.id}/editar`}
                              className={buttonVariants({
                                variant: "ghost",
                                size: "icon",
                              })}
                              aria-label="Editar"
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                            {/* Las zonas operativas no se bloquean ni borran */}
                            {p.type === "rack" && (
                              <>
                                <BlockToggleButton
                                  positionId={p.id}
                                  blocked={p.status === "blocked"}
                                />
                                <DeletePositionButton positionId={p.id} />
                              </>
                            )}
                          </>
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
