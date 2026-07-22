"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  Loader2,
  AlertTriangle,
  MapPin,
  SplitSquareVertical,
  Check,
} from "lucide-react";
import { moveLogisticUnitAction } from "@/lib/actions/internal-movement";
import {
  splitLogisticUnitAction,
  type SplitDestination,
  type SplitLogisticUnitResult,
} from "@/lib/actions/split-logistic-unit";
import {
  LOGISTIC_UNIT_TYPE_LABELS,
} from "@/lib/constants";
import type {
  ClassifyMoveDestinationResult,
  MoveDestinationKind,
} from "@/lib/movements/classify-move-destination";
import type { LogisticUnitType, PositionStatus } from "@/lib/types/database";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LogisticUnitStatusBadge } from "@/components/status-badges";

export type MoveDestinationOption = {
  id: string;
  code: string;
  status: PositionStatus;
} & ClassifyMoveDestinationResult;

export type { MoveDestinationKind };

export type SplittableContentLine = {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  lot: string | null;
  quantity: number;
  unitOfMeasure: string | null;
};

export type MoveableUnit = {
  id: string;
  code: string;
  type: LogisticUnitType;
  status: string;
  clientId: string;
  clientName: string;
  entryDate: string | null;
  stockSummary: string;
  currentPositionCode: string;
  contentLines: SplittableContentLine[];
  canSplit: boolean;
};

export function PositionUnitsWithMove({
  units,
  destinationsByClient,
  currentPositionId,
  staff,
}: {
  units: MoveableUnit[];
  destinationsByClient: Record<string, MoveDestinationOption[]>;
  currentPositionId: string;
  staff: boolean;
}) {
  const [moveTarget, setMoveTarget] = useState<MoveableUnit | null>(null);
  const [splitTarget, setSplitTarget] = useState<MoveableUnit | null>(null);

  const moveDestinations = moveTarget
    ? (destinationsByClient[moveTarget.clientId] ?? [])
    : [];

  if (units.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay unidades logísticas ubicadas en esta posición.
      </p>
    );
  }

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Para mover o retirar una fracción de producto, usá{" "}
        <strong>Fraccionar</strong>: se crea una unidad logística hija con ese
        stock. No se mueve producto suelto.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Contenido</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Ingreso</TableHead>
            {staff && <TableHead className="text-right">Acción</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {units.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-mono text-sm font-medium">
                {u.code}
              </TableCell>
              <TableCell>{LOGISTIC_UNIT_TYPE_LABELS[u.type]}</TableCell>
              <TableCell className="text-muted-foreground">
                {u.clientName}
              </TableCell>
              <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                {u.stockSummary || "—"}
              </TableCell>
              <TableCell>
                <LogisticUnitStatusBadge status={u.status as "located"} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {u.entryDate ?? "—"}
              </TableCell>
              {staff && (
                <TableCell className="text-right">
                  {u.status === "located" ? (
                    <div className="flex flex-wrap justify-end gap-1">
                      {u.canSplit && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSplitTarget(u)}
                        >
                          <SplitSquareVertical className="h-4 w-4" />
                          Fraccionar
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setMoveTarget(u)}
                      >
                        <ArrowLeftRight className="h-4 w-4" />
                        Mover
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <MoveLogisticUnitModal
        unit={moveTarget}
        destinations={moveDestinations}
        currentPositionId={currentPositionId}
        onClose={() => setMoveTarget(null)}
      />

      <SplitLogisticUnitModal
        unit={splitTarget}
        destinations={
          splitTarget ? (destinationsByClient[splitTarget.clientId] ?? []) : []
        }
        currentPositionId={currentPositionId}
        onClose={() => setSplitTarget(null)}
      />
    </>
  );
}

function MoveLogisticUnitModal({
  unit,
  destinations,
  currentPositionId,
  onClose,
}: {
  unit: MoveableUnit | null;
  destinations: MoveDestinationOption[];
  currentPositionId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [destId, setDestId] = useState("");
  const [notes, setNotes] = useState("");
  const [override, setOverride] = useState(false);

  const options = useMemo(
    () => destinations.filter((d) => d.id !== currentPositionId),
    [destinations, currentPositionId]
  );

  const selected = destId ? options.find((d) => d.id === destId) : null;
  const needsOverride = Boolean(selected?.requiresOverride);
  const needsNote = Boolean(selected?.requiresOverride && override);
  const isInformativeWarning =
    selected?.kind === "unassigned_free" ||
    selected?.kind === "same_client_occupied";
  const isOverrideWarning = Boolean(
    selected?.requiresOverride && selected.warningMessage
  );

  function close() {
    setError(null);
    setDestId("");
    setNotes("");
    setOverride(false);
    onClose();
  }

  function onConfirm() {
    if (!unit || !destId) {
      setError("Elegí la posición destino.");
      return;
    }
    if (needsOverride && !override) {
      setError("Confirmá el override para mover a esta posición.");
      return;
    }
    if (needsNote && !notes.trim()) {
      setError(
        "Debés ingresar una nota obligatoria para confirmar este movimiento."
      );
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await moveLogisticUnitAction({
        logistic_unit_id: unit.id,
        to_position_id: destId,
        notes: notes.trim() || null,
        override,
      });
      if (!res.ok) {
        setError(res.error ?? "No se pudo mover la unidad.");
        return;
      }
      close();
      router.refresh();
    });
  }

  if (!unit) return null;

  return (
    <Modal
      open={unit != null}
      onClose={close}
      title={`Mover ${unit.code}`}
      description={`Desde ${unit.currentPositionCode} · ${LOGISTIC_UNIT_TYPE_LABELS[unit.type]}${unit.stockSummary ? ` · ${unit.stockSummary}` : ""}`}
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
            Confirmar movimiento
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Se moverá la unidad logística completa con todo su contenido.
        </p>

        <div className="space-y-2">
          <Label htmlFor="move-dest">Posición destino (rack o piso guardado)</Label>
          <Select
            id="move-dest"
            value={destId}
            onChange={(e) => {
              setDestId(e.target.value);
              setOverride(false);
              setError(null);
            }}
          >
            <option value="">Seleccionar…</option>
            {options.map((d) => (
              <option key={d.id} value={d.id}>
                {d.optionLabel}
              </option>
            ))}
          </Select>
        </div>

        {selected?.warningMessage && isInformativeWarning && (
          <p className="flex items-start gap-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {selected.warningMessage}
          </p>
        )}

        {isOverrideWarning && (
          <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {selected?.warningMessage} Requiere override y nota obligatoria.
          </p>
        )}

        {needsOverride && (
          <label className="flex items-center gap-3 rounded-md border p-3">
            <Checkbox
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
            />
            <span className="text-sm">
              Confirmo mover a esta posición (override staff)
            </span>
          </label>
        )}

        <div className="space-y-2">
          <Label htmlFor="move-notes">
            Notas
            {needsOverride
              ? override
                ? " (obligatorias)"
                : " (obligatorias si confirmás override)"
              : " (opcional)"}
          </Label>
          <Textarea
            id="move-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Motivo del movimiento, observaciones…"
          />
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

type SplitSuccess = Extract<SplitLogisticUnitResult, { ok: true }>;

function SplitLogisticUnitModal({
  unit,
  destinations,
  currentPositionId,
  onClose,
}: {
  unit: MoveableUnit | null;
  destinations: MoveDestinationOption[];
  currentPositionId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [destination, setDestination] = useState<SplitDestination>("relocate");
  const [rackDestId, setRackDestId] = useState("");
  const [override, setOverride] = useState(false);
  const [notes, setNotes] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<SplitSuccess | null>(null);

  const rackOptions = useMemo(
    () => destinations.filter((d) => d.id !== currentPositionId),
    [destinations, currentPositionId]
  );

  const selectedRack = rackDestId
    ? rackOptions.find((d) => d.id === rackDestId)
    : null;
  const needsOverride = Boolean(
    destination === "rack" && selectedRack?.requiresOverride
  );
  const needsNote = Boolean(needsOverride && override);
  const isInformativeWarning =
    destination === "rack" &&
    (selectedRack?.kind === "unassigned_free" ||
      selectedRack?.kind === "same_client_occupied");
  const isOverrideWarning = Boolean(
    destination === "rack" &&
      selectedRack?.requiresOverride &&
      selectedRack.warningMessage
  );

  const confirmDisabled =
    isPending ||
    (destination === "rack" && !rackDestId) ||
    (needsOverride && !override) ||
    (needsOverride && override && !notes.trim());

  function close() {
    if (isPending) return;
    setError(null);
    setDestination("relocate");
    setRackDestId("");
    setOverride(false);
    setNotes("");
    setQuantities({});
    setSuccess(null);
    onClose();
  }

  function setQty(contentId: string, value: string) {
    setQuantities((prev) => ({ ...prev, [contentId]: value }));
  }

  function onConfirm() {
    if (!unit) return;

    const lines = unit.contentLines
      .map((line) => ({
        content_id: line.id,
        quantity: Number(quantities[line.id] ?? 0),
      }))
      .filter((l) => l.quantity > 0);

    if (lines.length === 0) {
      setError("Indicá al menos una cantidad mayor a cero.");
      return;
    }

    for (const line of lines) {
      const source = unit.contentLines.find((c) => c.id === line.content_id);
      if (!source) continue;
      if (line.quantity > source.quantity) {
        setError(
          `La cantidad de ${source.productName} supera lo disponible (${source.quantity}).`
        );
        return;
      }
    }

    if (destination === "rack" && !rackDestId) {
      setError("Elegí la posición rack destino.");
      return;
    }
    if (needsOverride && !override) {
      setError("Confirmá el override para fraccionar a esta posición.");
      return;
    }
    if (needsOverride && override && !notes.trim()) {
      setError(
        "Debés ingresar una nota obligatoria para confirmar este fraccionamiento."
      );
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await splitLogisticUnitAction({
        logistic_unit_id: unit.id,
        destination,
        lines,
        target_position_id:
          destination === "rack" ? rackDestId : null,
        override: destination === "rack" ? override : false,
        notes: destination === "rack" ? notes.trim() || null : null,
      });
      if (!res.ok) {
        setError(res.error ?? "No se pudo fraccionar la unidad.");
        return;
      }
      setSuccess(res);
      router.refresh();
    });
  }

  if (!unit) return null;

  return (
    <Modal
      open={unit != null}
      onClose={close}
      title={success ? "Fraccionamiento confirmado" : `Fraccionar ${unit.code}`}
      description={
        success
          ? undefined
          : `${unit.currentPositionCode} · ${unit.clientName} · ${LOGISTIC_UNIT_TYPE_LABELS[unit.type]}`
      }
      footer={
        success ? (
          <Button type="button" onClick={close}>
            Cerrar
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={onConfirm}
              disabled={confirmDisabled}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SplitSquareVertical className="h-4 w-4" />
              )}
              Confirmar fraccionamiento
            </Button>
          </>
        )
      }
    >
      {success ? (
        <div className="space-y-4">
          <p className="flex items-start gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
            Se creó la unidad logística{" "}
            <span className="font-mono font-medium">{success.childCode}</span>.
          </p>

          {success.parentExited && (
            <p className="text-sm text-muted-foreground">
              La unidad origen quedó vacía y fue marcada como egresada.
            </p>
          )}

          {success.destination === "relocate" ? (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                La UL hija quedó en{" "}
                <span className="font-mono">FLOOR-INBOUND-01</span>, lista para
                ubicar en rack.
              </p>
              {success.inboundOrderId ? (
                <Link
                  href={`/ordenes-ingreso/${success.inboundOrderId}#ubicacion`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Ir a ubicación en la orden de ingreso
                </Link>
              ) : (
                <p>
                  Podés ubicarla desde la orden de ingreso correspondiente al
                  cliente.
                </p>
              )}
            </div>
          ) : success.destination === "outbound" ? (
            <p className="text-sm text-muted-foreground">
              La UL hija quedó en{" "}
              <span className="font-mono">FLOOR-OUTBOUND-01</span>. Lista en
              piso retiro para futura orden de retiro.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              La UL hija quedó ubicada directamente en{" "}
              <span className="font-mono">
                {success.targetPositionCode ?? "rack"}
              </span>
              .
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Separá cantidades del contenido. Se creará una nueva unidad
            logística hija; la origen conserva el resto en esta posición.
          </p>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead className="text-right">Disponible</TableHead>
                <TableHead className="w-32">Separar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unit.contentLines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <div className="font-medium">{line.productName}</div>
                    {line.sku && (
                      <div className="text-xs text-muted-foreground">
                        {line.sku}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {line.lot ?? "—"}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {line.quantity} {line.unitOfMeasure ?? ""}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      max={line.quantity}
                      step="any"
                      value={quantities[line.id] ?? ""}
                      onChange={(e) => setQty(line.id, e.target.value)}
                      placeholder="0"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="space-y-2">
            <Label htmlFor="split-destination">Destino de la UL hija</Label>
            <Select
              id="split-destination"
              value={destination}
              onChange={(e) => {
                setDestination(e.target.value as SplitDestination);
                setRackDestId("");
                setOverride(false);
                setNotes("");
                setError(null);
              }}
            >
              <option value="relocate">
                Reubicar después (FLOOR-INBOUND-01)
              </option>
              <option value="outbound">
                Preparar retiro (FLOOR-OUTBOUND-01)
              </option>
              <option value="rack">Ubicar directamente en rack</option>
            </Select>
          </div>

          {destination === "rack" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="split-rack-dest">Posición rack destino</Label>
                <Select
                  id="split-rack-dest"
                  value={rackDestId}
                  onChange={(e) => {
                    setRackDestId(e.target.value);
                    setOverride(false);
                    setNotes("");
                    setError(null);
                  }}
                >
                  <option value="">Seleccionar…</option>
                  {rackOptions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.optionLabel}
                    </option>
                  ))}
                </Select>
              </div>

              {selectedRack?.warningMessage && isInformativeWarning && (
                <p className="flex items-start gap-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {selectedRack.warningMessage}
                </p>
              )}

              {isOverrideWarning && (
                <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {selectedRack?.warningMessage} Requiere override y nota
                  obligatoria.
                </p>
              )}

              {needsOverride && (
                <label className="flex items-center gap-3 rounded-md border p-3">
                  <Checkbox
                    checked={override}
                    onChange={(e) => setOverride(e.target.checked)}
                  />
                  <span className="text-sm">
                    Confirmo fraccionar a esta posición (override staff)
                  </span>
                </label>
              )}

              <div className="space-y-2">
                <Label htmlFor="split-notes">
                  Notas
                  {needsOverride
                    ? override
                      ? " (obligatorias)"
                      : " (obligatorias si confirmás override)"
                    : " (opcional)"}
                </Label>
                <Textarea
                  id="split-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Motivo del fraccionamiento, observaciones…"
                />
              </div>
            </>
          )}

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
