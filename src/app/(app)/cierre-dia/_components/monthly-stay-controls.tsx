"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";

type ClientOption = { id: string; nombre: string };

export function MonthlyStayControls({
  defaultMonth,
  defaultClientId,
  clients,
}: {
  defaultMonth: string;
  defaultClientId: string;
  clients: ClientOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <form
      className="flex flex-wrap items-end gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        updateParams({
          mes: (fd.get("mes") as string) || null,
          cliente_mes: (fd.get("cliente_mes") as string) || null,
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="resumen-mes">Mes</Label>
        <Input
          id="resumen-mes"
          name="mes"
          type="month"
          defaultValue={defaultMonth}
          className="w-auto min-w-[11rem]"
        />
      </div>
      <div className="space-y-2 min-w-[12rem]">
        <Label htmlFor="resumen-cliente">Cliente (opcional)</Label>
        <Select
          id="resumen-cliente"
          name="cliente_mes"
          defaultValue={defaultClientId}
        >
          <option value="">Todos los clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Select>
      </div>
      <button type="submit" className={buttonVariants({ variant: "outline" })}>
        Aplicar
      </button>
    </form>
  );
}
