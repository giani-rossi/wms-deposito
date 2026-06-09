import { Construction, Hammer, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

export type ModuleStatus = "preview" | "next" | "phase2";

const CONFIG: Record<
  ModuleStatus,
  { icon: typeof Construction; title: string; className: string }
> = {
  preview: {
    icon: Layers,
    title: "Vista básica — funciones avanzadas en fase 2",
    className: "border-primary/30 bg-primary/5 text-foreground",
  },
  next: {
    icon: Hammer,
    title: "Próximo módulo en desarrollo",
    className: "border-amber-300 bg-amber-50 text-amber-900",
  },
  phase2: {
    icon: Construction,
    title: "Módulo en construcción — fase 2",
    className: "border-muted-foreground/20 bg-muted/50 text-muted-foreground",
  },
};

export function ModuleStatusBanner({
  status,
  message,
}: {
  status: ModuleStatus;
  message: string;
}) {
  const cfg = CONFIG[status];
  const Icon = cfg.icon;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        cfg.className
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">{cfg.title}</p>
        <p className="mt-0.5 opacity-90">{message}</p>
      </div>
    </div>
  );
}
