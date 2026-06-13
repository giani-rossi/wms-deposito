"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, isStaff } from "@/lib/auth";
import {
  locatedQtyForReceivedUnit,
  refreshInboundLocationStatus,
} from "@/lib/actions/inbound-location-status";
import {
  receivedUnitRequiresProcessing,
  BILLING_UNIT_BY_TYPE,
} from "@/lib/constants";
import {
  processReceivedUnitSchema,
  type ProcessingOperationType,
} from "@/lib/validation/processing";
import type {
  BillableServiceType,
  ContentStatus,
  MovementType,
} from "@/lib/types/database";

type ActionResult = { ok: boolean; error?: string; codes?: string[] };

const FLOOR_INBOUND_CODE = "FLOOR-INBOUND-01";
const QTY_EPS = 0.001;

function operationMatchesMovement(
  op: ProcessingOperationType
): MovementType & BillableServiceType {
  return op;
}

function buildBalance(
  lines: { product_id: string; quantity: number }[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of lines) {
    map.set(
      line.product_id,
      (map.get(line.product_id) ?? 0) + Number(line.quantity)
    );
  }
  return map;
}

function balancesMatch(
  origin: Map<string, number>,
  result: Map<string, number>
): boolean {
  if (origin.size !== result.size) return false;
  for (const [productId, qty] of origin) {
    const out = result.get(productId) ?? 0;
    if (Math.abs(qty - out) > QTY_EPS) return false;
  }
  return true;
}

async function hasExistingBillableForOperation(
  supabase: ReturnType<typeof createClient>,
  receivedUnitId: string,
  operationType: ProcessingOperationType
): Promise<boolean> {
  const { data } = await supabase
    .from("movements")
    .select("id, billable_service_id")
    .eq("received_unit_id", receivedUnitId)
    .eq("movement_type", operationType)
    .not("billable_service_id", "is", null)
    .limit(1);
  return (data ?? []).length > 0;
}

/**
 * Procesa una received_unit completa: crea ULs resultantes en piso ingreso,
 * registra movimientos/servicio facturable y marca la UR como procesada.
 */
export async function processReceivedUnitAction(
  input: unknown
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return { ok: false, error: "No tenés permisos para procesar unidades." };
  }

  const parsed = processReceivedUnitSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors[0]?.message ?? "Datos inválidos",
    };
  }

  const { received_unit_id, operation_type, notes, result_units } =
    parsed.data;

  const supabase = createClient();

  const { data: unit } = await supabase
    .from("received_units")
    .select(
      "id, code, client_id, inbound_order_id, type, physical_quantity, display_label, content_status, current_position_id, processed_at, requires_classification, requires_desconsolidation, requires_assembly, requires_repackaging"
    )
    .eq("id", received_unit_id)
    .single();

  if (!unit) {
    return { ok: false, error: "Unidad recibida no encontrada." };
  }
  if (unit.processed_at) {
    return {
      ok: false,
      error: "Esta unidad recibida ya fue procesada.",
    };
  }
  if (!receivedUnitRequiresProcessing(unit)) {
    return {
      ok: false,
      error: "La unidad no tiene procesamiento pendiente.",
    };
  }

  const located = await locatedQtyForReceivedUnit(supabase, received_unit_id);
  if (located > 0) {
    return {
      ok: false,
      error: "No se puede procesar una unidad que ya tiene mercadería ubicada.",
    };
  }

  const { data: originContents } = await supabase
    .from("received_unit_contents")
    .select("product_id, quantity, unit_of_measure, lot")
    .eq("received_unit_id", received_unit_id);

  if (!originContents || originContents.length === 0) {
    return {
      ok: false,
      error:
        "Primero cargá el contenido de la unidad antes de procesarla.",
    };
  }

  const originBalance = buildBalance(
    originContents.map((c) => ({
      product_id: c.product_id,
      quantity: Number(c.quantity),
    }))
  );

  const resultLines: { product_id: string; quantity: number }[] = [];
  for (const ru of result_units) {
    for (const line of ru.contents) {
      if (!originBalance.has(line.product_id)) {
        return {
          ok: false,
          error: "Hay productos resultantes que no existen en el contenido original.",
        };
      }
      resultLines.push({
        product_id: line.product_id,
        quantity: Number(line.quantity),
      });
    }
  }

  const resultBalance = buildBalance(resultLines);
  if (!balancesMatch(originBalance, resultBalance)) {
    return {
      ok: false,
      error:
        "La suma del contenido resultante debe ser igual al contenido original de la unidad.",
    };
  }

  const { data: floor } = await supabase
    .from("positions")
    .select("id")
    .eq("code", FLOOR_INBOUND_CODE)
    .maybeSingle();

  if (!floor?.id) {
    return {
      ok: false,
      error: `No existe la posición operativa ${FLOOR_INBOUND_CODE}.`,
    };
  }

  const fromPositionId = unit.current_position_id ?? floor.id;
  const movementType = operationMatchesMovement(operation_type);
  const billingUnit = BILLING_UNIT_BY_TYPE[unit.type];
  const createdCodes: string[] = [];
  const createdLuIds: string[] = [];

  for (const ru of result_units) {
    const { data: code } = await supabase.rpc("next_logistic_unit_code");
    if (!code) {
      return {
        ok: false,
        error: "No se pudo generar el código de la unidad logística.",
      };
    }

    const productIds = new Set(ru.contents.map((c) => c.product_id));
    const originByProduct = new Map(
      originContents.map((c) => [c.product_id, c])
    );

    const { data: lu, error: luErr } = await supabase
      .from("logistic_units")
      .insert({
        code,
        received_unit_id: received_unit_id,
        inbound_order_id: unit.inbound_order_id,
        client_id: unit.client_id,
        type: ru.type,
        status: "ready_to_locate",
        current_position_id: floor.id,
        entry_date: new Date().toISOString(),
        notes: ru.label
          ? `Procesada desde ${unit.code}: ${ru.label}`
          : `Procesada desde ${unit.code}`,
        is_mixed: productIds.size > 1,
      })
      .select("id")
      .single();

    if (luErr || !lu) {
      return {
        ok: false,
        error: luErr?.message ?? "No se pudo crear la unidad logística resultante.",
      };
    }

    createdCodes.push(code);
    createdLuIds.push(lu.id);

    const contentRows = ru.contents.map((line) => {
      const originLine = originByProduct.get(line.product_id);
      return {
        logistic_unit_id: lu.id,
        product_id: line.product_id,
        quantity: Number(line.quantity),
        unit_of_measure: originLine?.unit_of_measure ?? null,
        lot: originLine?.lot ?? null,
        status: "available" as const,
      };
    });

    const { error: contentErr } = await supabase
      .from("logistic_unit_contents")
      .insert(contentRows);
    if (contentErr) {
      return { ok: false, error: contentErr.message };
    }
  }

  const summaryNote = [
    notes ?? `Procesamiento ${operation_type}`,
    `UR ${unit.code}`,
    `Resultantes: ${createdCodes.join(", ")}`,
  ].join(" · ");

  const { data: mainMove, error: mainMoveErr } = await supabase
    .from("movements")
    .insert({
      movement_type: movementType,
      received_unit_id,
      client_id: unit.client_id,
      inbound_order_id: unit.inbound_order_id,
      user_id: profile.id,
      quantity: Number(unit.physical_quantity),
      from_position_id: fromPositionId,
      to_position_id: floor.id,
      notes: summaryNote,
    })
    .select("id")
    .single();

  if (mainMoveErr || !mainMove) {
    return {
      ok: false,
      error: mainMoveErr?.message ?? "No se pudo registrar el movimiento principal.",
    };
  }

  let billableServiceId: string | null = null;
  const alreadyBilled = await hasExistingBillableForOperation(
    supabase,
    received_unit_id,
    operation_type
  );

  if (!alreadyBilled) {
    const { data: service } = await supabase
      .from("billable_services")
      .insert({
        client_id: unit.client_id,
        service_type: operation_type,
        quantity: 1,
        unit: billingUnit,
        inbound_order_id: unit.inbound_order_id,
        movement_id: mainMove.id,
        status: "pending_billing",
        notes: summaryNote,
      })
      .select("id")
      .single();
    billableServiceId = service?.id ?? null;

    if (billableServiceId) {
      await supabase
        .from("movements")
        .update({ billable_service_id: billableServiceId })
        .eq("id", mainMove.id);
    }
  }

  for (let i = 0; i < createdLuIds.length; i++) {
    await supabase.from("movements").insert({
      movement_type: movementType,
      received_unit_id,
      logistic_unit_id: createdLuIds[i],
      client_id: unit.client_id,
      inbound_order_id: unit.inbound_order_id,
      user_id: profile.id,
      quantity: 1,
      from_position_id: floor.id,
      to_position_id: null,
      notes: `UL resultante ${createdCodes[i]} creada en ${FLOOR_INBOUND_CODE}`,
    });
  }

  const { error: deleteContentsErr } = await supabase
    .from("received_unit_contents")
    .delete()
    .eq("received_unit_id", received_unit_id);
  if (deleteContentsErr) {
    return { ok: false, error: deleteContentsErr.message };
  }

  const nextContentStatus: ContentStatus = "ready_to_locate";
  const { error: updateUrErr } = await supabase
    .from("received_units")
    .update({
      processed_at: new Date().toISOString(),
      last_processing_movement_id: mainMove.id,
      requires_classification: false,
      requires_desconsolidation: false,
      requires_assembly: false,
      requires_repackaging: false,
      content_status: nextContentStatus,
      current_position_id: floor.id,
    })
    .eq("id", received_unit_id);

  if (updateUrErr) {
    return { ok: false, error: updateUrErr.message };
  }

  if (unit.inbound_order_id) {
    await refreshInboundLocationStatus(supabase, unit.inbound_order_id);
    revalidatePath(`/ordenes-ingreso/${unit.inbound_order_id}`);
  }

  revalidatePath("/clasificacion");
  revalidatePath("/posiciones");
  revalidatePath("/mapa");
  revalidatePath("/unidades-logisticas");
  revalidatePath("/movimientos");
  revalidatePath("/servicios-facturables");

  return { ok: true, codes: createdCodes };
}
