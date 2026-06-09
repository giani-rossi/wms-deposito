"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import Link from "next/link";
import { bulkGeneratePositionsAction } from "@/lib/actions/positions";
import type { PositionFormState } from "@/lib/actions/positions";
import {
  RACK_COLUMNS,
  POSITION_SIDES,
  POSITION_LEVELS,
  SIDE_LABELS,
  LEVEL_LABELS,
  buildRackCode,
} from "@/lib/constants";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SubmitButton } from "@/components/auth/submit-button";
import { Badge } from "@/components/ui/badge";

export function BulkGenerateForm() {
  const [state, formAction] = useFormState<PositionFormState, FormData>(
    bulkGeneratePositionsAction,
    undefined
  );

  const [fromCol, setFromCol] = useState("A");
  const [toCol, setToCol] = useState("K");
  const [sides, setSides] = useState<string[]>(["IZQ", "DER"]);
  const [levels, setLevels] = useState<string[]>([...POSITION_LEVELS]);

  function toggle(list: string[], value: string): string[] {
    return list.includes(value)
      ? list.filter((v) => v !== value)
      : [...list, value];
  }

  const preview = useMemo(() => {
    const start = RACK_COLUMNS.indexOf(fromCol as (typeof RACK_COLUMNS)[number]);
    const end = RACK_COLUMNS.indexOf(toCol as (typeof RACK_COLUMNS)[number]);
    if (start < 0 || end < 0 || start > end || !sides.length || !levels.length)
      return [];
    const cols = RACK_COLUMNS.slice(start, end + 1);
    const orderedSides = POSITION_SIDES.filter((s) => sides.includes(s));
    const orderedLevels = POSITION_LEVELS.filter((l) => levels.includes(l));
    const out: string[] = [];
    for (const c of cols)
      for (const s of orderedSides)
        for (const l of orderedLevels) out.push(buildRackCode(c, s, l));
    return out;
  }, [fromCol, toCol, sides, levels]);

  return (
    <form action={formAction} className="space-y-6">
      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="from_column">Columna inicial *</Label>
              <Select
                id="from_column"
                name="from_column"
                value={fromCol}
                onChange={(e) => setFromCol(e.target.value)}
              >
                {RACK_COLUMNS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="to_column">Columna final *</Label>
              <Select
                id="to_column"
                name="to_column"
                value={toCol}
                onChange={(e) => setToCol(e.target.value)}
              >
                {RACK_COLUMNS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Lados *</Label>
            <div className="flex flex-wrap gap-2">
              {POSITION_SIDES.map((s) => (
                <label
                  key={s}
                  className="flex items-center gap-2 rounded-md border px-3 py-2"
                >
                  <Checkbox
                    name="sides"
                    value={s}
                    checked={sides.includes(s)}
                    onChange={() => setSides((prev) => toggle(prev, s))}
                  />
                  <span className="text-sm">
                    {SIDE_LABELS[s]} ({s})
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Niveles *</Label>
            <div className="flex flex-wrap gap-2">
              {POSITION_LEVELS.map((l) => (
                <label
                  key={l}
                  className="flex items-center gap-2 rounded-md border px-3 py-2"
                >
                  <Checkbox
                    name="levels"
                    value={l}
                    checked={levels.includes(l)}
                    onChange={() => setLevels((prev) => toggle(prev, l))}
                  />
                  <span className="text-sm">{LEVEL_LABELS[l]}</span>
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Previsualización</h3>
            <span className="text-sm text-muted-foreground">
              {preview.length} posiciones
            </span>
          </div>
          {preview.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Elegí rango, lados y niveles para ver el detalle.
            </p>
          ) : (
            <div className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto">
              {preview.map((code) => (
                <Badge key={code} variant="outline" className="font-mono">
                  {code}
                </Badge>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Las posiciones que ya existan se omiten automáticamente.
          </p>
        </CardContent>
      </Card>

      {state?.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Link
          href="/posiciones"
          className={buttonVariants({ variant: "outline" })}
        >
          Cancelar
        </Link>
        <SubmitButton>Generar posiciones</SubmitButton>
      </div>
    </form>
  );
}
