"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MapPin,
  Plus,
  Trash2,
  Loader2,
  PackageCheck,
  AlertTriangle,
} from "lucide-react";
import { locateReceivedUnitAction } from "@/lib/actions/inbound";
import {
  RECEIVED_UNIT_TYPE_LABELS,
  POSITION_STATUS_LABELS,
  positionPrimaryLabel,
  formatReceivedUnitHeading,
} from "@/lib/constants";
import type {
  ContentStatus,
  ReceivedUnitType,
  PositionStatus,
} from "@/lib/types/database";
import { orDash, formatDate } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/layout/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type PendingUnit = {
  id: string;
  code: string;
  display_label: string | null;
  type: ReceivedUnitType;
  physical_quantity: number;
  available: number;
  content_status: ContentStatus;
  current_position_code: string | null;
  requires_classification: boolean;
  requires_desconsolidation: boolean;
  requires_assembly: boolean;
  requires_repackaging: boolean;
  hasContent: boolean;
};

export type CandidatePosition = {
  id: string;
  code: string;
  status: PositionStatus;
  assignedToClient: boolean;
  free: boolean;
  otherClient: boolean;
  blocked: boolean;
  assignedClientName: string | null;
  currentUnitsCount: number;
  currentUnitCodes: string[];
  lastEntryDate: string | null;
};

export type LocatedUnit = {
  id: string;
  code: string;
  type: string;
  position_code: string | null;
  quantity: number | null;
};

type FinalStatusChoice = "" | "partially_occupied" | "occupied";
type DestRow = {
  positionId: string;
  quantity: string;
  assign: boolean;
  finalStatus: FinalStatusChoice;
  override: boolean;
};

const EMPTY_ROW: DestRow = {
  positionId: "",
  quantity: "",
  assign: true,
  finalStatus: "",
  override: false,
};

export function LocationSection({
  unitsToClassify,
  unitsToLocate,
  candidatePositions,
  locatedUnits,
  usedPositions,
  staff,
}: {
  unitsToClassify: PendingUnit[];
  unitsToLocate: PendingUnit[];
  candidatePositions: CandidatePosition[];
  locatedUnits: LocatedUnit[];
  usedPositions: string[];
  staff: boolean;
}) {
  const [target, setTarget] = useState<PendingUnit | null>(null);

  return (
    <div className="space-y-6">
      {/* A. Requieren clasificación antes de ubicar */}
      {unitsToClassify.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold">
              Requieren clasificación antes de ubicar
            </h3>
            <p className="mb-4 mt-1 text-sm text-muted-foreground">
              Estas unidades todavía no pueden ubicarse porque requieren
              procesamiento previo.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Requisitos</TableHead>
                  {staff && <TableHead className="text-right">Acción</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {unitsToClassify.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {formatReceivedUnitHeading(u)}
                    </TableCell>
                    <TableCell>{RECEIVED_UNIT_TYPE_LABELS[u.type]}</TableCell>
                    <TableCell className="text-right">
                      {u.physical_quantity}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.requires_classification && (
                          <Badge variant="outline">Clasif.</Badge>
                        )}
                        {u.requires_desconsolidation && (
                          <Badge variant="outline">Desconsol.</Badge>
                        )}
                        {u.requires_assembly && (
                          <Badge variant="outline">Armado</Badge>
                        )}
                        {u.requires_repackaging && (
                          <Badge variant="outline">Reembalaje</Badge>
                        )}
                      </div>
                    </TableCell>
                    {staff && (
                      <TableCell>
                        <div className="flex justify-end">
                          <Link
                            href="/clasificacion"
                            className={buttonVariants({ variant: "outline" })}
                          >
                            Ir a clasificación
                          </Link>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* B. Listas para ubicar */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="mb-4 text-sm font-semibold">Listas para ubicar</h3>
          {unitsToLocate.some((u) => !u.hasContent) && (
            <p className="mb-4 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Hay unidades sin contenido cargado. Podés ubicarlas, pero no
              aparecerán en stock por producto para retiros hasta que cargues
              los productos/SKU en Contenido / stock.
            </p>
          )}
          {unitsToLocate.length === 0 ? (
            <EmptyState
              icon={PackageCheck}
              title="No hay unidades listas para ubicar"
              description="Generá unidades recibidas desde la descarga o, si requieren procesamiento, pasá primero por Clasificación."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Cantidad disponible</TableHead>
                  <TableHead>Contenido</TableHead>
                  <TableHead>Posición actual</TableHead>
                  {staff && <TableHead className="text-right">Acción</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {unitsToLocate.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {formatReceivedUnitHeading(u)}
                    </TableCell>
                    <TableCell>{RECEIVED_UNIT_TYPE_LABELS[u.type]}</TableCell>
                    <TableCell className="text-right">
                      {u.available} / {u.physical_quantity}
                    </TableCell>
                    <TableCell>
                      {u.hasContent ? (
                        <Badge
                          variant="secondary"
                          className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                        >
                          Con contenido
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-700">
                          Sin contenido
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.current_position_code
                        ? positionPrimaryLabel(u.current_position_code)
                        : "—"}
                    </TableCell>
                    {staff && (
                      <TableCell>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setTarget(u)}
                          >
                            <MapPin className="h-4 w-4" />
                            Ubicar mercadería
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Ubicadas */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="mb-4 text-sm font-semibold">Unidades ubicadas</h3>
          {locatedUnits.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay unidades ubicadas.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unidad logística</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Posición</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locatedUnits.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.code}</TableCell>
                    <TableCell>{l.type}</TableCell>
                    <TableCell className="text-right">
                      {l.quantity != null ? Number(l.quantity) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {orDash(l.position_code)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {usedPositions.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Posiciones usadas:
              </span>
              {usedPositions.map((p) => (
                <Badge key={p} variant="secondary" className="font-mono">
                  {p}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <LocateModal
        unit={target}
        candidatePositions={candidatePositions}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}

function LocateModal({
  unit,
  candidatePositions,
  onClose,
}: {
  unit: PendingUnit | null;
  candidatePositions: CandidatePosition[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<DestRow[]>([{ ...EMPTY_ROW }]);

  const posMap = useMemo(
    () => new Map(candidatePositions.map((p) => [p.id, p])),
    [candidatePositions]
  );

  function reset() {
    setRows([{ ...EMPTY_ROW }]);
    setError(null);
  }

  function close() {
    if (isPending) return;
    reset();
    onClose();
  }

  const totalRequested = rows.reduce(
    (acc, r) => acc + (Number(r.quantity) || 0),
    0
  );

  function onConfirm() {
    if (!unit) return;
    const usable = rows.filter((r) => r.positionId && Number(r.quantity) > 0);

    if (usable.length === 0) {
      setError("Agregá al menos un destino con posición y cantidad.");
      return;
    }

    // Gating de override: posiciones de otro cliente o bloqueadas/en revisión
    // requieren confirmación explícita.
    for (const r of usable) {
      const pos = posMap.get(r.positionId);
      if (!pos) continue;
      if ((pos.otherClient || pos.blocked) && !r.override) {
        setError(
          `La posición ${pos.code} requiere confirmar el override antes de ubicar.`
        );
        return;
      }
    }

    if (totalRequested > unit.available) {
      setError(
        `La suma (${totalRequested}) supera la cantidad disponible (${unit.available}).`
      );
      return;
    }

    const destinations = usable.map((r) => ({
      position_id: r.positionId,
      quantity: Number(r.quantity),
      assign_to_client: r.assign,
      override: r.override,
      ...(r.finalStatus ? { final_status: r.finalStatus } : {}),
    }));

    setError(null);
    startTransition(async () => {
      const res = await locateReceivedUnitAction(unit.id, destinations);
      if (!res.ok) {
        setError(res.error ?? "No se pudo ubicar.");
        return;
      }
      reset();
      onClose();
      router.refresh();
    });
  }

  if (!unit) return null;

  return (
    <Modal
      open={unit != null}
      onClose={close}
      title={`Ubicar ${formatReceivedUnitHeading(unit)}`}
      description={`Tipo ${RECEIVED_UNIT_TYPE_LABELS[unit.type]} · cantidad ${unit.physical_quantity}. Podés ubicar en una o más posiciones.`}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={close}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isPending}>
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MapPin className="h-4 w-4" />
            )}
            Confirmar ubicación
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {!unit.hasContent && (
          <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Esta unidad todavía no tiene contenido cargado. Podés ubicarla, pero
            no aparecerá en stock por producto para retiros.
          </p>
        )}

        {candidatePositions.length === 0 && (
          <p className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            No hay posiciones disponibles para este cliente. Asigná o creá
            posiciones libres primero.
          </p>
        )}

        {rows.map((row, idx) => {
          const selected = row.positionId ? posMap.get(row.positionId) : null;
          const showAssign = selected ? selected.free : false;
          const hasUnits = selected ? selected.currentUnitsCount > 0 : false;
          // Warning informativo: mismo cliente con mercadería ya ubicada.
          const sameClientWithUnits =
            selected != null &&
            !selected.otherClient &&
            !selected.blocked &&
            hasUnits;
          const needsOverride =
            selected != null && (selected.otherClient || selected.blocked);
          const setRow = (patch: Partial<DestRow>) =>
            setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
          return (
            <div key={idx} className="space-y-2 rounded-md border p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_7rem_auto]">
                <div className="space-y-1">
                  <Label className="text-xs">Posición destino</Label>
                  <Select
                    value={row.positionId}
                    onChange={(e) =>
                      setRow({ positionId: e.target.value, override: false })
                    }
                  >
                    <option value="">Seleccionar…</option>
                    {candidatePositions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code}
                        {p.assignedToClient
                          ? " (asignada)"
                          : p.free
                          ? " (libre)"
                          : p.otherClient
                          ? " (otro cliente)"
                          : p.blocked
                          ? ` (${POSITION_STATUS_LABELS[p.status]})`
                          : ""}
                      </option>
                    ))}
                  </Select>
                  {showAssign && (
                    <label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                      <Checkbox
                        checked={row.assign}
                        onChange={(e) => setRow({ assign: e.target.checked })}
                      />
                      Asignar esta posición al cliente
                    </label>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cantidad</Label>
                  <Input
                    type="number"
                    min={1}
                    step="any"
                    value={row.quantity}
                    onChange={(e) => setRow({ quantity: e.target.value })}
                  />
                </div>
                <div className="flex items-end">
                  {rows.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setRows((rs) => rs.filter((_, i) => i !== idx))
                      }
                      aria-label="Quitar destino"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Panel de situación actual de la posición */}
              {selected && (
                <div className="rounded-md bg-muted/40 px-3 py-2 text-xs">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                    <span>
                      <span className="text-muted-foreground">Posición: </span>
                      <span className="font-mono font-medium">
                        {selected.code}
                      </span>
                    </span>
                    <span>
                      <span className="text-muted-foreground">Estado: </span>
                      {POSITION_STATUS_LABELS[selected.status]}
                    </span>
                    <span>
                      <span className="text-muted-foreground">Cliente: </span>
                      {orDash(selected.assignedClientName)}
                    </span>
                    <span>
                      <span className="text-muted-foreground">
                        Unidades actuales:{" "}
                      </span>
                      {selected.currentUnitsCount}
                    </span>
                    <span className="sm:col-span-2">
                      <span className="text-muted-foreground">
                        Último ingreso:{" "}
                      </span>
                      {selected.lastEntryDate
                        ? formatDate(selected.lastEntryDate)
                        : "—"}
                    </span>
                  </div>
                  {selected.currentUnitCodes.length > 0 && (
                    <p className="mt-1 text-muted-foreground">
                      U. logísticas: {selected.currentUnitCodes.join(", ")}
                    </p>
                  )}
                </div>
              )}

              {/* Warning informativo: mismo cliente con mercadería */}
              {sameClientWithUnits && (
                <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Esta posición ya tiene mercadería ubicada. Revisá físicamente
                  si hay espacio disponible antes de confirmar.
                </p>
              )}

              {/* Warning + override: otro cliente */}
              {selected?.otherClient && (
                <div className="space-y-1 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <p className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    Esta posición tiene mercadería de otro cliente. Confirmá si
                    querés mezclar clientes en la misma posición.
                  </p>
                  <label className="flex items-center gap-2 font-medium">
                    <Checkbox
                      checked={row.override}
                      onChange={(e) => setRow({ override: e.target.checked })}
                    />
                    Confirmar override (queda registrado en el movimiento)
                  </label>
                </div>
              )}

              {/* Warning + override: bloqueada / en revisión */}
              {selected?.blocked && !selected.otherClient && (
                <div className="space-y-1 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <p className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    Esta posición está bloqueada o en revisión. Confirmá si
                    querés ubicar mercadería de todos modos.
                  </p>
                  <label className="flex items-center gap-2 font-medium">
                    <Checkbox
                      checked={row.override}
                      onChange={(e) => setRow({ override: e.target.checked })}
                    />
                    Confirmar override (queda registrado en el movimiento)
                  </label>
                </div>
              )}

              {/* Estado de ocupación tras ubicar (manual) */}
              {selected && (
                <div className="space-y-1">
                  <Label className="text-xs">Estado tras ubicar</Label>
                  <Select
                    value={row.finalStatus}
                    onChange={(e) =>
                      setRow({ finalStatus: e.target.value as FinalStatusChoice })
                    }
                  >
                    <option value="">
                      Automático
                      {selected.status === "free"
                        ? " (parcialmente ocupada)"
                        : " (sin cambios)"}
                    </option>
                    <option value="partially_occupied">
                      Parcialmente ocupada
                    </option>
                    <option value="occupied">Ocupada</option>
                  </Select>
                </div>
              )}
            </div>
          );
        })}

        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setRows((rs) => [...rs, { ...EMPTY_ROW }])}
          >
            <Plus className="h-4 w-4" />
            Agregar destino
          </Button>
          <span className="text-xs text-muted-foreground">
            Total a ubicar: {totalRequested} / {unit.available}
          </span>
        </div>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
