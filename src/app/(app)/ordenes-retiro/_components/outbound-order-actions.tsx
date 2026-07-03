"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PackagePlus, PackageMinus, Truck, XCircle } from "lucide-react";
import type { OutboundOrderStatus } from "@/lib/types/database";
import {
  addLogisticUnitToOutboundOrderAction,
  removeLogisticUnitFromOutboundOrderAction,
  prepareOutboundOrderAction,
  confirmOutboundLoadAction,
  cancelOutboundOrderAction,
} from "@/lib/actions/outbound";
import { Button } from "@/components/ui/button";

const TERMINAL: OutboundOrderStatus[] = ["closed", "loaded"];

export function OutboundOrderActions({
  orderId,
  status,
  staff,
  counts,
}: {
  orderId: string;
  status: OutboundOrderStatus;
  staff: boolean;
  counts: { pending: number; prepared: number; loaded: number };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!staff || TERMINAL.includes(status)) return null;

  const canPrepare = counts.pending > 0;
  const canConfirm =
    counts.prepared > 0 &&
    counts.pending === 0 &&
    (status === "ready_to_load" || status === "in_preparation");
  const canCancel = counts.prepared === 0 && counts.loaded === 0;

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "No se pudo completar la acción.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canPrepare && (
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() => prepareOutboundOrderAction({ outbound_order_id: orderId }))
            }
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PackageMinus className="h-4 w-4" />
            )}
            Preparar retiro
          </Button>
        )}
        {canConfirm && (
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() => confirmOutboundLoadAction({ outbound_order_id: orderId }))
            }
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Truck className="h-4 w-4" />
            )}
            Confirmar salida
          </Button>
        )}
        {canCancel && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (
                !window.confirm(
                  "¿Cancelar esta orden de retiro? Las unidades pendientes se liberarán."
                )
              ) {
                return;
              }
              run(() => cancelOutboundOrderAction({ outbound_order_id: orderId }));
            }}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            Cancelar orden
          </Button>
        )}
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function AddUnitButton({
  orderId,
  logisticUnitId,
  staff,
  disabled,
}: {
  orderId: string;
  logisticUnitId: string;
  staff: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!staff || disabled) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await addLogisticUnitToOutboundOrderAction({
              outbound_order_id: orderId,
              logistic_unit_id: logisticUnitId,
            });
            if (!result.ok) {
              setError(result.error ?? "No se pudo agregar la unidad.");
              return;
            }
            router.refresh();
          });
        }}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <PackagePlus className="h-4 w-4" />
        )}
        Agregar
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

export function RemoveUnitButton({
  orderId,
  lineId,
  staff,
}: {
  orderId: string;
  lineId: string;
  staff: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!staff) return null;

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("¿Quitar esta unidad de la orden?")) return;
        startTransition(async () => {
          await removeLogisticUnitFromOutboundOrderAction({
            outbound_order_id: orderId,
            line_id: lineId,
          });
          router.refresh();
        });
      }}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <PackageMinus className="h-4 w-4" />
      )}
      Quitar
    </Button>
  );
}
