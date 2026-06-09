"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, isStaff } from "@/lib/auth";
import {
  productQuickSchema,
  receivedUnitContentSchema,
  receivedUnitContentFromFormData,
  type ProductQuickInput,
} from "@/lib/validation/stock";

type ActionResult = { ok: boolean; error?: string };

function revalidateOrder(id?: string) {
  if (id) revalidatePath(`/ordenes-ingreso/${id}`);
  revalidatePath("/unidades-logisticas");
}

/** Crea un producto rápido en el catálogo del cliente. */
export async function createProductAction(
  input: ProductQuickInput
): Promise<{ ok: boolean; error?: string; productId?: string }> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { ok: false, error: "No tenés permisos para crear productos." };
  }

  const parsed = productQuickSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .insert({
      client_id: parsed.data.client_id,
      name: parsed.data.name,
      sku: parsed.data.sku,
      unit_of_measure: parsed.data.unit_of_measure,
      description: parsed.data.description,
      notes: parsed.data.notes,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo crear el producto." };
  }

  revalidatePath("/clientes");
  return { ok: true, productId: data.id };
}

/**
 * Carga contenido/stock en una unidad recibida. Si se pide un producto nuevo
 * (new_product_name) se crea al vuelo en el catálogo del cliente de la unidad.
 */
export async function addReceivedUnitContentAction(
  orderId: string,
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { ok: false, error: "No tenés permisos para cargar contenido." };
  }

  const parsed = receivedUnitContentSchema.safeParse(
    receivedUnitContentFromFormData(formData)
  );
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }
  const d = parsed.data;

  const supabase = createClient();

  // Cliente de la unidad recibida (para el producto y la trazabilidad).
  const { data: unit } = await supabase
    .from("received_units")
    .select("id, client_id")
    .eq("id", d.received_unit_id)
    .single();
  if (!unit) return { ok: false, error: "Unidad recibida no encontrada." };

  let productId = d.product_id;
  if (!productId) {
    const { data: product, error: prodErr } = await supabase
      .from("products")
      .insert({
        client_id: unit.client_id,
        name: d.new_product_name!,
        sku: d.new_product_sku,
        unit_of_measure: d.unit_of_measure,
      })
      .select("id")
      .single();
    if (prodErr || !product) {
      return { ok: false, error: prodErr?.message ?? "No se pudo crear el producto." };
    }
    productId = product.id;
  }

  const { error } = await supabase.from("received_unit_contents").insert({
    received_unit_id: d.received_unit_id,
    product_id: productId,
    quantity: d.quantity,
    unit_of_measure: d.unit_of_measure,
    lot: d.lot,
    notes: d.notes,
  });
  if (error) return { ok: false, error: error.message };

  revalidateOrder(orderId);
  return { ok: true };
}

/** Elimina una línea de contenido de una unidad recibida (antes de ubicar). */
export async function deleteReceivedUnitContentAction(
  contentId: string,
  orderId: string
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { ok: false, error: "No tenés permisos para esta acción." };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("received_unit_contents")
    .delete()
    .eq("id", contentId);
  if (error) return { ok: false, error: error.message };

  revalidateOrder(orderId);
  return { ok: true };
}
