"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, isStaff } from "@/lib/auth";
import {
  clientSchema,
  clientInputFromFormData,
} from "@/lib/validation/client";

export type ClientFormState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

/** Tablas que, si tienen filas para el cliente, impiden su eliminación. */
const RELATED_TABLES = [
  "products",
  "inbound_orders",
  "outbound_orders",
  "received_units",
  "logistic_units",
  "billable_services",
  "movements",
] as const;

export async function createClientAction(
  _prev: ClientFormState,
  formData: FormData
): Promise<ClientFormState> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { error: "No tenés permisos para crear clientes." };
  }

  const parsed = clientSchema.safeParse(clientInputFromFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("clients")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "No se pudo crear el cliente." };
  }

  revalidatePath("/clientes");
  redirect(`/clientes/${data.id}`);
}

export async function updateClientAction(
  clientId: string,
  _prev: ClientFormState,
  formData: FormData
): Promise<ClientFormState> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { error: "No tenés permisos para editar clientes." };
  }

  const parsed = clientSchema.safeParse(clientInputFromFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("clients")
    .update(parsed.data)
    .eq("id", clientId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${clientId}`);
  redirect(`/clientes/${clientId}`);
}

/**
 * Elimina un cliente SOLO si no tiene datos asociados. Si los tiene, devuelve
 * un error explicando que no se puede borrar (para no romper la trazabilidad).
 */
export async function deleteClientAction(clientId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { ok: false, error: "No tenés permisos para eliminar clientes." };
  }

  const supabase = createClient();

  // Posiciones asignadas (cuenta aparte porque no es cascada de negocio).
  const checks = await Promise.all([
    supabase
      .from("positions")
      .select("id", { count: "exact", head: true })
      .eq("assigned_client_id", clientId),
    ...RELATED_TABLES.map((table) =>
      supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
    ),
  ]);

  const total = checks.reduce((acc, r) => acc + (r.count ?? 0), 0);
  if (total > 0) {
    return {
      ok: false,
      error:
        "No se puede eliminar: el cliente tiene datos asociados (posiciones, productos, órdenes o movimientos). Quitá o reasigná esos datos primero.",
    };
  }

  const { error } = await supabase.from("clients").delete().eq("id", clientId);
  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/clientes");
  return { ok: true };
}

/** Activa o desactiva (baja lógica) un cliente. */
export async function setClientActiveAction(
  clientId: string,
  isActive: boolean
): Promise<{ ok: boolean; error?: string }> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { ok: false, error: "No tenés permisos para esta acción." };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("clients")
    .update({ is_active: isActive })
    .eq("id", clientId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${clientId}`);
  return { ok: true };
}
