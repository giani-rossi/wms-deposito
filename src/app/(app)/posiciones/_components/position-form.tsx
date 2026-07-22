"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import Link from "next/link";
import type { PositionFormState } from "@/lib/actions/positions";
import type { PositionRow, PositionType } from "@/lib/types/database";
import {
  RACK_COLUMNS,
  POSITION_SIDES,
  POSITION_LEVELS,
  FLOOR_ZONE_NUMBERS,
  SIDE_LABELS,
  LEVEL_LABELS,
  POSITION_TYPE_LABELS,
  VISIBLE_POSITION_TYPES,
  buildRackCode,
  buildFloorZoneCode,
  isFinalStoragePosition,
} from "@/lib/constants";
import { floorZoneNumberFromCode } from "@/lib/validation/position";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SubmitButton } from "@/components/auth/submit-button";

type Action = (
  prev: PositionFormState,
  formData: FormData
) => Promise<PositionFormState>;

export type PositionFormDefaults = {
  type?: PositionType;
  column?: string;
  side?: string;
  level?: string;
};

export function PositionForm({
  action,
  position,
  defaults,
  submitLabel,
}: {
  action: Action;
  position?: PositionRow | null;
  defaults?: PositionFormDefaults;
  submitLabel: string;
}) {
  const [state, formAction] = useFormState<PositionFormState, FormData>(
    action,
    undefined
  );

  const [type, setType] = useState<PositionType>(
    position?.type ?? defaults?.type ?? "rack"
  );
  const [column, setColumn] = useState(
    position?.column_letter ?? defaults?.column ?? "A"
  );
  const [side, setSide] = useState(position?.side ?? defaults?.side ?? "IZQ");
  const [level, setLevel] = useState(
    position?.level ?? defaults?.level ?? "PISO"
  );
  const [zoneNumber, setZoneNumber] = useState<number>(
    floorZoneNumberFromCode(position?.code) ?? 1
  );

  const previewCode = useMemo(
    () => buildRackCode(column, side, level),
    [column, side, level]
  );
  const floorPreviewCode = useMemo(
    () => buildFloorZoneCode(type, zoneNumber),
    [type, zoneNumber]
  );

  const isRack = type === "rack";
  const isFloorStorage = isFinalStoragePosition(type) && type !== "rack";

  return (
    <form action={formAction} className="space-y-6">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="type">Tipo de posición *</Label>
              <Select
                id="type"
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value as PositionType)}
              >
                {VISIBLE_POSITION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {isRack ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="column_letter">Columna / rack *</Label>
                  <Select
                    id="column_letter"
                    name="column_letter"
                    value={column}
                    onChange={(e) => setColumn(e.target.value)}
                  >
                    {RACK_COLUMNS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="side">Lado *</Label>
                  <Select
                    id="side"
                    name="side"
                    value={side}
                    onChange={(e) => setSide(e.target.value)}
                  >
                    {POSITION_SIDES.map((s) => (
                      <option key={s} value={s}>
                        {SIDE_LABELS[s]} ({s})
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="level">Nivel *</Label>
                  <Select
                    id="level"
                    name="level"
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                  >
                    {POSITION_LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {LEVEL_LABELS[l]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                <span className="text-sm text-muted-foreground">
                  Código generado:
                </span>
                <Badge variant="outline" className="font-mono text-sm">
                  {previewCode}
                </Badge>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="zone_number">Número de zona *</Label>
                  <Select
                    id="zone_number"
                    name="zone_number"
                    value={String(zoneNumber)}
                    onChange={(e) => setZoneNumber(Number(e.target.value))}
                  >
                    {FLOOR_ZONE_NUMBERS.map((n) => (
                      <option key={n} value={n}>
                        {String(n).padStart(2, "0")}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                <span className="text-sm text-muted-foreground">
                  {POSITION_TYPE_LABELS[type]} · Código generado:
                </span>
                <Badge variant="outline" className="font-mono text-sm">
                  {floorPreviewCode}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {isFloorStorage
                  ? "Almacenamiento final en piso. La mercadería ubicada aquí cuenta para estadía."
                  : "Las zonas operativas usan códigos controlados (sin texto libre)."}
              </p>
            </>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="capacity_notes">Notas de capacidad</Label>
              <Textarea
                id="capacity_notes"
                name="capacity_notes"
                defaultValue={position?.capacity_notes ?? ""}
                placeholder="Ej: 1 pallet europeo / máx 800 kg"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="occupancy_notes">Notas de ocupación</Label>
              <Textarea
                id="occupancy_notes"
                name="occupancy_notes"
                defaultValue={position?.occupancy_notes ?? ""}
                placeholder="Ej: reservada para devoluciones"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {state?.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Link
          href={position ? `/posiciones/${position.id}` : "/posiciones"}
          className={buttonVariants({ variant: "outline" })}
        >
          Cancelar
        </Link>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
