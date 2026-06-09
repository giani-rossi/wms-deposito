"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { deleteClientAction } from "@/lib/actions/clients";
import { Button } from "@/components/ui/button";

export function DeleteClientButton({
  clientId,
  redirectToList = false,
  variant = "ghost",
}: {
  clientId: string;
  redirectToList?: boolean;
  variant?: "ghost" | "outline" | "destructive";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    if (
      !window.confirm(
        "¿Eliminar este cliente? Solo se puede si no tiene datos asociados."
      )
    )
      return;

    setError(null);
    startTransition(async () => {
      const res = await deleteClientAction(clientId);
      if (!res.ok) {
        setError(res.error ?? "No se pudo eliminar.");
        return;
      }
      if (redirectToList) router.push("/clientes");
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant={variant}
        size={variant === "ghost" ? "icon" : "default"}
        onClick={onDelete}
        disabled={isPending}
        aria-label="Eliminar cliente"
        title="Eliminar cliente"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
        {variant !== "ghost" && <span>Eliminar</span>}
      </Button>
      {error && (
        <p className="max-w-xs text-right text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
