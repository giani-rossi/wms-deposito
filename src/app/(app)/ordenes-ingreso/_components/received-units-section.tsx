"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  Loader2,
  Package,
  Check,
  AlertTriangle,
  PackageMinus,
  SlidersHorizontal,
} from "lucide-react";
import {
  createReceivedUnitAction,
  deleteReceivedUnitAction,
  generateMissingReceivedUnitsAction,
  updateReceivedUnitRequirementsAction,
  type InboundFormState,
} from "@/lib/actions/inbound";
import type {
  ReceivedUnitRow,
  ReceivedUnitType,
  InboundOrderDischargeRow,
} from "@/lib/types/database";
import {
  RECEIVED_UNIT_TYPE_LABELS,
  VISIBLE_CONTENT_STATUSES,
  CONTENT_STATUS_REVIEW_HELP,
  positionPrimaryLabel,
  positionSelectLabel,
  isOperationalZoneCode,
  formatReceivedUnitHeading,
} from "@/lib/constants";
import { RECEIVED_UNIT_TYPES } from "@/lib/validation/inbound";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/layout/empty-state";
import { SubmitButton } from "@/components/auth/submit-button";
import { ContentStatusBadge } from "@/components/status-badges";
import { Modal } from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PositionOption = { id: string; code: string };

const FLAGS: { name: string; label: string }[] = [
  { name: "requires_classification", label: "Requiere clasificación" },
  { name: "requires_desconsolidation", label: "Requiere desconsolidación" },
  { name: "requires_assembly", label: "Requiere armado" },
  { name: "requires_repackaging", label: "Requiere reembalaje" },
];

export function ReceivedUnitsSection({
  orderId,
  units,
  positions,
  discharge,
  processedUnitIds,
  hasContentByUnitId,
  staff,
}: {
  orderId: string;
  units: ReceivedUnitRow[];
  positions: PositionOption[];
  discharge: InboundOrderDischargeRow | null;
  processedUnitIds: string[];
  hasContentByUnitId: Record<string, boolean>;
  staff: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const action = createReceivedUnitAction.bind(null, orderId);
  const [state, formAction] = useFormState<InboundFormState, FormData>(
    action,
    undefined
  );

  const [contentStatus, setContentStatus] = useState("unknown");
  const [reqTarget, setReqTarget] = useState<ReceivedUnitRow | null>(null);
  const processedSet = new Set(processedUnitIds);

  const defaultPosition =
    positions.find((p) => p.code === "FLOOR-INBOUND-01")?.id ??
    positions[0]?.id ??
    "";

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
    }
  }, [state]);

  const posMap = new Map(positions.map((p) => [p.id, p.code]));

  const manualForm = (
    <Card>
      <CardContent className="pt-6">
        <details>
          <summary className="cursor-pointer text-sm font-semibold">
            Agregar unidad recibida manualmente
          </summary>
          <p className="mb-4 mt-1 text-xs text-muted-foreground">
            El flujo normal genera las unidades desde el resumen de descarga.
            Usá esto solo para casos puntuales o correcciones.
          </p>
          <form ref={formRef} action={formAction} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="ru-type">Tipo</Label>
                <Select id="ru-type" name="type" defaultValue="pallet">
                  {RECEIVED_UNIT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {RECEIVED_UNIT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ru-qty">Cantidad física</Label>
                <Input
                  id="ru-qty"
                  name="physical_quantity"
                  type="number"
                  min={1}
                  step="any"
                  defaultValue={1}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ru-label">Etiqueta (opcional)</Label>
                <Input
                  id="ru-label"
                  name="display_label"
                  placeholder="Ej. Pallet 1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ru-content">Estado de contenido</Label>
                <Select
                  id="ru-content"
                  name="content_status"
                  value={contentStatus}
                  onChange={(e) => setContentStatus(e.target.value)}
                >
                  {VISIBLE_CONTENT_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ru-position">Posición inicial</Label>
                <Select
                  id="ru-position"
                  name="current_position_id"
                  defaultValue={defaultPosition}
                >
                  <option value="">Sin posición</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {positionSelectLabel(p.code)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {contentStatus === "incident" && (
              <p className="rounded-md bg-status-incident/10 px-3 py-2 text-xs text-muted-foreground">
                {CONTENT_STATUS_REVIEW_HELP}
              </p>
            )}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {FLAGS.map((f) => (
                <label
                  key={f.name}
                  className="flex items-center gap-3 rounded-md border p-3"
                >
                  <Checkbox name={f.name} />
                  <span className="text-sm">{f.label}</span>
                </label>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ru-notes">Notas</Label>
              <Textarea id="ru-notes" name="notes" />
            </div>

            {state?.error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {state.error}
              </p>
            )}

            <div className="flex justify-end">
              <SubmitButton>
                <Plus className="h-4 w-4" />
                Crear unidad recibida
              </SubmitButton>
            </div>
          </form>
        </details>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <DischargeComparison
        orderId={orderId}
        units={units}
        discharge={discharge}
        staff={staff}
      />

      {units.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Sin unidades recibidas"
          description="Después de confirmar el remito, creá las unidades físicas que llegaron."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Etiqueta</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead>Contenido</TableHead>
              <TableHead>Estado contenido</TableHead>
              <TableHead>Posición</TableHead>
              <TableHead>Procesamiento</TableHead>
              {staff && <TableHead className="text-right">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-mono text-sm font-medium">
                  {u.code}
                </TableCell>
                <TableCell>
                  {u.display_label?.trim() ? (
                    <span className="font-medium">{u.display_label}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>{RECEIVED_UNIT_TYPE_LABELS[u.type]}</TableCell>
                <TableCell className="text-right">
                  {Number(u.physical_quantity)}
                </TableCell>
                <TableCell>
                  {hasContentByUnitId[u.id] ? (
                    <Badge
                      variant="secondary"
                      className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                    >
                      Con contenido
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-700">
                      Sin contenido
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <ContentStatusBadge status={u.content_status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <PositionCell code={u.current_position_id ? posMap.get(u.current_position_id) ?? null : null} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {u.requires_classification && (
                      <Badge variant="outline">Requiere clasificación</Badge>
                    )}
                    {u.requires_desconsolidation && (
                      <Badge variant="outline">Requiere desconsolidación</Badge>
                    )}
                    {u.requires_assembly && (
                      <Badge variant="outline">Requiere armado</Badge>
                    )}
                    {u.requires_repackaging && (
                      <Badge variant="outline">Requiere reembalaje</Badge>
                    )}
                    {!u.requires_classification &&
                      !u.requires_desconsolidation &&
                      !u.requires_assembly &&
                      !u.requires_repackaging && (
                        <span className="text-xs text-muted-foreground">
                          Sin procesamiento requerido · lista para ubicar
                        </span>
                      )}
                  </div>
                </TableCell>
                {staff && (
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setReqTarget(u)}
                      >
                        <SlidersHorizontal className="h-4 w-4" />
                        Editar procesamiento
                      </Button>
                      <DeleteUnitButton
                        unitId={u.id}
                        orderId={orderId}
                        onDone={() => router.refresh()}
                      />
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {manualForm}

      <RequirementsModal
        unit={reqTarget}
        orderId={orderId}
        processed={reqTarget ? processedSet.has(reqTarget.id) : false}
        onClose={() => setReqTarget(null)}
      />
    </div>
  );
}

/** Celda de posición: label amigable + código secundario si es zona operativa. */
function PositionCell({ code }: { code: string | null }) {
  if (!code) return <span>—</span>;
  if (isOperationalZoneCode(code)) {
    return (
      <span className="flex flex-col">
        <span>{positionPrimaryLabel(code)}</span>
        <span className="font-mono text-xs text-muted-foreground/70">{code}</span>
      </span>
    );
  }
  return <span className="font-mono">{code}</span>;
}

const REQUIREMENT_FLAGS: { name: string; label: string; key: keyof ReceivedUnitRow }[] =
  [
    {
      name: "requires_classification",
      label: "Requiere clasificación",
      key: "requires_classification",
    },
    {
      name: "requires_desconsolidation",
      label: "Requiere desconsolidación",
      key: "requires_desconsolidation",
    },
    {
      name: "requires_assembly",
      label: "Requiere armado",
      key: "requires_assembly",
    },
    {
      name: "requires_repackaging",
      label: "Requiere reembalaje",
      key: "requires_repackaging",
    },
  ];

function RequirementsModal({
  unit,
  orderId,
  processed,
  onClose,
}: {
  unit: ReceivedUnitRow | null;
  orderId: string;
  processed: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (isPending) return;
    setError(null);
    onClose();
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!unit) return;
    const formData = new FormData(e.currentTarget);
    const notesValue = formData.get("notes");
    const input = {
      requires_classification:
        formData.get("requires_classification") === "on",
      requires_desconsolidation:
        formData.get("requires_desconsolidation") === "on",
      requires_assembly: formData.get("requires_assembly") === "on",
      requires_repackaging: formData.get("requires_repackaging") === "on",
      notes: typeof notesValue === "string" ? notesValue : null,
    };
    setError(null);
    startTransition(async () => {
      const res = await updateReceivedUnitRequirementsAction(
        unit.id,
        orderId,
        input
      );
      if (!res.ok) {
        setError(res.error ?? "No se pudieron guardar los requisitos.");
        return;
      }
      onClose();
      router.refresh();
    });
  }

  if (!unit) return null;

  return (
    <Modal
      open={unit != null}
      onClose={close}
      title={`Editar requisitos · ${formatReceivedUnitHeading(unit)}`}
      description="Marcá si esta unidad requiere procesamiento antes de ubicarse. Si no marcás nada, queda lista para ubicar."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {processed && (
          <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Esta unidad ya fue procesada (tiene unidades logísticas ubicadas).
            Cambiar requisitos puede afectar la trazabilidad.
          </p>
        )}

        <div className="grid grid-cols-1 gap-2">
          {REQUIREMENT_FLAGS.map((f) => (
            <label
              key={f.name}
              className="flex items-center gap-3 rounded-md border p-3"
            >
              <Checkbox
                name={f.name}
                defaultChecked={Boolean(unit[f.key])}
              />
              <span className="text-sm">{f.label}</span>
            </label>
          ))}
        </div>

        <div className="space-y-2">
          <Label htmlFor="req-notes">Notas</Label>
          <Textarea
            id="req-notes"
            name="notes"
            defaultValue={unit.notes ?? ""}
          />
        </div>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={close}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Guardar requisitos
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const COMPARE_TYPES: {
  type: ReceivedUnitType;
  label: string;
  field: "pallets_count" | "boxes_count" | "packages_count" | "loose_items_count";
}[] = [
  { type: "pallet", label: "Pallets", field: "pallets_count" },
  { type: "box", label: "Cajas", field: "boxes_count" },
  { type: "package", label: "Bultos", field: "packages_count" },
  { type: "loose_item", label: "Unidades sueltas", field: "loose_items_count" },
];

function DischargeComparison({
  orderId,
  units,
  discharge,
  staff,
}: {
  orderId: string;
  units: ReceivedUnitRow[];
  discharge: InboundOrderDischargeRow | null;
  staff: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!discharge) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 pt-6 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Todavía no se registró descarga. El comparativo aparecerá cuando se
          registre el resumen de descarga del camión.
        </CardContent>
      </Card>
    );
  }

  const loadedByType = new Map<string, number>();
  for (const u of units) {
    loadedByType.set(u.type, (loadedByType.get(u.type) ?? 0) + Number(u.physical_quantity));
  }

  const rows = COMPARE_TYPES.map((t) => {
    const declared = Number(discharge[t.field] ?? 0);
    const loaded = loadedByType.get(t.type) ?? 0;
    return { ...t, declared, loaded, diff: loaded - declared };
  });

  const hasMissing = rows.some((r) => r.diff < 0);
  const hasExtra = rows.some((r) => r.diff > 0);

  function onGenerate() {
    setError(null);
    startTransition(async () => {
      const res = await generateMissingReceivedUnitsAction(orderId);
      if (!res.ok) {
        setError(res.error ?? "No se pudieron generar las unidades.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">
            Comparativo: descarga vs. unidades recibidas
          </h3>
          {staff && hasMissing && (
            <Button type="button" onClick={onGenerate} disabled={isPending}>
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Generar faltantes desde descarga
            </Button>
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Declarado</TableHead>
              <TableHead className="text-right">Cargado</TableHead>
              <TableHead className="text-right">Diferencia</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.type}>
                <TableCell className="font-medium">{r.label}</TableCell>
                <TableCell className="text-right">{r.declared}</TableCell>
                <TableCell className="text-right">{r.loaded}</TableCell>
                <TableCell
                  className={
                    "text-right font-medium " +
                    (r.diff === 0
                      ? "text-muted-foreground"
                      : r.diff < 0
                      ? "text-destructive"
                      : "text-amber-600")
                  }
                >
                  {r.diff > 0 ? `+${r.diff}` : r.diff}
                </TableCell>
                <TableCell>
                  <DiffBadge diff={r.diff} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {hasExtra && (
          <p className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Hay más unidades recibidas cargadas que las declaradas en la
            descarga. Revisar diferencia.
          </p>
        )}

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function DiffBadge({ diff }: { diff: number }) {
  if (diff === 0) {
    return (
      <Badge className="gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        <Check className="h-3 w-3" />
        OK
      </Badge>
    );
  }
  if (diff < 0) {
    return (
      <Badge variant="destructive" className="gap-1">
        <PackageMinus className="h-3 w-3" />
        Faltan {Math.abs(diff)}
      </Badge>
    );
  }
  return (
    <Badge className="gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100">
      <AlertTriangle className="h-3 w-3" />
      Sobran {diff} / revisar
    </Badge>
  );
}

function DeleteUnitButton({
  unitId,
  orderId,
  onDone,
}: {
  unitId: string;
  orderId: string;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    if (
      !window.confirm(
        "¿Eliminar esta unidad recibida? Solo se puede si todavía no fue ubicada ni generó unidades logísticas (sin trazabilidad)."
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const res = await deleteReceivedUnitAction(unitId, orderId);
      if (!res.ok) {
        setError(res.error ?? "No se pudo eliminar.");
        return;
      }
      onDone();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onDelete}
        disabled={isPending}
        aria-label="Eliminar unidad"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </Button>
      {error && (
        <p className="max-w-xs text-right text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
