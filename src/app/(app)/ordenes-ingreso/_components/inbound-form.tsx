"use client";

import { useFormState } from "react-dom";
import Link from "next/link";
import type { InboundFormState } from "@/lib/actions/inbound";
import type { InboundOrderRow } from "@/lib/types/database";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SubmitButton } from "@/components/auth/submit-button";

type ClientOption = { id: string; nombre: string };

type Action = (
  prev: InboundFormState,
  formData: FormData
) => Promise<InboundFormState>;

/** Convierte un ISO a valor de <input type="datetime-local"> en hora local. */
function toDatetimeLocal(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function InboundForm({
  action,
  clients,
  order,
  submitLabel,
}: {
  action: Action;
  clients: ClientOption[];
  order?: InboundOrderRow | null;
  submitLabel: string;
}) {
  const [state, formAction] = useFormState<InboundFormState, FormData>(
    action,
    undefined
  );

  return (
    <form action={formAction} className="space-y-6">
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="client_id">Cliente *</Label>
            <Select
              id="client_id"
              name="client_id"
              required
              defaultValue={order?.client_id ?? ""}
            >
              <option value="">Seleccioná un cliente…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="date_time">Fecha y hora *</Label>
            <Input
              id="date_time"
              name="date_time"
              type="datetime-local"
              required
              defaultValue={toDatetimeLocal(order?.date_time)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="truck_company">Empresa de transporte</Label>
            <Input
              id="truck_company"
              name="truck_company"
              defaultValue={order?.truck_company ?? ""}
              placeholder="Transporte del Sur"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="driver_name">Chofer</Label>
            <Input
              id="driver_name"
              name="driver_name"
              defaultValue={order?.driver_name ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="license_plate">Patente</Label>
            <Input
              id="license_plate"
              name="license_plate"
              defaultValue={order?.license_plate ?? ""}
              placeholder="AB123CD"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="remittance_number">Número de remito</Label>
            <Input
              id="remittance_number"
              name="remittance_number"
              defaultValue={order?.remittance_number ?? ""}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={order?.notes ?? ""}
            />
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
          href={order ? `/ordenes-ingreso/${order.id}` : "/ordenes-ingreso"}
          className={buttonVariants({ variant: "outline" })}
        >
          Cancelar
        </Link>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
