"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, isStaff } from "@/lib/auth";
import type {
  InboundOrderStatus,
  ReceivedUnitType,
  PositionStatus,
} from "@/lib/types/database";
import {
  inboundOrderSchema,
  inboundOrderInputFromFormData,
  receivedUnitSchema,
  receivedUnitInputFromFormData,
  dischargeSchema,
  dischargeInputFromFormData,
  locateInputSchema,
  type LocateDestinationInput,
  ocrDataSchema,
  type OcrData,
} from "@/lib/validation/inbound";
import {
  RECEIVED_TO_LOGISTIC_TYPE,
  BILLING_UNIT_BY_TYPE,
} from "@/lib/constants";
import { extractRemittanceData, OcrError } from "@/lib/ocr/openai";

export type InboundFormState =
  | { error?: string; ok?: boolean }
  | undefined;

type ActionResult = { ok: boolean; error?: string };

const INBOUND_STATUSES: InboundOrderStatus[] = [
  "pending_download",
  "downloaded",
  "pending_validation",
  "pending_classification",
  "partially_classified",
  "ready_to_locate",
  "located",
  "incident",
  "closed",
];

function revalidateOrder(id?: string) {
  revalidatePath("/ordenes-ingreso");
  revalidatePath("/movimientos");
  if (id) revalidatePath(`/ordenes-ingreso/${id}`);
}

// ---------------------------------------------------------------------------
// Crear / editar orden
// ---------------------------------------------------------------------------

export async function createInboundOrderAction(
  _prev: InboundFormState,
  formData: FormData
): Promise<InboundFormState> {
  const profile = await requireProfile();

  const parsed = inboundOrderSchema.safeParse(
    inboundOrderInputFromFormData(formData)
  );
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("inbound_orders")
    .insert({ ...parsed.data, created_by: profile.id })
    .select("id, client_id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "No se pudo crear la orden." };
  }

  // Movimiento: orden de ingreso creada (regla: todo se registra)
  await supabase.from("movements").insert({
    movement_type: "inbound_created",
    inbound_order_id: data.id,
    client_id: data.client_id,
    user_id: profile.id,
    notes: "Orden de ingreso creada",
  });

  revalidateOrder();
  redirect(`/ordenes-ingreso/${data.id}`);
}

export async function updateInboundOrderAction(
  orderId: string,
  _prev: InboundFormState,
  formData: FormData
): Promise<InboundFormState> {
  await requireProfile();

  const parsed = inboundOrderSchema.safeParse(
    inboundOrderInputFromFormData(formData)
  );
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("inbound_orders")
    .update(parsed.data)
    .eq("id", orderId);

  if (error) return { error: error.message };

  revalidateOrder(orderId);
  redirect(`/ordenes-ingreso/${orderId}`);
}

export async function setInboundStatusAction(
  orderId: string,
  status: InboundOrderStatus
): Promise<ActionResult> {
  await requireProfile();
  if (!INBOUND_STATUSES.includes(status)) {
    return { ok: false, error: "Estado inválido." };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("inbound_orders")
    .update({ status })
    .eq("id", orderId);

  if (error) return { ok: false, error: error.message };

  revalidateOrder(orderId);
  return { ok: true };
}

export type CloseOrderResult = {
  ok: boolean;
  error?: string;
  pending?: boolean;
};

/**
 * Cierra una orden de ingreso validando que no queden pendientes:
 *  - unidades recibidas sin ubicar,
 *  - unidades con flags de procesamiento activos,
 *  - unidades en revisión (content_status incident),
 *  - unidades logísticas no ubicadas en posiciones físicas de rack.
 * Si hay pendientes y no se fuerza, bloquea con warning. El cierre forzado
 * queda reservado a admin/supervisor y se registra en las notas de la orden.
 */
export async function closeInboundOrderAction(
  orderId: string,
  force = false
): Promise<CloseOrderResult> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { ok: false, error: "No tenés permisos para cerrar la orden." };
  }

  const supabase = createClient();

  const [{ data: units }, { data: locMovs }, { data: lus }] = await Promise.all([
    supabase
      .from("received_units")
      .select(
        "id, physical_quantity, content_status, requires_classification, requires_desconsolidation, requires_assembly, requires_repackaging"
      )
      .eq("inbound_order_id", orderId),
    supabase
      .from("movements")
      .select("received_unit_id, quantity")
      .eq("inbound_order_id", orderId)
      .eq("movement_type", "location_assignment"),
    supabase
      .from("logistic_units")
      .select("id, status, current_position_id")
      .eq("inbound_order_id", orderId),
  ]);

  const locatedByRU = new Map<string, number>();
  for (const m of locMovs ?? []) {
    if (!m.received_unit_id) continue;
    locatedByRU.set(
      m.received_unit_id,
      (locatedByRU.get(m.received_unit_id) ?? 0) + (Number(m.quantity) || 0)
    );
  }

  const requiresProcessing = (u: {
    requires_classification: boolean;
    requires_desconsolidation: boolean;
    requires_assembly: boolean;
    requires_repackaging: boolean;
  }) =>
    u.requires_classification ||
    u.requires_desconsolidation ||
    u.requires_assembly ||
    u.requires_repackaging;

  const reasons: string[] = [];

  const pendingToLocate = (units ?? []).filter(
    (u) =>
      !requiresProcessing(u) &&
      Number(u.physical_quantity) - (locatedByRU.get(u.id) ?? 0) > 0
  );
  if (pendingToLocate.length > 0)
    reasons.push(`${pendingToLocate.length} unidad(es) sin ubicar`);

  const withFlags = (units ?? []).filter(requiresProcessing);
  if (withFlags.length > 0)
    reasons.push(`${withFlags.length} unidad(es) con procesamiento pendiente`);

  const inReview = (units ?? []).filter(
    (u) => u.content_status === "incident"
  );
  if (inReview.length > 0)
    reasons.push(`${inReview.length} unidad(es) en revisión`);

  // Unidades logísticas ubicadas deben estar en posiciones físicas de rack.
  const locatedLus = (lus ?? []).filter((l) => l.status === "located");
  const posIds = Array.from(
    new Set(
      locatedLus
        .map((l) => l.current_position_id)
        .filter((x): x is string => Boolean(x))
    )
  );
  let rackTypeById = new Map<string, string>();
  if (posIds.length > 0) {
    const { data: pos } = await supabase
      .from("positions")
      .select("id, type")
      .in("id", posIds);
    rackTypeById = new Map((pos ?? []).map((p) => [p.id, p.type]));
  }
  const luNotInRack = locatedLus.filter(
    (l) =>
      !l.current_position_id ||
      rackTypeById.get(l.current_position_id) !== "rack"
  );
  if (luNotInRack.length > 0)
    reasons.push(
      `${luNotInRack.length} unidad(es) logística(s) fuera de posiciones de rack`
    );

  if (reasons.length > 0 && !force) {
    return {
      ok: false,
      pending: true,
      error:
        "Esta orden todavía tiene pendientes. No se recomienda cerrar. (" +
        reasons.join(", ") +
        ")",
    };
  }

  // Cierre forzado: dejamos rastro en las notas de la orden.
  if (reasons.length > 0 && force) {
    const { data: ord } = await supabase
      .from("inbound_orders")
      .select("notes")
      .eq("id", orderId)
      .single();
    const stamp = new Date().toISOString();
    const audit = `[Cierre forzado ${stamp} por ${profile.role}: ${reasons.join(
      ", "
    )}]`;
    const newNotes = ord?.notes ? `${ord.notes}\n${audit}` : audit;
    await supabase
      .from("inbound_orders")
      .update({ notes: newNotes })
      .eq("id", orderId);
  }

  const { error } = await supabase
    .from("inbound_orders")
    .update({ status: "closed" })
    .eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  revalidateOrder(orderId);
  return { ok: true };
}

export async function deleteInboundOrderAction(
  orderId: string
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { ok: false, error: "No tenés permisos para eliminar órdenes." };
  }

  const supabase = createClient();

  // Regla de trazabilidad: una orden NO se puede borrar si ya tiene
  // trazabilidad asociada (unidades, movimientos reales, unidades logísticas,
  // servicios, documentos o descarga). El movimiento `inbound_created` que se
  // crea al nacer la orden NO cuenta como trazabilidad.
  const [
    receivedUnits,
    logisticUnits,
    billableServices,
    realMovements,
    files,
    discharge,
  ] = await Promise.all([
    supabase
      .from("received_units")
      .select("id", { count: "exact", head: true })
      .eq("inbound_order_id", orderId),
    supabase
      .from("logistic_units")
      .select("id", { count: "exact", head: true })
      .eq("inbound_order_id", orderId),
    supabase
      .from("billable_services")
      .select("id", { count: "exact", head: true })
      .eq("inbound_order_id", orderId),
    supabase
      .from("movements")
      .select("id", { count: "exact", head: true })
      .eq("inbound_order_id", orderId)
      .neq("movement_type", "inbound_created"),
    supabase
      .from("uploaded_files")
      .select("id", { count: "exact", head: true })
      .eq("related_entity_type", "inbound_order")
      .eq("related_entity_id", orderId),
    supabase
      .from("inbound_order_discharge")
      .select("id", { count: "exact", head: true })
      .eq("inbound_order_id", orderId),
  ]);

  const hasTraceability =
    (receivedUnits.count ?? 0) > 0 ||
    (logisticUnits.count ?? 0) > 0 ||
    (billableServices.count ?? 0) > 0 ||
    (realMovements.count ?? 0) > 0 ||
    (files.count ?? 0) > 0 ||
    (discharge.count ?? 0) > 0;

  if (hasTraceability) {
    return {
      ok: false,
      error:
        "Esta orden ya tiene movimientos o mercadería ubicada. No se puede borrar porque rompería la trazabilidad. Usá anulación/reversión.",
    };
  }

  // Orden sin trazabilidad: borramos también el movimiento de creación
  // (`inbound_created`), que de lo contrario quedaría huérfano.
  await supabase
    .from("movements")
    .delete()
    .eq("inbound_order_id", orderId)
    .eq("movement_type", "inbound_created");

  const { error } = await supabase
    .from("inbound_orders")
    .delete()
    .eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  revalidateOrder();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Registrar descarga (movimiento + servicio facturable)
// ---------------------------------------------------------------------------

/**
 * Registra la descarga del camión con un resumen físico (pallets/cajas/
 * bultos/unidades sueltas) que queda como snapshot 1:1 en
 * `inbound_order_discharge`. A partir de ese resumen:
 *  - actualiza/crea el movimiento `download_from_truck` (con cantidad total),
 *  - genera los servicios facturables `truck_download` POR TIPO (pallet/caja/
 *    bulto/unidad). Solo si no hay detalle por tipo factura "1 camión".
 *  - genera `desconsolidation` aparte si aplica (no duplica la descarga).
 * Es idempotente: al reejecutar, regenera solo los servicios pendientes que
 * crea esta acción (nunca toca los ya facturados).
 */
export async function registerDownloadAction(
  orderId: string,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireProfile();

  const parsed = dischargeSchema.safeParse(
    dischargeInputFromFormData(formData)
  );
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }
  const d = parsed.data;

  const supabase = createClient();

  const { data: order } = await supabase
    .from("inbound_orders")
    .select("id, client_id")
    .eq("id", orderId)
    .single();
  if (!order) return { ok: false, error: "Orden no encontrada." };

  const totalUnits =
    d.total_units_count ??
    d.pallets_count + d.boxes_count + d.packages_count + d.loose_items_count;

  // Posición de piso de ingreso (destino lógico de la descarga)
  const { data: floor } = await supabase
    .from("positions")
    .select("id")
    .eq("code", "FLOOR-INBOUND-01")
    .maybeSingle();

  // 1) Snapshot de descarga (1:1): upsert manual sobre la orden
  const dischargePayload = {
    pallets_count: d.pallets_count,
    boxes_count: d.boxes_count,
    packages_count: d.packages_count,
    loose_items_count: d.loose_items_count,
    total_units_count: d.total_units_count,
    requires_desconsolidation: d.requires_desconsolidation,
    requires_classification: d.requires_classification,
    requires_assembly: d.requires_assembly,
    notes: d.notes,
  };
  const { data: existingDischarge } = await supabase
    .from("inbound_order_discharge")
    .select("id")
    .eq("inbound_order_id", orderId)
    .maybeSingle();
  if (existingDischarge) {
    await supabase
      .from("inbound_order_discharge")
      .update(dischargePayload)
      .eq("id", existingDischarge.id);
  } else {
    await supabase.from("inbound_order_discharge").insert({
      inbound_order_id: orderId,
      discharged_by: profile.id,
      ...dischargePayload,
    });
  }

  // 2) Movimiento download_from_truck: mantenemos uno solo por orden
  const { data: existingMov } = await supabase
    .from("movements")
    .select("id")
    .eq("inbound_order_id", orderId)
    .eq("movement_type", "download_from_truck")
    .maybeSingle();
  let movementId = existingMov?.id ?? null;
  if (existingMov) {
    await supabase
      .from("movements")
      .update({
        quantity: totalUnits || null,
        to_position_id: floor?.id ?? null,
        notes: "Descarga de camión registrada",
      })
      .eq("id", existingMov.id);
  } else {
    const { data: mov } = await supabase
      .from("movements")
      .insert({
        movement_type: "download_from_truck",
        inbound_order_id: orderId,
        client_id: order.client_id,
        user_id: profile.id,
        quantity: totalUnits || null,
        to_position_id: floor?.id ?? null,
        notes: "Descarga de camión registrada",
      })
      .select("id")
      .single();
    movementId = mov?.id ?? null;
  }

  // 3) Servicios facturables: regenerar solo los pendientes que crea esta
  //    acción (no tocar los ya facturados ni los de otros tipos).
  await supabase
    .from("billable_services")
    .delete()
    .eq("inbound_order_id", orderId)
    .eq("status", "pending_billing")
    .in("service_type", ["truck_download", "desconsolidation"]);

  const services: {
    client_id: string;
    service_type: "truck_download" | "desconsolidation";
    quantity: number;
    unit: string;
    inbound_order_id: string;
    movement_id: string | null;
    status: "pending_billing";
    notes: string;
  }[] = [];

  // Regla de facturación: la descarga se factura POR TIPO de unidad. Solo si no
  // hay ningún detalle por tipo (todos los counts en 0) se factura "1 camión"
  // como descarga genérica. Nunca camión + tipos a la vez.
  const perType: { count: number; unit: string; label: string }[] = [
    { count: d.pallets_count, unit: "pallet", label: "Descarga de pallets" },
    { count: d.boxes_count, unit: "caja", label: "Descarga de cajas" },
    { count: d.packages_count, unit: "bulto", label: "Descarga de bultos" },
    {
      count: d.loose_items_count,
      unit: "unidad suelta",
      label: "Descarga de unidades sueltas",
    },
  ];
  let anyType = false;
  for (const t of perType) {
    if (t.count > 0) {
      anyType = true;
      services.push({
        client_id: order.client_id,
        service_type: "truck_download",
        quantity: t.count,
        unit: t.unit,
        inbound_order_id: orderId,
        movement_id: movementId,
        status: "pending_billing",
        notes: t.label,
      });
    }
  }
  if (!anyType) {
    // Sin detalle por tipo: descarga genérica de camión.
    services.push({
      client_id: order.client_id,
      service_type: "truck_download",
      quantity: 1,
      unit: "camión",
      inbound_order_id: orderId,
      movement_id: movementId,
      status: "pending_billing",
      notes: "Descarga de camión (sin detalle por tipo)",
    });
  }
  // La desconsolidación es un servicio separado: no reemplaza ni duplica la
  // descarga por unidad.
  if (d.requires_desconsolidation) {
    services.push({
      client_id: order.client_id,
      service_type: "desconsolidation",
      quantity: 1,
      unit: "servicio",
      inbound_order_id: orderId,
      movement_id: movementId,
      status: "pending_billing",
      notes: "Desconsolidación requerida en descarga",
    });
  }
  await supabase.from("billable_services").insert(services);

  // 4) Generar unidades recibidas faltantes a partir del resumen (por tipo).
  //    Completa solo lo que falta vs. lo ya creado, hereda flags del resumen.
  await generateMissingReceivedUnits(supabase, {
    orderId,
    clientId: order.client_id,
    userId: profile.id,
    floorId: floor?.id ?? null,
    counts: {
      pallet: d.pallets_count,
      box: d.boxes_count,
      package: d.packages_count,
      loose_item: d.loose_items_count,
    },
  });

  await supabase
    .from("inbound_orders")
    .update({ status: "downloaded" })
    .eq("id", orderId);

  revalidateOrder(orderId);
  return { ok: true };
}

/**
 * Crea las unidades recibidas que faltan según el resumen de descarga,
 * comparando por tipo contra lo ya cargado (convención: una fila por tipo con
 * physical_quantity = cantidad de bultos). No elimina ni duplica: solo agrega
 * el faltante. Hereda los flags del resumen.
 */
async function generateMissingReceivedUnits(
  supabase: ReturnType<typeof createClient>,
  params: {
    orderId: string;
    clientId: string;
    userId: string;
    floorId: string | null;
    counts: Record<ReceivedUnitType, number> | Record<string, number>;
  }
): Promise<void> {
  const { orderId, clientId, userId, floorId, counts } = params;

  const { data: existing } = await supabase
    .from("received_units")
    .select("type, physical_quantity")
    .eq("inbound_order_id", orderId);

  const existingByType = new Map<string, number>();
  for (const u of existing ?? []) {
    existingByType.set(
      u.type,
      (existingByType.get(u.type) ?? 0) + Number(u.physical_quantity)
    );
  }

  const order: ReceivedUnitType[] = ["pallet", "box", "package", "loose_item"];
  for (const type of order) {
    const desired = Number(counts[type] ?? 0);
    if (desired <= 0) continue;
    const already = existingByType.get(type) ?? 0;
    const missing = desired - already;
    if (missing <= 0) continue;

    const { data: code } = await supabase.rpc("next_received_unit_code");
    if (!code) continue;

    const { data: unit } = await supabase
      .from("received_units")
      .insert({
        code,
        inbound_order_id: orderId,
        client_id: clientId,
        type,
        physical_quantity: missing,
        content_status: "unknown",
        current_position_id: floorId,
        // Las unidades nacen SIN requisitos de procesamiento: los flags de la
        // descarga son solo para facturación/resumen, no se heredan. Si una
        // unidad puntual requiere clasificación/desconsolidación/armado/
        // reembalaje, se marca a mano. Por default: todo false -> ubicable.
        requires_classification: false,
        requires_desconsolidation: false,
        requires_assembly: false,
        requires_repackaging: false,
        notes: "Generada desde el resumen de descarga",
      })
      .select("id")
      .single();
    if (!unit) continue;

    await supabase.from("movements").insert({
      movement_type: "received_unit_created",
      inbound_order_id: orderId,
      received_unit_id: unit.id,
      client_id: clientId,
      user_id: userId,
      quantity: missing,
      to_position_id: floorId,
      notes: `Unidad recibida ${code} generada desde el resumen de descarga`,
    });
  }
}

/**
 * Acción manual: genera las unidades recibidas faltantes según el resumen de
 * descarga, reutilizando exactamente la misma lógica que corre automáticamente
 * al registrar la descarga (solo completa el faltante, nunca duplica/elimina).
 */
export async function generateMissingReceivedUnitsAction(
  orderId: string
): Promise<ActionResult> {
  const profile = await requireProfile();
  const supabase = createClient();

  const { data: order } = await supabase
    .from("inbound_orders")
    .select("id, client_id")
    .eq("id", orderId)
    .single();
  if (!order) return { ok: false, error: "Orden no encontrada." };

  const { data: discharge } = await supabase
    .from("inbound_order_discharge")
    .select("*")
    .eq("inbound_order_id", orderId)
    .maybeSingle();
  if (!discharge) {
    return { ok: false, error: "Todavía no se registró la descarga." };
  }

  const { data: floor } = await supabase
    .from("positions")
    .select("id")
    .eq("code", "FLOOR-INBOUND-01")
    .maybeSingle();

  await generateMissingReceivedUnits(supabase, {
    orderId,
    clientId: order.client_id,
    userId: profile.id,
    floorId: floor?.id ?? null,
    counts: {
      pallet: discharge.pallets_count,
      box: discharge.boxes_count,
      package: discharge.packages_count,
      loose_item: discharge.loose_items_count,
    },
  });

  revalidateOrder(orderId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Documentos (Supabase Storage + uploaded_files)
// ---------------------------------------------------------------------------

/**
 * Archivo subido vía multipart. Evitamos `instanceof File` porque el global
 * `File` no existe en Node < 20; usamos duck-typing sobre el Blob de FormData.
 */
type UploadedFile = {
  name: string;
  size: number;
  type: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

function isUploadedFile(value: unknown): value is UploadedFile {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as UploadedFile).arrayBuffer === "function" &&
    typeof (value as UploadedFile).size === "number"
  );
}

export async function uploadDocumentAction(
  orderId: string,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireProfile();
  const file = formData.get("file");

  if (!isUploadedFile(file) || file.size === 0) {
    return { ok: false, error: "Seleccioná un archivo." };
  }
  if (file.size > 15 * 1024 * 1024) {
    return { ok: false, error: "El archivo supera los 15 MB." };
  }

  const supabase = createClient();

  const safeName = (file.name || "documento").replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const path = `remittances/${orderId}/${Date.now()}-${safeName}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadErr } = await supabase.storage
    .from("wms-files")
    .upload(path, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (uploadErr) return { ok: false, error: uploadErr.message };

  const { error: insertErr } = await supabase.from("uploaded_files").insert({
    bucket: "wms-files",
    path,
    file_type: file.type || null,
    related_entity_type: "inbound_order",
    related_entity_id: orderId,
    uploaded_by: profile.id,
  });
  if (insertErr) return { ok: false, error: insertErr.message };

  revalidateOrder(orderId);
  return { ok: true };
}

export async function deleteDocumentAction(
  fileId: string,
  orderId: string
): Promise<ActionResult> {
  await requireProfile();
  const supabase = createClient();

  const { data: file } = await supabase
    .from("uploaded_files")
    .select("path")
    .eq("id", fileId)
    .single();

  if (file?.path) {
    await supabase.storage.from("wms-files").remove([file.path]);
  }
  const { error } = await supabase
    .from("uploaded_files")
    .delete()
    .eq("id", fileId);
  if (error) return { ok: false, error: error.message };

  revalidateOrder(orderId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// OCR (extracción cruda; NUNCA crea stock)
// ---------------------------------------------------------------------------

export async function runOcrAction(
  orderId: string,
  fileId: string
): Promise<ActionResult> {
  await requireProfile();
  const supabase = createClient();

  const { data: file } = await supabase
    .from("uploaded_files")
    .select("path, file_type")
    .eq("id", fileId)
    .single();

  if (!file) return { ok: false, error: "Documento no encontrado." };
  if (file.file_type && !file.file_type.startsWith("image/")) {
    return {
      ok: false,
      error:
        "El OCR automático solo soporta imágenes (JPG/PNG). Para PDF, cargá los datos manualmente.",
    };
  }

  const { data: signed } = await supabase.storage
    .from("wms-files")
    .createSignedUrl(file.path, 600);
  if (!signed?.signedUrl) {
    return { ok: false, error: "No se pudo generar el enlace del documento." };
  }

  try {
    const extracted = await extractRemittanceData(signed.signedUrl);
    const { error } = await supabase
      .from("inbound_orders")
      .update({
        ai_extracted_data_json: extracted,
        status: "pending_validation",
      })
      .eq("id", orderId);
    if (error) return { ok: false, error: error.message };
  } catch (err) {
    const message =
      err instanceof OcrError
        ? err.message
        : "Error inesperado ejecutando el OCR.";
    return { ok: false, error: message };
  }

  revalidateOrder(orderId);
  return { ok: true };
}

/** Guarda los datos confirmados por el humano. No crea stock. */
export async function saveConfirmedDataAction(
  orderId: string,
  data: OcrData
): Promise<ActionResult> {
  await requireProfile();

  const parsed = ocrDataSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Datos del remito inválidos." };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("inbound_orders")
    .update({
      human_confirmed_data_json: parsed.data,
      status: "pending_classification",
    })
    .eq("id", orderId);

  if (error) return { ok: false, error: error.message };

  revalidateOrder(orderId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Unidades recibidas (received_units) + movimiento
// ---------------------------------------------------------------------------

export async function createReceivedUnitAction(
  orderId: string,
  _prev: InboundFormState,
  formData: FormData
): Promise<InboundFormState> {
  const profile = await requireProfile();

  const parsed = receivedUnitSchema.safeParse(
    receivedUnitInputFromFormData(formData)
  );
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const supabase = createClient();

  const { data: order } = await supabase
    .from("inbound_orders")
    .select("id, client_id")
    .eq("id", orderId)
    .single();
  if (!order) return { error: "Orden no encontrada." };

  // Código legible (UR-0001) vía función de la base
  const { data: code, error: codeErr } = await supabase.rpc(
    "next_received_unit_code"
  );
  if (codeErr || !code) {
    return { error: codeErr?.message ?? "No se pudo generar el código." };
  }

  const { data: unit, error: insertErr } = await supabase
    .from("received_units")
    .insert({
      code,
      inbound_order_id: orderId,
      client_id: order.client_id,
      type: parsed.data.type,
      physical_quantity: parsed.data.physical_quantity,
      content_status: parsed.data.content_status,
      current_position_id: parsed.data.current_position_id,
      requires_classification: parsed.data.requires_classification,
      requires_desconsolidation: parsed.data.requires_desconsolidation,
      requires_assembly: parsed.data.requires_assembly,
      requires_repackaging: parsed.data.requires_repackaging,
      notes: parsed.data.notes,
    })
    .select("id")
    .single();

  if (insertErr || !unit) {
    return { error: insertErr?.message ?? "No se pudo crear la unidad." };
  }

  // Movimiento: unidad recibida creada
  await supabase.from("movements").insert({
    movement_type: "received_unit_created",
    inbound_order_id: orderId,
    received_unit_id: unit.id,
    client_id: order.client_id,
    user_id: profile.id,
    quantity: parsed.data.physical_quantity,
    to_position_id: parsed.data.current_position_id,
    notes: `Unidad recibida ${code} creada`,
  });

  revalidateOrder(orderId);
  return { ok: true };
}

/**
 * Edita los requisitos de procesamiento de una unidad recibida (clasificación,
 * desconsolidación, armado, reembalaje) y sus notas. Estos flags —y solo
 * estos— determinan si la unidad debe pasar por clasificación antes de
 * ubicarse. El `content_status` no influye.
 */
export async function updateReceivedUnitRequirementsAction(
  unitId: string,
  orderId: string,
  input: {
    requires_classification: boolean;
    requires_desconsolidation: boolean;
    requires_assembly: boolean;
    requires_repackaging: boolean;
    notes: string | null;
  }
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return {
      ok: false,
      error: "No tenés permisos para editar requisitos de unidades.",
    };
  }

  const supabase = createClient();

  const { data: unit } = await supabase
    .from("received_units")
    .select("id")
    .eq("id", unitId)
    .single();
  if (!unit) return { ok: false, error: "Unidad recibida no encontrada." };

  const notes = input.notes && input.notes.trim() ? input.notes.trim() : null;

  const { error } = await supabase
    .from("received_units")
    .update({
      requires_classification: input.requires_classification === true,
      requires_desconsolidation: input.requires_desconsolidation === true,
      requires_assembly: input.requires_assembly === true,
      requires_repackaging: input.requires_repackaging === true,
      notes,
    })
    .eq("id", unitId);
  if (error) return { ok: false, error: error.message };

  revalidateOrder(orderId);
  return { ok: true };
}

export async function deleteReceivedUnitAction(
  unitId: string,
  orderId: string
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { ok: false, error: "No tenés permisos para eliminar unidades." };
  }

  const supabase = createClient();

  // Regla de trazabilidad: una unidad recibida NO se puede borrar si ya generó
  // unidades logísticas o tiene movimientos reales (p. ej. ubicación). El
  // movimiento `received_unit_created` que nace con la unidad NO cuenta.
  const [logisticUnits, realMovements] = await Promise.all([
    supabase
      .from("logistic_units")
      .select("id", { count: "exact", head: true })
      .eq("received_unit_id", unitId),
    supabase
      .from("movements")
      .select("id", { count: "exact", head: true })
      .eq("received_unit_id", unitId)
      .neq("movement_type", "received_unit_created"),
  ]);

  if ((logisticUnits.count ?? 0) > 0 || (realMovements.count ?? 0) > 0) {
    return {
      ok: false,
      error:
        "Esta unidad ya tiene movimientos o mercadería ubicada. No se puede borrar porque rompería la trazabilidad. Usá anulación/reversión.",
    };
  }

  // Unidad sin trazabilidad: borramos también su movimiento de creación
  // (`received_unit_created`), que de lo contrario quedaría huérfano.
  await supabase
    .from("movements")
    .delete()
    .eq("received_unit_id", unitId)
    .eq("movement_type", "received_unit_created");

  const { error } = await supabase
    .from("received_units")
    .delete()
    .eq("id", unitId);
  if (error) return { ok: false, error: error.message };

  revalidateOrder(orderId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Ubicación de mercadería (crea unidades logísticas + movimientos + servicios)
// ---------------------------------------------------------------------------

/** Cantidad ya ubicada de una unidad recibida (suma de location_assignment). */
async function locatedQtyForReceivedUnit(
  supabase: ReturnType<typeof createClient>,
  receivedUnitId: string
): Promise<number> {
  const { data } = await supabase
    .from("movements")
    .select("quantity")
    .eq("received_unit_id", receivedUnitId)
    .eq("movement_type", "location_assignment");
  return (data ?? []).reduce((acc, m) => acc + (Number(m.quantity) || 0), 0);
}

/**
 * Ubica una unidad recibida en una o más posiciones destino.
 * Por cada destino crea una unidad logística `located`, su movimiento
 * `location_assignment` y un servicio facturable `location_assignment`.
 * Regla: nada se ubica sin movimiento. No ubica unidades que requieran
 * clasificación.
 */
export async function locateReceivedUnitAction(
  receivedUnitId: string,
  destinations: LocateDestinationInput[]
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { ok: false, error: "No tenés permisos para ubicar mercadería." };
  }

  const parsed = locateInputSchema.safeParse({
    received_unit_id: receivedUnitId,
    destinations,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }
  const dests = parsed.data.destinations;

  const supabase = createClient();

  const { data: unit } = await supabase
    .from("received_units")
    .select(
      "id, client_id, inbound_order_id, type, physical_quantity, requires_classification, requires_desconsolidation, requires_assembly, requires_repackaging, current_position_id"
    )
    .eq("id", receivedUnitId)
    .single();
  if (!unit) return { ok: false, error: "Unidad recibida no encontrada." };

  if (
    unit.requires_classification ||
    unit.requires_desconsolidation ||
    unit.requires_assembly ||
    unit.requires_repackaging
  ) {
    return {
      ok: false,
      error:
        "Esta unidad requiere procesamiento previo (clasificación, desconsolidación, armado o reembalaje) antes de ubicarse.",
    };
  }

  // Validar cantidad disponible
  const alreadyLocated = await locatedQtyForReceivedUnit(
    supabase,
    receivedUnitId
  );
  const available = Number(unit.physical_quantity) - alreadyLocated;
  const requested = dests.reduce((acc, d) => acc + d.quantity, 0);
  if (requested > available) {
    return {
      ok: false,
      error: `La cantidad a ubicar (${requested}) supera la disponible (${available}).`,
    };
  }

  // Contenido/stock declarado en la unidad recibida. Se copia a la(s) unidad(es)
  // logística(s) SOLO en la primera ubicación (alreadyLocated === 0) para no
  // duplicar stock en ubicaciones parciales sucesivas. Se reparte de forma
  // proporcional a la cantidad física que va a cada destino.
  const firstPlacement = alreadyLocated === 0;
  let unitContents: {
    product_id: string;
    quantity: number;
    unit_of_measure: string | null;
    lot: string | null;
  }[] = [];
  if (firstPlacement) {
    const { data: rc } = await supabase
      .from("received_unit_contents")
      .select("product_id, quantity, unit_of_measure, lot")
      .eq("received_unit_id", receivedUnitId);
    unitContents = rc ?? [];
  }

  // Posición de origen: la actual de la unidad o el piso de ingreso
  let fromPositionId = unit.current_position_id;
  if (!fromPositionId) {
    const { data: floor } = await supabase
      .from("positions")
      .select("id")
      .eq("code", "FLOOR-INBOUND-01")
      .maybeSingle();
    fromPositionId = floor?.id ?? null;
  }

  const logisticType = RECEIVED_TO_LOGISTIC_TYPE[unit.type];
  const billingUnit = BILLING_UNIT_BY_TYPE[unit.type];

  for (const dest of dests) {
    // Validar la posición destino y su situación actual
    const { data: pos } = await supabase
      .from("positions")
      .select("id, assigned_client_id, status")
      .eq("id", dest.position_id)
      .single();
    if (!pos) return { ok: false, error: "Posición destino no encontrada." };

    // Ocupantes actuales (unidades logísticas ubicadas) para detectar mezcla
    // de clientes aunque la posición no tenga asignación formal.
    const { data: occupants } = await supabase
      .from("logistic_units")
      .select("client_id")
      .eq("current_position_id", dest.position_id)
      .eq("status", "located");

    const hasOtherClient =
      (pos.assigned_client_id != null &&
        pos.assigned_client_id !== unit.client_id) ||
      (occupants ?? []).some((o) => o.client_id !== unit.client_id);
    const isBlocked = pos.status === "blocked" || pos.status === "incident";

    // Override (solo staff, que es quien puede ubicar) para casos especiales.
    let overrideNote = "";
    if (isBlocked) {
      if (!dest.override) {
        return {
          ok: false,
          error:
            "La posición está bloqueada o en revisión. Requiere confirmación (override) para ubicar.",
        };
      }
      overrideNote += " · Override: ubicada en posición bloqueada/en revisión";
    }
    if (hasOtherClient) {
      if (!dest.override) {
        return {
          ok: false,
          error:
            "La posición tiene mercadería de otro cliente. Requiere confirmación (override) para mezclar clientes.",
        };
      }
      overrideNote += " · Override: mezcla de clientes en la misma posición";
    }

    // Asignar la posición al cliente si está libre y se pidió asignar
    if (!pos.assigned_client_id && dest.assign_to_client) {
      await supabase
        .from("client_position_assignments")
        .update({ released_at: new Date().toISOString() })
        .eq("position_id", dest.position_id)
        .is("released_at", null);
      await supabase.from("client_position_assignments").insert({
        position_id: dest.position_id,
        client_id: unit.client_id,
        created_by: profile.id,
        notes: "Asignada al ubicar mercadería",
      });
      await supabase
        .from("positions")
        .update({ assigned_client_id: unit.client_id })
        .eq("id", dest.position_id);
    }

    // Crear la unidad logística ubicada
    const { data: code } = await supabase.rpc("next_logistic_unit_code");
    if (!code) {
      return { ok: false, error: "No se pudo generar el código de la unidad logística." };
    }
    const { data: lu, error: luErr } = await supabase
      .from("logistic_units")
      .insert({
        code,
        received_unit_id: receivedUnitId,
        inbound_order_id: unit.inbound_order_id,
        client_id: unit.client_id,
        type: logisticType,
        status: "located",
        current_position_id: dest.position_id,
        entry_date: new Date().toISOString(),
        notes: `Ubicada desde unidad recibida (${dest.quantity} ${billingUnit})`,
      })
      .select("id")
      .single();
    if (luErr || !lu) {
      return { ok: false, error: luErr?.message ?? "No se pudo crear la unidad logística." };
    }

    // Copiar contenido/stock a la unidad logística (proporcional a la cantidad).
    if (firstPlacement && unitContents.length > 0 && requested > 0) {
      const share = dest.quantity / requested;
      const contentRows = unitContents
        .map((c) => ({
          logistic_unit_id: lu.id,
          product_id: c.product_id,
          quantity: Math.round(Number(c.quantity) * share * 1000) / 1000,
          unit_of_measure: c.unit_of_measure,
          lot: c.lot,
          status: "available" as const,
        }))
        .filter((r) => r.quantity > 0);
      if (contentRows.length > 0) {
        await supabase.from("logistic_unit_contents").insert(contentRows);
      }
    }

    // Servicio facturable: asignación de ubicación
    const { data: service } = await supabase
      .from("billable_services")
      .insert({
        client_id: unit.client_id,
        service_type: "location_assignment",
        quantity: dest.quantity,
        unit: billingUnit,
        inbound_order_id: unit.inbound_order_id,
        status: "pending_billing",
        notes: "Asignación de ubicación",
      })
      .select("id")
      .single();

    // Movimiento: asignación de ubicación (nada se ubica sin movimiento)
    await supabase.from("movements").insert({
      movement_type: "location_assignment",
      received_unit_id: receivedUnitId,
      logistic_unit_id: lu.id,
      client_id: unit.client_id,
      inbound_order_id: unit.inbound_order_id,
      user_id: profile.id,
      quantity: dest.quantity,
      from_position_id: fromPositionId,
      to_position_id: dest.position_id,
      billable_service_id: service?.id ?? null,
      notes: "Asignación de ubicación" + overrideNote,
    });

    // Estado de ocupación: MANUAL (capacidad flexible, no se infiere por
    // cantidad). Se usa lo elegido por el usuario; si no eligió, solo pasamos
    // de "libre" a "parcialmente ocupada" por defecto. El resto se respeta.
    let newStatus: PositionStatus | null = null;
    if (dest.final_status === "partially_occupied" || dest.final_status === "occupied") {
      newStatus = dest.final_status;
    } else if (pos.status === "free") {
      newStatus = "partially_occupied";
    }
    if (newStatus && newStatus !== pos.status) {
      await supabase
        .from("positions")
        .update({ status: newStatus })
        .eq("id", dest.position_id);
    }
  }

  // Actualizar estado de la orden según el avance de ubicación
  if (unit.inbound_order_id) {
    await refreshInboundLocationStatus(supabase, unit.inbound_order_id);
    revalidateOrder(unit.inbound_order_id);
  }
  revalidatePath("/posiciones");
  revalidatePath("/mapa");
  revalidatePath("/unidades-logisticas");
  return { ok: true };
}

/**
 * Recalcula el estado de la orden según cuánto se ubicó:
 *  - si todas las unidades recibidas (sin clasificación pendiente) quedaron
 *    completamente ubicadas -> `located`
 *  - si hay algo ubicado pero falta -> al menos `ready_to_locate`
 */
async function refreshInboundLocationStatus(
  supabase: ReturnType<typeof createClient>,
  orderId: string
): Promise<void> {
  const { data: units } = await supabase
    .from("received_units")
    .select(
      "id, physical_quantity, requires_classification, requires_desconsolidation, requires_assembly, requires_repackaging"
    )
    .eq("inbound_order_id", orderId);

  if (!units || units.length === 0) return;

  let allLocated = true;
  for (const u of units) {
    const requiresProcessing =
      u.requires_classification ||
      u.requires_desconsolidation ||
      u.requires_assembly ||
      u.requires_repackaging;
    const located = await locatedQtyForReceivedUnit(supabase, u.id);
    if (requiresProcessing || located < Number(u.physical_quantity)) {
      allLocated = false;
    }
  }

  const { data: order } = await supabase
    .from("inbound_orders")
    .select("status")
    .eq("id", orderId)
    .single();
  if (!order) return;

  const current = order.status as InboundOrderStatus;
  if (allLocated) {
    if (current !== "located" && current !== "closed") {
      await supabase
        .from("inbound_orders")
        .update({ status: "located" })
        .eq("id", orderId);
    }
    return;
  }

  // Aún quedan pendientes: asegurar al menos ready_to_locate (sin retroceder)
  const beforeLocate: InboundOrderStatus[] = [
    "pending_download",
    "downloaded",
    "pending_validation",
    "pending_classification",
    "partially_classified",
  ];
  if (beforeLocate.includes(current)) {
    await supabase
      .from("inbound_orders")
      .update({ status: "ready_to_locate" })
      .eq("id", orderId);
  }
}
