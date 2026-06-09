"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { deleteInboundOrderAction } from "@/lib/actions/inbound";
import { Button } from "@/components/ui/button";

export function InboundDeleteButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    if (
      !window.confirm(
        "¿Eliminar esta orden de ingreso? Solo se puede si todavía no tiene movimientos, unidades, servicios ni documentos asociados (sin trazabilidad)."
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const res = await deleteInboundOrderAction(orderId);
      if (!res.ok) {
        setError(res.error ?? "No se pudo eliminar.");
        return;
      }
      router.push("/ordenes-ingreso");
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="destructive"
        onClick={onDelete}
        disabled={isPending}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
        Eliminar
      </Button>
      {error && (
        <p className="max-w-xs text-right text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
