import { Construction, Hammer, Layers } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import type { ModuleStatus } from "@/components/layout/module-status-banner";

const PLACEHOLDER_CONFIG: Record<
  ModuleStatus,
  { icon: typeof Construction; heading: string }
> = {
  preview: {
    icon: Layers,
    heading: "Vista básica disponible",
  },
  next: {
    icon: Hammer,
    heading: "Próximo módulo en desarrollo",
  },
  phase2: {
    icon: Construction,
    heading: "Módulo en construcción — fase 2",
  },
};

/**
 * Placeholder para módulos sin UI completa. Estado claro para el operario.
 */
export function ModulePlaceholder({
  title,
  description,
  nextStep,
  status = "phase2",
  children,
}: {
  title: string;
  description?: string;
  nextStep?: string;
  status?: ModuleStatus;
  children?: React.ReactNode;
}) {
  const cfg = PLACEHOLDER_CONFIG[status];
  const Icon = cfg.icon;

  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="space-y-6">
        {children}
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Icon className="h-6 w-6" />
            </div>
            <p className="font-medium">{cfg.heading}</p>
            {nextStep && (
              <p className="max-w-lg text-sm text-muted-foreground">{nextStep}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
