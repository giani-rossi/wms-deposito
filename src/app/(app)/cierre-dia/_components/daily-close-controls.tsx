"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Loader2, CalendarCheck } from "lucide-react";
import { generateDailyPositionOccupancyAction } from "@/lib/actions/daily-close";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function DailyCloseControls({
  defaultDate,
  suggestedManualDate,
  staff,
}: {
  defaultDate: string;
  suggestedManualDate: string;
  staff: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [date, setDate] = useState(defaultDate);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function onDateChange(next: string) {
    setDate(next);
    setError(null);
    setSuccess(null);
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("fecha", next);
    else params.delete("fecha");
    router.replace(`${pathname}?${params.toString()}`);
  }

  function onGenerate() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await generateDailyPositionOccupancyAction(date);
      if (!res.ok) {
        setError(res.error ?? "No se pudo generar el cierre.");
        return;
      }
      const mixed =
        res.mixedPositions && res.mixedPositions > 0
          ? ` · ${res.mixedPositions} posición(es) con mezcla de clientes (revisar).`
          : "";
      setSuccess(
        `Cierre manual ejecutado (${res.date}): ${res.rowsWritten ?? 0} posición(es)-día registradas.${mixed}`
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        El cierre automático corre todos los días a las 19:00 hs Argentina y
        procesa el día en curso. Este botón sirve como respaldo o reintento si
        falló el cron o hay que regenerar una fecha.
      </p>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor="cierre-fecha">Fecha a procesar</Label>
          <Input
            id="cierre-fecha"
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className="w-auto min-w-[11rem]"
          />
          <p className="text-xs text-muted-foreground">
            Sugerido para reintento: {suggestedManualDate} (día en curso).
          </p>
        </div>
        {staff && (
          <Button type="button" onClick={onGenerate} disabled={isPending || !date}>
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CalendarCheck className="h-4 w-4" />
            )}
            Ejecutar cierre manual
          </Button>
        )}
      </div>

      {!staff && (
        <p className="text-sm text-muted-foreground">
          Solo staff puede ejecutar el cierre manual. Podés consultar los
          snapshots ya registrados.
        </p>
      )}

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </p>
      )}
    </div>
  );
}
