"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Save, CheckCircle2 } from "lucide-react";
import { saveConfirmedDataAction } from "@/lib/actions/inbound";
import type { OcrData, OcrItem } from "@/lib/validation/inbound";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function OcrReview({
  orderId,
  initial,
  hasExtracted,
  confirmed,
}: {
  orderId: string;
  initial: OcrData;
  hasExtracted: boolean;
  confirmed: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState<OcrData>({
    ...initial,
    items: initial.items?.length ? initial.items : [],
  });

  function setField<K extends keyof OcrData>(key: K, value: OcrData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setItem(idx: number, patch: Partial<OcrItem>) {
    setForm((f) => ({
      ...f,
      items: (f.items ?? []).map((it, i) =>
        i === idx ? { ...it, ...patch } : it
      ),
    }));
  }

  function addItem() {
    setForm((f) => ({
      ...f,
      items: [
        ...(f.items ?? []),
        { description: "", quantity: null, unit: null, sku: null },
      ],
    }));
  }

  function removeItem(idx: number) {
    setForm((f) => ({
      ...f,
      items: (f.items ?? []).filter((_, i) => i !== idx),
    }));
  }

  function onConfirm() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await saveConfirmedDataAction(orderId, form);
      if (!res.ok) {
        setError(res.error ?? "No se pudo guardar.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {confirmed ? (
          <Badge>Confirmado por humano</Badge>
        ) : hasExtracted ? (
          <Badge variant="secondary">Extraído por IA (pendiente de confirmar)</Badge>
        ) : (
          <Badge variant="outline">Carga manual</Badge>
        )}
        <p className="text-xs text-muted-foreground">
          La IA nunca crea stock. Revisá y confirmá los datos antes de generar
          unidades recibidas.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field
          label="Número de remito"
          value={form.remito_number ?? ""}
          onChange={(v) => setField("remito_number", v || null)}
        />
        <Field
          label="Fecha"
          value={form.date ?? ""}
          onChange={(v) => setField("date", v || null)}
          placeholder="YYYY-MM-DD"
        />
        <Field
          label="Remitente"
          value={form.sender ?? ""}
          onChange={(v) => setField("sender", v || null)}
        />
        <Field
          label="Empresa de transporte"
          value={form.transport_company ?? ""}
          onChange={(v) => setField("transport_company", v || null)}
        />
        <Field
          label="Chofer"
          value={form.driver_name ?? ""}
          onChange={(v) => setField("driver_name", v || null)}
        />
        <Field
          label="Patente"
          value={form.license_plate ?? ""}
          onChange={(v) => setField("license_plate", v || null)}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Ítems del remito</Label>
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="h-4 w-4" />
            Agregar ítem
          </Button>
        </div>

        {(form.items ?? []).length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
            Sin ítems. Agregá los que figuran en el remito (no generan stock).
          </p>
        ) : (
          <div className="space-y-2">
            {(form.items ?? []).map((it, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-12"
              >
                <Input
                  className="sm:col-span-5"
                  placeholder="Descripción"
                  value={it.description ?? ""}
                  onChange={(e) => setItem(idx, { description: e.target.value })}
                />
                <Input
                  className="sm:col-span-2"
                  placeholder="Cant."
                  value={it.quantity == null ? "" : String(it.quantity)}
                  onChange={(e) =>
                    setItem(idx, {
                      quantity: e.target.value === "" ? null : e.target.value,
                    })
                  }
                />
                <Input
                  className="sm:col-span-2"
                  placeholder="Unidad"
                  value={it.unit ?? ""}
                  onChange={(e) =>
                    setItem(idx, { unit: e.target.value || null })
                  }
                />
                <Input
                  className="sm:col-span-2"
                  placeholder="SKU"
                  value={it.sku ?? ""}
                  onChange={(e) => setItem(idx, { sku: e.target.value || null })}
                />
                <div className="flex justify-end sm:col-span-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeItem(idx)}
                    aria-label="Quitar ítem"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="ocr-notes">Notas del remito</Label>
        <Textarea
          id="ocr-notes"
          value={form.notes ?? ""}
          onChange={(e) => setField("notes", e.target.value || null)}
        />
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {saved && (
        <p className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4" />
          Datos confirmados. La orden pasó a “Pendiente de clasificación”.
        </p>
      )}

      <div className="flex justify-end">
        <Button type="button" onClick={onConfirm} disabled={isPending}>
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Confirmar datos
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
