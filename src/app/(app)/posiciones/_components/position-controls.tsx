"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus, UserMinus, Check } from "lucide-react";
import type { PositionStatus } from "@/lib/types/database";
import {
  setPositionStatusAction,
  assignPositionToClientAction,
  releasePositionAction,
} from "@/lib/actions/positions";
import {
  POSITION_STATUS_LABELS,
  POSITION_STATUS_DESCRIPTIONS,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { BlockToggleButton } from "./block-toggle-button";

type ClientOption = { id: string; nombre: string };

export function PositionControls({
  positionId,
  status,
  assignedClientId,
  assignedClientName,
  clients,
  canAssignClient = true,
}: {
  positionId: string;
  status: PositionStatus;
  assignedClientId: string | null;
  assignedClientName: string | null;
  clients: ClientOption[];
  canAssignClient?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [newStatus, setNewStatus] = useState<PositionStatus>(status);
  const [assignOpen, setAssignOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);

  // Estado del modal de asignación
  const [clientId, setClientId] = useState(assignedClientId ?? "");
  const [assignNotes, setAssignNotes] = useState("");
  const [finalStatus, setFinalStatus] = useState<"free" | "blocked">("free");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "Ocurrió un error.");
        return;
      }
      after?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Cambiar estado */}
      <div className="space-y-2">
        <Label htmlFor="status-changer">Cambiar estado</Label>
        <div className="flex items-center gap-2">
          <Select
            id="status-changer"
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as PositionStatus)}
            disabled={isPending}
          >
            {Object.entries(POSITION_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            variant="secondary"
            disabled={isPending || newStatus === status}
            onClick={() =>
              run(() => setPositionStatusAction(positionId, newStatus))
            }
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Aplicar
          </Button>
        </div>
        {POSITION_STATUS_DESCRIPTIONS[newStatus] && (
          <p className="text-xs text-muted-foreground">
            {POSITION_STATUS_DESCRIPTIONS[newStatus]}
          </p>
        )}
      </div>

      {/* Acciones */}
      <div className="flex flex-wrap gap-2">
        <BlockToggleButton
          positionId={positionId}
          blocked={status === "blocked"}
          withLabel
        />
        {canAssignClient && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setClientId(assignedClientId ?? "");
              setAssignNotes("");
              setAssignOpen(true);
            }}
          >
            <UserPlus className="h-4 w-4" />
            {assignedClientId ? "Reasignar cliente" : "Asignar cliente"}
          </Button>
        )}
        {canAssignClient && assignedClientId && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setFinalStatus("free");
              setReleaseOpen(true);
            }}
          >
            <UserMinus className="h-4 w-4" />
            Liberar
          </Button>
        )}
      </div>

      {!canAssignClient && (
        <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Las zonas operativas son temporales y compartidas: no se asignan a un
          cliente.
        </p>
      )}

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Modal: asignar cliente */}
      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Asignar posición a cliente"
        description="Se cerrará la asignación activa anterior (si existe) y se registrará la nueva en el historial."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAssignOpen(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isPending || !clientId}
              onClick={() =>
                run(
                  () =>
                    assignPositionToClientAction(
                      positionId,
                      clientId,
                      assignNotes
                    ),
                  () => setAssignOpen(false)
                )
              }
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Asignar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="assign-client">Cliente</Label>
            <Select
              id="assign-client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">Seleccioná un cliente…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="assign-notes">Notas (opcional)</Label>
            <Textarea
              id="assign-notes"
              value={assignNotes}
              onChange={(e) => setAssignNotes(e.target.value)}
              placeholder="Ej: asignación temporal por campaña"
            />
          </div>
        </div>
      </Modal>

      {/* Modal: liberar */}
      <Modal
        open={releaseOpen}
        onClose={() => setReleaseOpen(false)}
        title="Liberar posición"
        description={
          assignedClientName
            ? `Se cerrará la asignación de ${assignedClientName} y la posición quedará sin cliente.`
            : "Se cerrará la asignación activa y la posición quedará sin cliente."
        }
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReleaseOpen(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(
                  () => releasePositionAction(positionId, finalStatus),
                  () => setReleaseOpen(false)
                )
              }
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Liberar
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="final-status">Estado final de la posición</Label>
          <Select
            id="final-status"
            value={finalStatus}
            onChange={(e) =>
              setFinalStatus(e.target.value as "free" | "blocked")
            }
          >
            <option value="free">Libre</option>
            <option value="blocked">Bloqueada</option>
          </Select>
        </div>
      </Modal>
    </div>
  );
}
