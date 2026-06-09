"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, LockOpen, Loader2 } from "lucide-react";
import { setPositionBlockedAction } from "@/lib/actions/positions";
import { Button } from "@/components/ui/button";

export function BlockToggleButton({
  positionId,
  blocked,
  withLabel = false,
}: {
  positionId: string;
  blocked: boolean;
  withLabel?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onToggle() {
    startTransition(async () => {
      await setPositionBlockedAction(positionId, !blocked);
      router.refresh();
    });
  }

  const Icon = blocked ? LockOpen : Lock;

  return (
    <Button
      type="button"
      variant="outline"
      size={withLabel ? "default" : "icon"}
      onClick={onToggle}
      disabled={isPending}
      title={blocked ? "Desbloquear posición" : "Bloquear posición"}
      aria-label={blocked ? "Desbloquear posición" : "Bloquear posición"}
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Icon className="h-4 w-4" />
      )}
      {withLabel && <span>{blocked ? "Desbloquear" : "Bloquear"}</span>}
    </Button>
  );
}
