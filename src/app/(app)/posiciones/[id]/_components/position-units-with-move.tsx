"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Loader2, AlertTriangle, MapPin } from "lucide-react";
import { moveLogisticUnitAction } from "@/lib/actions/internal-movement";
import {
  LOGISTIC_UNIT_TYPE_LABELS,
  positionSelectLabel,
} from "@/lib/constants";
import type { LogisticUnitType, PositionStatus } from "@/lib/types/database";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
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
  assignedToClient: boolean;
  free: boolean;
  otherClient: boolean;
  blocked: boolean;
  sameClientWithUnits: boolean;
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
  const [target, setTarget] = useState<MoveableUnit | null>(null);

  const destinations = target
    ? (destinationsByClient[target.clientId] ?? [])
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
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setTarget(u)}
                    >
                      <ArrowLeftRight className="h-4 w-4" />
                      Mover
                    </Button>
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
        unit={target}
        destinations={destinations}
        currentPositionId={currentPositionId}
        onClose={() => setTarget(null)}
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
  const needsOverride = Boolean(
    selected && (selected.blocked || selected.otherClient)
  );
  const needsNote = Boolean(selected?.otherClient && override);
  const sameClientWarning = Boolean(selected?.sameClientWithUnits);

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
      setError("La nota es obligatoria al mezclar clientes.");
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
          <Label htmlFor="move-dest">Posición destino (rack)</Label>
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
                {positionSelectLabel(d.code)}
                {d.blocked ? " · bloqueada/revisión" : ""}
                {d.otherClient ? " · otro cliente" : ""}
              </option>
            ))}
          </Select>
        </div>

        {selected?.blocked && (
          <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            La posición destino está bloqueada o en revisión. Solo staff puede
            confirmar con override.
          </p>
        )}

        {selected?.otherClient && (
          <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Hay mercadería de otro cliente en el destino. Requiere override y
            nota obligatoria.
          </p>
        )}

        {sameClientWarning && !selected?.otherClient && (
          <p className="flex items-start gap-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            El destino ya tiene mercadería del mismo cliente. Podés continuar.
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
            Notas{needsNote ? " (obligatorias)" : " (opcional)"}
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
