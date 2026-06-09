"use client";

import { useFormState } from "react-dom";
import Link from "next/link";
import type { ClientFormState } from "@/lib/actions/clients";
import type { ClientRow } from "@/lib/types/database";
import { PICKING_STRATEGY_LABELS } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SubmitButton } from "@/components/auth/submit-button";

type Action = (
  prev: ClientFormState,
  formData: FormData
) => Promise<ClientFormState>;

export function ClientForm({
  action,
  client,
  submitLabel,
}: {
  action: Action;
  client?: ClientRow | null;
  submitLabel: string;
}) {
  const [state, formAction] = useFormState<ClientFormState, FormData>(
    action,
    undefined
  );

  return (
    <form action={formAction} className="space-y-6">
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-6 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="nombre">Nombre *</Label>
            <Input
              id="nombre"
              name="nombre"
              required
              defaultValue={client?.nombre ?? ""}
              placeholder="Tech Importadora"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="razon_social">Razón social</Label>
            <Input
              id="razon_social"
              name="razon_social"
              defaultValue={client?.razon_social ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tax_id">CUIT / Tax ID</Label>
            <Input id="tax_id" name="tax_id" defaultValue={client?.tax_id ?? ""} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact_name">Nombre de contacto</Label>
            <Input
              id="contact_name"
              name="contact_name"
              defaultValue={client?.contact_name ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact_email">Email de contacto</Label>
            <Input
              id="contact_email"
              name="contact_email"
              type="email"
              defaultValue={client?.contact_email ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact_phone">Teléfono de contacto</Label>
            <Input
              id="contact_phone"
              name="contact_phone"
              defaultValue={client?.contact_phone ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="default_picking_strategy">
              Estrategia de picking por defecto
            </Label>
            <Select
              id="default_picking_strategy"
              name="default_picking_strategy"
              defaultValue={client?.default_picking_strategy ?? "FIFO"}
            >
              {Object.entries(PICKING_STRATEGY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="operational_rules">Reglas operativas</Label>
            <Textarea
              id="operational_rules"
              name="operational_rules"
              defaultValue={client?.operational_rules ?? ""}
              placeholder="Ej: no mezclar clientes en una misma posición"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="billing_notes">Notas de facturación</Label>
            <Textarea
              id="billing_notes"
              name="billing_notes"
              defaultValue={client?.billing_notes ?? ""}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" name="notes" defaultValue={client?.notes ?? ""} />
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
          href={client ? `/clientes/${client.id}` : "/clientes"}
          className={buttonVariants({ variant: "outline" })}
        >
          Cancelar
        </Link>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
