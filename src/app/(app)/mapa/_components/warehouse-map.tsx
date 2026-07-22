"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, ExternalLink, Loader2, Plus } from "lucide-react";
import type { PositionRow, PositionStatus } from "@/lib/types/database";
import {
  POSITION_STATUS_BG,
  POSITION_STATUS_LABELS,
  POSITION_STATUS_DESCRIPTIONS,
  POSITION_TYPE_LABELS,
  RACK_COLUMNS,
  POSITION_SIDES,
  POSITION_LEVELS,
  POSITION_LEVELS_TOP_DOWN,
  isMapFloorZonePosition,
  mapFloorZoneDisplay,
  SIDE_LABELS,
  LEVEL_LABELS,
  buildRackCode,
  describeRackPosition,
} from "@/lib/constants";
import { POSITION_STATUSES } from "@/lib/validation/position";
import { createRackPositionAction } from "@/lib/actions/positions";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PositionStatusBadge } from "@/components/status-badges";

type ClientOption = { id: string; nombre: string };
type CreateTarget = { column: string; side: string; level: string };

export function WarehouseMap({
  positions,
  clients,
  canCreate,
}: {
  positions: PositionRow[];
  clients: ClientOption[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const clientMap = useMemo(
    () => new Map(clients.map((c) => [c.id, c.nombre])),
    [clients]
  );

  // Posiciones de rack indexadas por código (nomenclatura nueva)
  const byCode = useMemo(() => {
    const m = new Map<string, PositionRow>();
    for (const p of positions) if (p.code) m.set(p.code.toUpperCase(), p);
    return m;
  }, [positions]);

  const floorPositions = positions.filter(isMapFloorZonePosition);

  const [colFilter, setColFilter] = useState("");
  const [sideFilter, setSideFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("");
  const [clienteFilter, setClienteFilter] = useState("");

  const [selected, setSelected] = useState<PositionRow | null>(null);
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null);

  const columns = colFilter ? [colFilter] : [...RACK_COLUMNS];
  const levels = levelFilter
    ? [levelFilter]
    : [...POSITION_LEVELS_TOP_DOWN];
  const sides = [...POSITION_SIDES];

  const matchesExisting = (p: PositionRow) =>
    (!estadoFilter || p.status === estadoFilter) &&
    (!clienteFilter || p.assigned_client_id === clienteFilter) &&
    (!sideFilter || p.side === sideFilter);

  return (
    <>
      {/* Filtros */}
      <Card className="mb-4">
        <CardContent className="grid grid-cols-2 gap-3 pt-6 sm:grid-cols-3 lg:grid-cols-5">
          <FilterSelect
            label="Columna"
            value={colFilter}
            onChange={setColFilter}
            options={RACK_COLUMNS.map((c) => ({ value: c, label: c }))}
          />
          <FilterSelect
            label="Lado"
            value={sideFilter}
            onChange={setSideFilter}
            options={POSITION_SIDES.map((s) => ({
              value: s,
              label: SIDE_LABELS[s],
            }))}
          />
          <FilterSelect
            label="Nivel"
            value={levelFilter}
            onChange={setLevelFilter}
            options={POSITION_LEVELS.map((l) => ({
              value: l,
              label: LEVEL_LABELS[l],
            }))}
          />
          <FilterSelect
            label="Estado"
            value={estadoFilter}
            onChange={setEstadoFilter}
            options={POSITION_STATUSES.map((s) => ({
              value: s,
              label: POSITION_STATUS_LABELS[s],
            }))}
          />
          <FilterSelect
            label="Cliente"
            value={clienteFilter}
            onChange={setClienteFilter}
            options={clients.map((c) => ({ value: c.id, label: c.nombre }))}
          />
        </CardContent>
      </Card>

      {/* Leyenda */}
      <div className="mb-6 flex flex-wrap gap-3">
        {POSITION_STATUSES.map((s) => (
          <div
            key={s}
            className="flex items-center gap-1.5 text-xs"
            title={POSITION_STATUS_DESCRIPTIONS[s]}
          >
            <span className={cn("h-3 w-3 rounded-sm", POSITION_STATUS_BG[s])} />
            {POSITION_STATUS_LABELS[s]}
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="h-3 w-3 rounded-sm border border-dashed bg-muted/40" />
          Sin crear
        </div>
      </div>

      {/* Matriz */}
      <Card>
        <CardContent className="overflow-x-auto pt-6">
          <div className="min-w-max space-y-2">
            {/* Encabezado de columnas (letras) */}
            <div className="flex gap-3">
              <div className="w-16 shrink-0" />
              {columns.map((col) => (
                <div
                  key={col}
                  className="w-[7.5rem] shrink-0 text-center text-sm font-semibold text-muted-foreground"
                >
                  Rack {col}
                </div>
              ))}
            </div>

            {/* Sub-encabezado IZQ / DER */}
            <div className="flex gap-3">
              <div className="w-16 shrink-0" />
              {columns.map((col) => (
                <div key={col} className="flex w-[7.5rem] shrink-0 gap-1">
                  {sides.map((s) => (
                    <div
                      key={s}
                      className="flex-1 text-center text-[10px] font-medium uppercase text-muted-foreground"
                    >
                      {s}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Filas por nivel */}
            {levels.map((level) => (
              <div key={level} className="flex items-stretch gap-3">
                <div className="flex w-16 shrink-0 items-center justify-end pr-1 text-xs font-medium text-muted-foreground">
                  {LEVEL_LABELS[level] ?? level}
                </div>
                {columns.map((col) => (
                  <div key={col} className="flex w-[7.5rem] shrink-0 gap-1">
                    {sides.map((side) => {
                      const code = buildRackCode(col, side, level);
                      const top = `${col}-${side}`;
                      const pos = byCode.get(code);
                      if (pos) {
                        return (
                          <ExistingCell
                            key={side}
                            position={pos}
                            top={top}
                            bottom={level}
                            dim={!matchesExisting(pos)}
                            client={
                              pos.assigned_client_id
                                ? clientMap.get(pos.assigned_client_id)
                                : undefined
                            }
                            onSelect={() => setSelected(pos)}
                          />
                        );
                      }
                      const dim =
                        Boolean(estadoFilter || clienteFilter) ||
                        (sideFilter ? side !== sideFilter : false);
                      return (
                        <EmptyCell
                          key={side}
                          code={code}
                          top={top}
                          bottom={level}
                          dim={dim}
                          onClick={
                            canCreate
                              ? () => setCreateTarget({ column: col, side, level })
                              : undefined
                          }
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Zonas operativas de piso */}
      {floorPositions.length > 0 && (
        <Card className="mt-6">
          <CardContent className="space-y-3 pt-6">
            <h3 className="text-sm font-semibold">Zonas operativas de piso</h3>
            <div className="flex flex-wrap gap-2">
              {floorPositions.map((p) => {
                const display = mapFloorZoneDisplay(p.type, p.code);
                return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelected(p)}
                  title={`${display.primary} · ${display.secondary}`}
                  className={cn(
                    "flex h-14 min-w-[9rem] flex-col items-center justify-center rounded-md px-3 text-xs font-semibold shadow-sm transition-all hover:ring-2 hover:ring-ring",
                    POSITION_STATUS_BG[p.status as PositionStatus],
                    !matchesExisting(p) && "opacity-25"
                  )}
                >
                  <span>{display.primary}</span>
                  <span className="text-[10px] font-normal opacity-80">
                    {display.secondary}
                  </span>
                </button>
              );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Drawer/Modal de detalle (posición existente) */}
      <Modal
        open={selected != null}
        onClose={() => setSelected(null)}
        title={selected?.code}
        description={selected ? POSITION_TYPE_LABELS[selected.type] : undefined}
        footer={
          selected ? (
            <Link
              href={`/posiciones/${selected.id}`}
              className={buttonVariants()}
            >
              <ExternalLink className="h-4 w-4" />
              Ver ficha completa
            </Link>
          ) : null
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <PositionStatusBadge status={selected.status} />
              {selected.assigned_client_id && (
                <Badge variant="outline" className="gap-1">
                  <Building2 className="h-3 w-3" />
                  {clientMap.get(selected.assigned_client_id) ?? "Cliente"}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {describeRackPosition(
                selected.column_letter,
                selected.side,
                selected.level
              )}
            </p>
            {selected.capacity_notes && (
              <Detail
                label="Notas de capacidad"
                value={selected.capacity_notes}
              />
            )}
            {selected.occupancy_notes && (
              <Detail
                label="Notas de ocupación"
                value={selected.occupancy_notes}
              />
            )}
          </div>
        )}
      </Modal>

      {/* Modal de creación rápida (celda sin crear) */}
      <CreateModal
        target={createTarget}
        onClose={() => setCreateTarget(null)}
        onCreated={() => {
          setCreateTarget(null);
          router.refresh();
        }}
      />
    </>
  );
}

function CreateModal({
  target,
  onClose,
  onCreated,
}: {
  target: CreateTarget | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const code = target
    ? buildRackCode(target.column, target.side, target.level)
    : "";

  const detailHref = target
    ? `/posiciones/nueva?column=${encodeURIComponent(
        target.column
      )}&side=${encodeURIComponent(target.side)}&level=${encodeURIComponent(
        target.level
      )}&type=rack`
    : "/posiciones/nueva";

  function onQuickCreate() {
    if (!target) return;
    setError(null);
    startTransition(async () => {
      const res = await createRackPositionAction(
        target.column,
        target.side,
        target.level
      );
      if (!res.ok) {
        setError(res.error ?? "No se pudo crear.");
        return;
      }
      onCreated();
    });
  }

  return (
    <Modal
      open={target != null}
      onClose={onClose}
      title={`Crear posición ${code}`}
      description="La posición todavía no existe en la base. Creala con detalle (formulario completo) o de forma rápida (tipo Rack, estado Libre)."
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={onQuickCreate}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Crear rápido
          </Button>
          <Link href={detailHref} className={buttonVariants()}>
            <ExternalLink className="h-4 w-4" />
            Crear con detalle
          </Link>
        </>
      }
    >
      {target && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <Detail label="Columna" value={target.column} />
            <Detail label="Lado" value={SIDE_LABELS[target.side] ?? target.side} />
            <Detail
              label="Nivel"
              value={LEVEL_LABELS[target.level] ?? target.level}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {describeRackPosition(target.column, target.side, target.level)}
          </p>
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

function CellText({ top, bottom }: { top: string; bottom: string }) {
  return (
    <span className="flex flex-col items-center justify-center leading-tight">
      <span className="block">{top}</span>
      <span className="block">{bottom}</span>
    </span>
  );
}

function ExistingCell({
  position,
  top,
  bottom,
  dim,
  client,
  onSelect,
}: {
  position: PositionRow;
  top: string;
  bottom: string;
  dim?: boolean;
  client?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={client ? `${position.code} · ${client}` : position.code}
      className={cn(
        "flex h-14 min-w-[3.25rem] flex-1 items-center justify-center rounded-md px-1 text-center text-[11px] font-semibold shadow-sm transition-all hover:scale-[1.03] hover:ring-2 hover:ring-ring",
        POSITION_STATUS_BG[position.status as PositionStatus],
        dim && "opacity-20"
      )}
    >
      <CellText top={top} bottom={bottom} />
    </button>
  );
}

function EmptyCell({
  code,
  top,
  bottom,
  dim,
  onClick,
}: {
  code: string;
  top: string;
  bottom: string;
  dim?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={`${code} · sin crear`}
      className={cn(
        "flex h-14 min-w-[3.25rem] flex-1 items-center justify-center rounded-md border border-dashed bg-muted/30 px-1 text-center text-[10px] text-muted-foreground transition-colors",
        onClick && "hover:border-primary hover:bg-accent",
        dim && "opacity-30"
      )}
    >
      <CellText top={top} bottom={bottom} />
    </button>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Todos</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string | number | null;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">
        {value === null || value === undefined || value === ""
          ? "—"
          : String(value)}
      </p>
    </div>
  );
}
