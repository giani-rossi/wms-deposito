"use client";

import { useFormState } from "react-dom";
import Link from "next/link";
import type { OutboundFormState } from "@/lib/actions/outbound";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SubmitButton } from "@/components/auth/submit-button";

type ClientOption = { id: string; nombre: string };

type Action = (
  prev: OutboundFormState,
  formData: FormData
) => Promise<OutboundFormState>;

export function OutboundForm({
  action,
  clients,
  submitLabel,
}: {
  action: Action;
  clients: ClientOption[];
  submitLabel: string;
}) {
  const [state, formAction] = useFormState<OutboundFormState, FormData>(
    action,
    undefined
  );

  return (
    <form action={formAction} className="space-y-6">
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-6 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="client_id">Cliente *</Label>
            <Select id="client_id" name="client_id" required defaultValue="">
              <option value="">Seleccioná un cliente…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="requested_date">Fecha solicitada</Label>
            <Input id="requested_date" name="requested_date" type="date" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Instrucciones de retiro, transporte, etc."
            />
          </div>
        </CardContent>
      </Card>

      {state?.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href="/ordenes-retiro" className={buttonVariants({ variant: "ghost" })}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
