"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Plus,
  SplitSquareVertical,
  Trash2,
} from "lucide-react";
import { processReceivedUnitAction } from "@/lib/actions/process-received-unit";
import {
  LOGISTIC_UNIT_TYPE_LABELS,
  RECEIVED_UNIT_TYPE_LABELS,
  formatReceivedUnitHeading,
} from "@/lib/constants";
import type { ProcessingOperationType } from "@/lib/validation/processing";
import type { LogisticUnitType } from "@/lib/types/database";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

import type { ProcessableUnit } from "@/lib/processing/processable-unit";

export type { ProcessableUnit, ProcessableUnitContent } from "@/lib/processing/processable-unit";

type ResultContentRow = {
  product_id: string;
  quantity: string;
};

type ResultUnitRow = {
  key: string;
  type: LogisticUnitType;
  label: string;
  contents: ResultContentRow[];
};

const OPERATION_OPTIONS: {
  value: ProcessingOperationType;
  label: string;
}[] = [
  { value: "classification", label: "Clasificación" },
  { value: "desconsolidation", label: "Desconsolidación" },
  { value: "assembly", label: "Armado / re-paletizado" },
  { value: "repackaging", label: "Reembalaje" },
];

function suggestedOperation(
  unit: ProcessableUnit
): ProcessingOperationType | "" {
  const flags: ProcessingOperationType[] = [];
  if (unit.requires_classification) flags.push("classification");
  if (unit.requires_desconsolidation) flags.push("desconsolidation");
  if (unit.requires_assembly) flags.push("assembly");
  if (unit.requires_repackaging) flags.push("repackaging");
  return flags.length === 1 ? flags[0] : "";
}

function defaultResultCount(op: ProcessingOperationType): number {
  if (op === "desconsolidation") return 2;
  return 1;
}

function emptyResultUnit(
  unit: ProcessableUnit,
  key: string
): ResultUnitRow {
  return {
    key,
    type: "box",
    label: "",
    contents: unit.contents.map((c) => ({
      product_id: c.product_id,
      quantity: "",
    })),
  };
}

function buildInitialResults(
  unit: ProcessableUnit,
  op: ProcessingOperationType
): ResultUnitRow[] {
  const count = defaultResultCount(op);
  return Array.from({ length: count }, (_, i) =>
    emptyResultUnit(unit, `r-${i}`)
  );
}

export function ProcessUnitWizard({
  unit,
  onClose,
}: {
  unit: ProcessableUnit | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [operation, setOperation] = useState<ProcessingOperationType | "">("");
  const [notes, setNotes] = useState("");
  const [resultUnits, setResultUnits] = useState<ResultUnitRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const open = unit != null;

  const op = operation as ProcessingOperationType;

  useEffect(() => {
    if (!unit) {
      resetState();
      return;
    }
    const suggested = suggestedOperation(unit);
    setStep(1);
    setNotes("");
    setError(null);
    setOperation(suggested);
    setResultUnits(suggested ? buildInitialResults(unit, suggested) : []);
  }, [unit?.id]);

  const allocatedByProduct = useMemo(() => {
    const map = new Map<string, number>();
    if (!unit) return map;
    for (const ru of resultUnits) {
      for (const line of ru.contents) {
        const q = Number(line.quantity);
        if (!Number.isFinite(q) || q <= 0) continue;
        map.set(line.product_id, (map.get(line.product_id) ?? 0) + q);
      }
    }
    return map;
  }, [resultUnits, unit]);

  const balanceOk = useMemo(() => {
    if (!unit) return false;
    return unit.contents.every((c) => {
      const allocated = allocatedByProduct.get(c.product_id) ?? 0;
      return Math.abs(allocated - c.quantity) < 0.001;
    });
  }, [unit, allocatedByProduct]);

  const resultsHaveContent = useMemo(
    () =>
      resultUnits.some((ru) =>
        ru.contents.some((l) => Number(l.quantity) > 0)
      ),
    [resultUnits]
  );

  function resetState() {
    setStep(1);
    setOperation("");
    setNotes("");
    setResultUnits([]);
    setError(null);
  }

  function close() {
    if (isPending) return;
    resetState();
    onClose();
  }

  function onOperationChange(next: ProcessingOperationType | "") {
    setOperation(next);
    setError(null);
    if (unit && next) {
      setResultUnits(buildInitialResults(unit, next));
    } else {
      setResultUnits([]);
    }
  }

  function goNext() {
    setError(null);
    if (!unit) return;

    if (step === 1) {
      if (!unit.hasContent) {
        setError(
          "Primero cargá el contenido de la unidad antes de procesarla."
        );
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!operation) {
        setError("Elegí el tipo de operación.");
        return;
      }
      if (resultUnits.length === 0) {
        setResultUnits(buildInitialResults(unit, op));
      }
      setStep(3);
      return;
    }

    if (step === 3) {
      if (!resultsHaveContent) {
        setError("Asigná cantidades a las unidades resultantes.");
        return;
      }
      if (!balanceOk) {
        setError(
          "La suma del contenido resultante debe coincidir con el original."
        );
        return;
      }
      if (op === "desconsolidation" && resultUnits.length < 2) {
        setError("La desconsolidación requiere al menos dos unidades resultantes.");
        return;
      }
      if (
        (op === "assembly" || op === "repackaging") &&
        resultUnits.length !== 1
      ) {
        setError("Armado y reembalaje permiten una sola unidad resultante.");
        return;
      }
      setStep(4);
    }
  }

  function onConfirm() {
    if (!unit || !operation) return;
    if (!balanceOk) {
      setError(
        "La suma del contenido resultante debe coincidir con el original."
      );
      return;
    }

    const payload = {
      received_unit_id: unit.id,
      operation_type: operation,
      notes: notes.trim() || null,
      result_units: resultUnits.map((ru) => ({
        type: ru.type,
        label: ru.label.trim() || null,
        contents: ru.contents
          .map((l) => ({
            product_id: l.product_id,
            quantity: Number(l.quantity),
          }))
          .filter((l) => l.quantity > 0),
      })),
    };

    setError(null);
    startTransition(async () => {
      const res = await processReceivedUnitAction(payload);
      if (!res.ok) {
        setError(res.error ?? "No se pudo procesar la unidad.");
        return;
      }
      close();
      router.refresh();
    });
  }

  if (!unit) return null;

  const stepTitle =
    step === 1
      ? "Origen y contenido"
      : step === 2
      ? "Operación"
      : step === 3
      ? "Unidades resultantes"
      : "Resumen";

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Procesar ${formatReceivedUnitHeading(unit)}`}
      description={`Paso ${step} de 4 · ${stepTitle}`}
      className="max-w-3xl"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={step === 1 ? close : () => setStep((s) => s - 1)}
            disabled={isPending}
          >
            {step === 1 ? (
              "Cancelar"
            ) : (
              <>
                <ArrowLeft className="h-4 w-4" />
                Atrás
              </>
            )}
          </Button>
          {step < 4 ? (
            <Button type="button" onClick={goNext} disabled={isPending}>
              Siguiente
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" onClick={onConfirm} disabled={isPending}>
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SplitSquareVertical className="h-4 w-4" />
              )}
              Confirmar procesamiento
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {step === 1 && (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Cliente</p>
                <p className="font-medium">{unit.clientName}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Orden</p>
                <p className="font-medium">{unit.orderLabel}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Tipo físico</p>
                <p>{RECEIVED_UNIT_TYPE_LABELS[unit.type]}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Cantidad física</p>
                <p>{unit.physical_quantity}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {unit.flagLabels.map((f) => (
                <Badge key={f} variant="secondary">
                  {f}
                </Badge>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Contenido actual</p>
              {!unit.hasContent ? (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  Primero cargá el contenido de la unidad antes de procesarla.
                </p>
              ) : (
                <ul className="space-y-1 rounded-md border p-3 text-sm">
                  {unit.contents.map((c) => (
                    <li key={c.product_id} className="flex justify-between gap-4">
                      <span>
                        {c.name}
                        {c.sku ? (
                          <span className="text-muted-foreground">
                            {" "}
                            ({c.sku})
                          </span>
                        ) : null}
                      </span>
                      <span className="font-medium">
                        {c.quantity} {c.unit_of_measure ?? ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-sm text-muted-foreground">
              Elegí qué operación se realizó físicamente sobre la unidad
              completa.
            </p>
            <div className="space-y-2">
              <Label htmlFor="process-op">Operación</Label>
              <Select
                id="process-op"
                value={operation}
                onChange={(e) =>
                  onOperationChange(e.target.value as ProcessingOperationType | "")
                }
              >
                <option value="">Seleccionar…</option>
                {OPERATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="process-notes">Notas (opcional)</Label>
              <Textarea
                id="process-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observaciones del procesamiento…"
              />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <p className="text-sm text-muted-foreground">
              Definí las unidades logísticas resultantes. La suma por producto
              debe igualar el contenido original.
            </p>

            <BalancePanel unit={unit} allocatedByProduct={allocatedByProduct} />

            <div className="space-y-4">
              {resultUnits.map((ru, idx) => (
                <div key={ru.key} className="space-y-3 rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">
                      Resultante {idx + 1}
                    </p>
                    {resultUnits.length > 1 &&
                      op !== "assembly" &&
                      op !== "repackaging" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setResultUnits((rows) =>
                              rows.filter((r) => r.key !== ru.key)
                            )
                          }
                          aria-label="Quitar resultante"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Tipo de unidad</Label>
                      <Select
                        value={ru.type}
                        onChange={(e) =>
                          setResultUnits((rows) =>
                            rows.map((r) =>
                              r.key === ru.key
                                ? {
                                    ...r,
                                    type: e.target.value as LogisticUnitType,
                                  }
                                : r
                            )
                          )
                        }
                      >
                        {Object.entries(LOGISTIC_UNIT_TYPE_LABELS).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          )
                        )}
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Etiqueta visible</Label>
                      <Input
                        value={ru.label}
                        placeholder="Ej. Caja 1, Pallet remanente"
                        onChange={(e) =>
                          setResultUnits((rows) =>
                            rows.map((r) =>
                              r.key === ru.key
                                ? { ...r, label: e.target.value }
                                : r
                            )
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    {ru.contents.map((line) => {
                      const product = unit.contents.find(
                        (c) => c.product_id === line.product_id
                      );
                      if (!product) return null;
                      return (
                        <div
                          key={line.product_id}
                          className="flex items-end gap-2 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{product.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Original: {product.quantity}{" "}
                              {product.unit_of_measure ?? ""}
                            </p>
                          </div>
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            className="w-28"
                            value={line.quantity}
                            onChange={(e) =>
                              setResultUnits((rows) =>
                                rows.map((r) =>
                                  r.key === ru.key
                                    ? {
                                        ...r,
                                        contents: r.contents.map((c) =>
                                          c.product_id === line.product_id
                                            ? { ...c, quantity: e.target.value }
                                            : c
                                        ),
                                      }
                                    : r
                                )
                              )
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {op !== "assembly" && op !== "repackaging" && (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setResultUnits((rows) => [
                    ...rows,
                    emptyResultUnit(unit, `r-${Date.now()}`),
                  ])
                }
              >
                <Plus className="h-4 w-4" />
                Agregar unidad resultante
              </Button>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Operación: </span>
                {
                  OPERATION_OPTIONS.find((o) => o.value === operation)?.label
                }
              </p>
              <p>
                <span className="text-muted-foreground">Origen: </span>
                {formatReceivedUnitHeading(unit)}
              </p>
              <p className="text-muted-foreground">
                Las unidades resultantes quedarán en piso ingreso (
                FLOOR-INBOUND-01) con estado listas para ubicar.
              </p>
            </div>
            <ul className="space-y-2 rounded-md border p-3 text-sm">
              {resultUnits.map((ru, idx) => (
                <li key={ru.key}>
                  <p className="font-medium">
                    {ru.label || `Resultante ${idx + 1}`} ·{" "}
                    {LOGISTIC_UNIT_TYPE_LABELS[ru.type]}
                  </p>
                  <ul className="mt-1 text-muted-foreground">
                    {ru.contents
                      .filter((l) => Number(l.quantity) > 0)
                      .map((l) => {
                        const p = unit.contents.find(
                          (c) => c.product_id === l.product_id
                        );
                        return (
                          <li key={l.product_id}>
                            {p?.name}: {l.quantity} {p?.unit_of_measure ?? ""}
                          </li>
                        );
                      })}
                  </ul>
                </li>
              ))}
            </ul>
            {notes && (
              <p className="text-sm text-muted-foreground">Notas: {notes}</p>
            )}
          </>
        )}

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

function BalancePanel({
  unit,
  allocatedByProduct,
}: {
  unit: ProcessableUnit;
  allocatedByProduct: Map<string, number>;
}) {
  const allOk = unit.contents.every((c) => {
    const allocated = allocatedByProduct.get(c.product_id) ?? 0;
    return Math.abs(allocated - c.quantity) < 0.001;
  });

  return (
    <div
      className={`rounded-md px-3 py-2 text-sm ${
        allOk ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"
      }`}
    >
      <p className="font-medium">Balance por producto</p>
      <ul className="mt-1 space-y-0.5">
        {unit.contents.map((c) => {
          const allocated = allocatedByProduct.get(c.product_id) ?? 0;
          const ok = Math.abs(allocated - c.quantity) < 0.001;
          return (
            <li key={c.product_id}>
              {c.name}: {allocated} / {c.quantity}{" "}
              {c.unit_of_measure ?? ""}
              {ok ? " ✓" : " — falta ajustar"}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
