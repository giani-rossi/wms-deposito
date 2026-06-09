"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Check,
  TruckIcon,
  AlertTriangle,
  MapPin,
  ClipboardList,
  PackagePlus,
  Boxes,
} from "lucide-react";
import type {
  InboundOrderStatus,
  InboundOrderDischargeRow,
} from "@/lib/types/database";
import {
  setInboundStatusAction,
  registerDownloadAction,
  generateMissingReceivedUnitsAction,
  closeInboundOrderAction,
} from "@/lib/actions/inbound";
import { INBOUND_ORDER_STATUS_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal } from "@/components/ui/modal";

type Flow = {
  unitsCount: number;
  hasDischarge: boolean;
  /** Unidades recibidas sin ningún producto/SKU cargado. */
  needContent: number;
  needClassification: number;
  readyToLocate: number;
  allLocated: boolean;
};

type NextStep = {
  title: string;
  text: string;
  action: GuidedAction | null;
  tone?: "incident" | "done";
};

type GuidedAction =
  | { kind: "discharge"; label: string }
  | { kind: "generate"; label: string }
  | { kind: "link"; href: string; label: string }
  | { kind: "tab"; hash: string; label: string }
  | {
      kind: "status";
      target: InboundOrderStatus;
      label: string;
      variant?: "default" | "secondary" | "ghost";
      help?: string;
      tone?: "incident";
    };

/**
 * Próximo paso operativo recomendado, según estado y unidades. Guía al
 * usuario a la acción correcta sin tener que adivinar la siguiente etapa.
 */
function computeNextStep(status: InboundOrderStatus, flow: Flow): NextStep {
  if (status === "closed") {
    return {
      title: "Orden cerrada",
      text: "La orden fue cerrada. No quedan pasos pendientes.",
      action: null,
      tone: "done",
    };
  }
  if (status === "incident") {
    return {
      title: "Resolver revisión",
      text: "Esta orden tiene una revisión pendiente. Verificá diferencias, daños o datos faltantes y luego quitá la revisión para continuar.",
      action: {
        kind: "status",
        target: flow.hasDischarge ? "downloaded" : "pending_download",
        label: "Quitar revisión",
      },
      tone: "incident",
    };
  }
  if (!flow.hasDischarge || status === "pending_download") {
    return {
      title: "Registrar descarga",
      text: "Registrá qué se descargó del camión para generar unidades recibidas y servicios facturables.",
      action: { kind: "discharge", label: "Registrar descarga" },
    };
  }
  if (flow.unitsCount === 0) {
    return {
      title: "Generar unidades recibidas",
      text: "Usá el resumen de descarga para generar las unidades recibidas.",
      action: {
        kind: "generate",
        label: "Generar unidades recibidas desde descarga",
      },
    };
  }
  // Contenido antes de clasificación/ubicación (no bloquea, solo guía).
  if (flow.needContent > 0 && !flow.allLocated) {
    return {
      title: "Cargar contenido / stock",
      text: "Cargá los productos/SKU que ingresaron para que luego puedan buscarse en retiros.",
      action: {
        kind: "tab",
        hash: "contenido",
        label: "Ir a Contenido / stock",
      },
    };
  }
  if (flow.needClassification > 0) {
    return {
      title: "Clasificar unidades",
      text: "Hay unidades que requieren clasificación, desconsolidación, armado o reembalaje antes de ubicarse.",
      action: {
        kind: "link",
        href: "/clasificacion",
        label: "Ir a clasificación",
      },
    };
  }
  if (flow.readyToLocate > 0) {
    return {
      title: "Ubicar mercadería",
      text: "Las unidades ya pueden asignarse a posiciones físicas del cliente.",
      action: { kind: "tab", hash: "ubicacion", label: "Ir a ubicación" },
    };
  }
  if (flow.allLocated) {
    return {
      title: "Cerrar orden",
      text: "Todas las unidades fueron ubicadas. Podés cerrar la orden.",
      action: { kind: "status", target: "closed", label: "Cerrar orden" },
      tone: "done",
    };
  }
  return {
    title: "En proceso",
    text: "Seguí con el siguiente paso operativo según el avance de la orden.",
    action: null,
  };
}

/** Estado activo al reabrir una orden cerrada (según avance real del flujo). */
function statusAfterReopen(flow: Flow): InboundOrderStatus {
  if (flow.allLocated) return "located";
  if (flow.readyToLocate > 0 || flow.needClassification > 0) {
    return "ready_to_locate";
  }
  if (flow.hasDischarge) return "downloaded";
  return "pending_download";
}

const COUNTS: { name: string; label: string; key: keyof InboundOrderDischargeRow }[] = [
  { name: "pallets_count", label: "Pallets", key: "pallets_count" },
  { name: "boxes_count", label: "Cajas", key: "boxes_count" },
  { name: "packages_count", label: "Bultos", key: "packages_count" },
  { name: "loose_items_count", label: "Unidades sueltas", key: "loose_items_count" },
];

const FLAGS: { name: string; label: string; key: keyof InboundOrderDischargeRow }[] = [
  {
    name: "requires_desconsolidation",
    label: "Requiere desconsolidación",
    key: "requires_desconsolidation",
  },
  {
    name: "requires_classification",
    label: "Requiere clasificación",
    key: "requires_classification",
  },
  {
    name: "requires_assembly",
    label: "Requiere armado",
    key: "requires_assembly",
  },
];

export function InboundStatusControl({
  orderId,
  status,
  discharge,
  flow,
  staff = false,
  admin = false,
}: {
  orderId: string;
  status: InboundOrderStatus;
  discharge?: InboundOrderDischargeRow | null;
  flow: Flow;
  staff?: boolean;
  admin?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dischargeOpen, setDischargeOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeWarning, setCloseWarning] = useState<string | null>(null);

  const nextStep = computeNextStep(status, flow);
  const closeInNextStep =
    nextStep.action?.kind === "status" &&
    nextStep.action.target === "closed";
  const showCloseButton =
    status !== "closed" && flow.allLocated && !closeInNextStep;

  function runClose(force: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await closeInboundOrderAction(orderId, force);
      if (!res.ok) {
        if (res.pending) {
          setCloseWarning(res.error ?? "La orden tiene pendientes.");
          return;
        }
        setError(res.error ?? "No se pudo cerrar la orden.");
        setCloseOpen(false);
        return;
      }
      setCloseOpen(false);
      setCloseWarning(null);
      router.refresh();
    });
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "Ocurrió un error.");
        return;
      }
      router.refresh();
    });
  }

  function onSubmitDischarge(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await registerDownloadAction(orderId, formData);
      if (!res.ok) {
        setError(res.error ?? "No se pudo registrar la descarga.");
        return;
      }
      setDischargeOpen(false);
      router.refresh();
    });
  }

  const num = (k: keyof InboundOrderDischargeRow) =>
    discharge && typeof discharge[k] === "number"
      ? (discharge[k] as number)
      : 0;
  const flag = (k: keyof InboundOrderDischargeRow) =>
    discharge ? Boolean(discharge[k]) : false;

  function onReopen() {
    const target = statusAfterReopen(flow);
    const label = INBOUND_ORDER_STATUS_LABELS[target];
    if (
      !window.confirm(
        `¿Reabrir esta orden? Volverá al estado "${label}" según el avance actual.`
      )
    ) {
      return;
    }
    run(() => setInboundStatusAction(orderId, target));
  }

  function onAdminCorrect(target: "downloaded" | "pending_download") {
    const label = INBOUND_ORDER_STATUS_LABELS[target];
    if (
      !window.confirm(
        `Corrección administrativa: vas a forzar el estado a "${label}". Esto puede desincronizar el flujo operativo y la trazabilidad. ¿Continuar?`
      )
    ) {
      return;
    }
    run(() => setInboundStatusAction(orderId, target));
  }

  function renderAction(a: GuidedAction, primary = false) {
    if (a.kind === "discharge") {
      return (
        <Button
          key={"discharge"}
          type="button"
          variant={primary ? "default" : "outline"}
          className="w-full"
          disabled={isPending}
          onClick={() => setDischargeOpen(true)}
        >
          <TruckIcon className="h-4 w-4" />
          {a.label}
        </Button>
      );
    }
    if (a.kind === "generate") {
      return (
        <Button
          key={"generate"}
          type="button"
          variant={primary ? "default" : "outline"}
          className="w-full"
          disabled={isPending}
          onClick={() =>
            run(() => generateMissingReceivedUnitsAction(orderId))
          }
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PackagePlus className="h-4 w-4" />
          )}
          {a.label}
        </Button>
      );
    }
    if (a.kind === "link") {
      return (
        <Link
          key={"link-" + a.href}
          href={a.href}
          className={cn(
            buttonVariants({ variant: primary ? "default" : "outline" }),
            "w-full"
          )}
        >
          <ClipboardList className="h-4 w-4" />
          {a.label}
        </Link>
      );
    }
    if (a.kind === "tab") {
      const TabIcon = a.hash === "contenido" ? Boxes : MapPin;
      return (
        <a
          key={"tab-" + a.hash}
          href={`#${a.hash}`}
          className={cn(
            buttonVariants({ variant: primary ? "default" : "outline" }),
            "w-full"
          )}
        >
          <TabIcon className="h-4 w-4" />
          {a.label}
        </a>
      );
    }
    // El cierre de orden pasa por confirmación + validaciones.
    if (a.target === "closed") {
      return (
        <Button
          key="close"
          type="button"
          variant={primary ? "default" : a.variant ?? "default"}
          className="w-full"
          disabled={isPending}
          onClick={() => {
            setCloseWarning(null);
            setCloseOpen(true);
          }}
        >
          <Check className="h-4 w-4" />
          {a.label}
        </Button>
      );
    }
    return (
      <div key={a.target + a.label} className="space-y-1">
        <Button
          type="button"
          variant={primary ? "default" : a.variant ?? "default"}
          className={cn("w-full", a.tone === "incident" && "text-status-incident")}
          disabled={isPending}
          onClick={() => run(() => setInboundStatusAction(orderId, a.target))}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : a.tone === "incident" ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          {a.label}
        </Button>
        {a.help && (
          <p className="px-1 text-xs text-muted-foreground">{a.help}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Próximo paso recomendado */}
      <div
        className={cn(
          "rounded-lg border p-4",
          nextStep.tone === "incident"
            ? "border-status-incident/40 bg-status-incident/5"
            : nextStep.tone === "done"
            ? "border-emerald-200 bg-emerald-50"
            : "border-primary/40 bg-primary/5"
        )}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Próximo paso
        </p>
        <h4 className="mt-1 text-base font-semibold">{nextStep.title}</h4>
        <p className="mt-1 text-sm text-muted-foreground">{nextStep.text}</p>
        {nextStep.action && (
          <div className="mt-3">{renderAction(nextStep.action, true)}</div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
        <span className="text-sm text-muted-foreground">Estado actual</span>
        <span className="text-sm font-semibold">
          {INBOUND_ORDER_STATUS_LABELS[status]}
        </span>
      </div>

      {/* Acciones explícitas (no selector de estados técnicos) */}
      <div className="space-y-2">
        {status !== "incident" && status !== "closed" && (
          <Button
            type="button"
            variant="ghost"
            className="w-full text-status-incident"
            disabled={isPending}
            onClick={() =>
              run(() => setInboundStatusAction(orderId, "incident"))
            }
          >
            <AlertTriangle className="h-4 w-4" />
            Marcar en revisión
          </Button>
        )}

        {showCloseButton && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={isPending}
            onClick={() => {
              setCloseWarning(null);
              setCloseOpen(true);
            }}
          >
            <Check className="h-4 w-4" />
            Cerrar orden
          </Button>
        )}

        {status === "closed" && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={isPending}
            onClick={onReopen}
          >
            <Check className="h-4 w-4" />
            Reabrir orden
          </Button>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Correcciones administrativas (solo admin, opciones limitadas) */}
      {admin && (
        <details className="rounded-md border px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            Correcciones administrativas
          </summary>
          <div className="mt-3 space-y-2">
            <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
              Usá estas acciones solo para corregir errores. Los estados
              intermedios deben avanzar por el flujo guiado (descarga,
              contenido, clasificación, ubicación).
            </p>
            <div className="grid grid-cols-1 gap-2">
              {status !== "incident" && status !== "closed" && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-start text-status-incident"
                  disabled={isPending}
                  onClick={() =>
                    run(() => setInboundStatusAction(orderId, "incident"))
                  }
                >
                  <AlertTriangle className="h-4 w-4" />
                  Marcar en revisión
                </Button>
              )}
              {status !== "closed" && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  disabled={isPending}
                  onClick={() => {
                    setCloseWarning(null);
                    setCloseOpen(true);
                  }}
                >
                  <Check className="h-4 w-4" />
                  Cerrar orden
                </Button>
              )}
              {status === "closed" && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  disabled={isPending}
                  onClick={onReopen}
                >
                  <Check className="h-4 w-4" />
                  Reabrir orden
                </Button>
              )}
              {status !== "downloaded" && status !== "closed" && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full justify-start"
                  disabled={isPending}
                  onClick={() => onAdminCorrect("downloaded")}
                >
                  Corregir a Descargada
                </Button>
              )}
              {status !== "pending_download" && status !== "closed" && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full justify-start"
                  disabled={isPending}
                  onClick={() => onAdminCorrect("pending_download")}
                >
                  Corregir a Pendiente de descarga
                </Button>
              )}
            </div>
          </div>
        </details>
      )}

      {/* Modal: cerrar orden con confirmación + validaciones */}
      <Modal
        open={closeOpen}
        onClose={() => !isPending && setCloseOpen(false)}
        title="Cerrar orden de ingreso"
        description="Vas a cerrar esta orden. Confirmá que no queda mercadería pendiente en Piso ingreso, Revisión, clasificación, armado o ubicación."
      >
        <div className="space-y-4">
          {closeWarning ? (
            <div className="space-y-1 rounded-md border border-status-incident/40 bg-status-incident/5 px-3 py-2 text-sm">
              <p className="flex items-start gap-2 font-medium text-status-incident">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Esta orden todavía tiene pendientes. No se recomienda cerrar.
              </p>
              <p className="text-xs text-muted-foreground">{closeWarning}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Se validará que no queden unidades sin ubicar, con procesamiento
              pendiente, en revisión, ni unidades logísticas fuera de posiciones
              de rack.
            </p>
          )}

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCloseOpen(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            {closeWarning ? (
              staff ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => runClose(true)}
                  disabled={isPending}
                >
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                  Cerrar de todos modos
                </Button>
              ) : null
            ) : (
              <Button
                type="button"
                onClick={() => runClose(false)}
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Cerrar orden
              </Button>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={dischargeOpen}
        onClose={() => !isPending && setDischargeOpen(false)}
        title="Resumen físico de descarga"
        description="Indicá cuántas unidades se descargaron por tipo. Se usa para facturar la descarga (camión + por tipo)."
      >
        <form onSubmit={onSubmitDischarge} className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {COUNTS.map((c) => (
              <div key={c.name} className="space-y-1">
                <Label htmlFor={`d-${c.name}`} className="text-xs">
                  {c.label}
                </Label>
                <Input
                  id={`d-${c.name}`}
                  name={c.name}
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={num(c.key)}
                />
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <Label htmlFor="d-total" className="text-xs">
              Total de unidades (opcional)
            </Label>
            <Input
              id="d-total"
              name="total_units_count"
              type="number"
              min={0}
              step={1}
              defaultValue={
                discharge?.total_units_count != null
                  ? discharge.total_units_count
                  : ""
              }
              placeholder="Si se deja vacío, se calcula como la suma"
            />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {FLAGS.map((f) => (
              <label
                key={f.name}
                className="flex items-center gap-3 rounded-md border p-3"
              >
                <Checkbox name={f.name} defaultChecked={flag(f.key)} />
                <span className="text-sm">{f.label}</span>
              </label>
            ))}
          </div>

          <div className="space-y-1">
            <Label htmlFor="d-notes" className="text-xs">
              Observaciones de descarga
            </Label>
            <Textarea
              id="d-notes"
              name="notes"
              defaultValue={discharge?.notes ?? ""}
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDischargeOpen(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TruckIcon className="h-4 w-4" />
              )}
              {discharge ? "Guardar descarga" : "Registrar descarga"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
