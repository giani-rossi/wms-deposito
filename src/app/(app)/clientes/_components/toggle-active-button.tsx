"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Power, PowerOff, Loader2 } from "lucide-react";
import { setClientActiveAction } from "@/lib/actions/clients";
import { Button } from "@/components/ui/button";

export function ToggleActiveButton({
  clientId,
  isActive,
  withLabel = false,
}: {
  clientId: string;
  isActive: boolean;
  withLabel?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onToggle() {
    startTransition(async () => {
      await setClientActiveAction(clientId, !isActive);
      router.refresh();
    });
  }

  const Icon = isActive ? PowerOff : Power;

  return (
    <Button
      type="button"
      variant="outline"
      size={withLabel ? "default" : "icon"}
      onClick={onToggle}
      disabled={isPending}
      title={isActive ? "Desactivar cliente" : "Activar cliente"}
      aria-label={isActive ? "Desactivar cliente" : "Activar cliente"}
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Icon className="h-4 w-4" />
      )}
      {withLabel && <span>{isActive ? "Desactivar" : "Activar"}</span>}
    </Button>
  );
}
