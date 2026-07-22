import { describe, expect, it, beforeAll, afterEach } from "vitest";
import { integrationEnabled } from "./env";
import {
  createServiceClient,
  ensureStaffAuthClient,
  type AuthClient,
  type ServiceClient,
} from "./helpers/supabase-client";
import {
  addUnitToOutboundOrder,
  canCancelOutboundOrder,
  createLocatedUnit,
  createOutboundOrder,
  deleteLogisticUnit,
  deleteOutboundOrder,
  ensureFloorStoragePosition,
  getPositionId,
} from "./helpers/fixtures";

describe.skipIf(!integrationEnabled)("outbound order RPC + reglas", () => {
  let admin: ServiceClient;
  let auth: AuthClient;
  let staffUserId: string;
  const cleanupUnits: string[] = [];
  const cleanupOrders: string[] = [];

  beforeAll(async () => {
    admin = createServiceClient();
    const staff = await ensureStaffAuthClient();
    auth = staff.client;
    staffUserId = staff.userId;
  });

  afterEach(async () => {
    while (cleanupOrders.length) {
      const id = cleanupOrders.pop();
      if (id) await deleteOutboundOrder(admin, id);
    }
    while (cleanupUnits.length) {
      const id = cleanupUnits.pop();
      if (id) await deleteLogisticUnit(admin, id);
    }
  });

  async function setupOrderWithPreparedUnit() {
    const fixture = await createLocatedUnit(admin, { quantity: 3 });
    cleanupUnits.push(fixture.unitId);
    const orderId = await createOutboundOrder(admin, staffUserId);
    cleanupOrders.push(orderId);

    await addUnitToOutboundOrder(admin, orderId, fixture.unitId, "pending");
    const { error: prepErr } = await auth.rpc("prepare_outbound_order", {
      p_order_id: orderId,
      p_user_id: staffUserId,
    });
    expect(prepErr).toBeNull();

    return { orderId, unitId: fixture.unitId };
  }

  it("confirm_outbound_load segunda llamada no duplica salida ni truck_loading", async () => {
    const { orderId } = await setupOrderWithPreparedUnit();

    const first = await auth.rpc("confirm_outbound_load", {
      p_order_id: orderId,
      p_user_id: staffUserId,
    });
    expect(first.error).toBeNull();

    const { count: servicesAfterFirst } = await admin
      .from("billable_services")
      .select("id", { count: "exact", head: true })
      .eq("outbound_order_id", orderId)
      .eq("service_type", "truck_loading");

    const second = await auth.rpc("confirm_outbound_load", {
      p_order_id: orderId,
      p_user_id: staffUserId,
    });
    expect(second.error).toBeNull();
    expect((second.data as { already?: boolean })?.already).toBe(true);

    const { count: servicesAfterSecond } = await admin
      .from("billable_services")
      .select("id", { count: "exact", head: true })
      .eq("outbound_order_id", orderId)
      .eq("service_type", "truck_loading");

    expect(servicesAfterFirst).toBe(1);
    expect(servicesAfterSecond).toBe(1);
  });

  it("confirm_outbound_load marca UL, contenidos y orden correctamente", async () => {
    const { orderId, unitId } = await setupOrderWithPreparedUnit();

    const { error } = await auth.rpc("confirm_outbound_load", {
      p_order_id: orderId,
      p_user_id: staffUserId,
    });
    expect(error).toBeNull();

    const { data: unit } = await admin
      .from("logistic_units")
      .select("status, is_available, current_position_id")
      .eq("id", unitId)
      .single();
    expect(unit?.status).toBe("exited");
    expect(unit?.is_available).toBe(false);
    expect(unit?.current_position_id).toBeNull();

    const { data: contents } = await admin
      .from("logistic_unit_contents")
      .select("status")
      .eq("logistic_unit_id", unitId);
    expect(contents?.every((c: { status: string }) => c.status === "exited")).toBe(
      true
    );

    const { count: loadedMovements } = await admin
      .from("movements")
      .select("id", { count: "exact", head: true })
      .eq("outbound_order_id", orderId)
      .eq("movement_type", "outbound_loaded");

    const { data: order } = await admin
      .from("outbound_orders")
      .select("status")
      .eq("id", orderId)
      .single();

    expect(loadedMovements).toBe(1);
    expect(order?.status).toBe("closed");
  });

  it("no permite asociar la misma UL a dos órdenes activas", async () => {
    const fixture = await createLocatedUnit(admin, { quantity: 2 });
    cleanupUnits.push(fixture.unitId);

    const orderA = await createOutboundOrder(admin, staffUserId);
    const orderB = await createOutboundOrder(admin, staffUserId);
    cleanupOrders.push(orderA, orderB);

    await addUnitToOutboundOrder(admin, orderA, fixture.unitId, "pending");

    const { error } = await admin.from("outbound_order_logistic_units").insert({
      outbound_order_id: orderB,
      logistic_unit_id: fixture.unitId,
      line_status: "pending",
    });

    expect(error).toBeTruthy();
    expect(error?.code).toBe("23505");
  });

  it("prepare_outbound_order mueve UL de rack a FLOOR-OUTBOUND-01", async () => {
    const fixture = await createLocatedUnit(admin, { quantity: 4 });
    cleanupUnits.push(fixture.unitId);
    const orderId = await createOutboundOrder(admin, staffUserId);
    cleanupOrders.push(orderId);
    const floorId = await getPositionId(admin, "FLOOR-OUTBOUND-01");

    await addUnitToOutboundOrder(admin, orderId, fixture.unitId, "pending");

    const { error } = await auth.rpc("prepare_outbound_order", {
      p_order_id: orderId,
      p_user_id: staffUserId,
    });
    expect(error).toBeNull();

    const { data: unit } = await admin
      .from("logistic_units")
      .select("status, current_position_id")
      .eq("id", fixture.unitId)
      .single();
    expect(unit?.status).toBe("in_floor_outbound");
    expect(unit?.current_position_id).toBe(floorId);

    const { count: prepMoves } = await admin
      .from("movements")
      .select("id", { count: "exact", head: true })
      .eq("outbound_order_id", orderId)
      .eq("movement_type", "outbound_preparation")
      .eq("logistic_unit_id", fixture.unitId);

    expect(prepMoves).toBe(1);
  });

  it("prepare_outbound_order mueve UL de piso guardado a FLOOR-OUTBOUND-01", async () => {
    await ensureFloorStoragePosition(admin, "FLOOR-STORAGE-01");
    const fixture = await createLocatedUnit(admin, {
      quantity: 4,
      rackCode: "FLOOR-STORAGE-01",
    });
    cleanupUnits.push(fixture.unitId);
    const orderId = await createOutboundOrder(admin, staffUserId);
    cleanupOrders.push(orderId);
    const floorId = await getPositionId(admin, "FLOOR-OUTBOUND-01");

    await addUnitToOutboundOrder(admin, orderId, fixture.unitId, "pending");

    const { error: prepErr } = await auth.rpc("prepare_outbound_order", {
      p_order_id: orderId,
      p_user_id: staffUserId,
    });
    expect(prepErr).toBeNull();

    const { data: unit } = await admin
      .from("logistic_units")
      .select("status, current_position_id")
      .eq("id", fixture.unitId)
      .single();
    expect(unit?.status).toBe("in_floor_outbound");
    expect(unit?.current_position_id).toBe(floorId);

    const { error: loadErr } = await auth.rpc("confirm_outbound_load", {
      p_order_id: orderId,
      p_user_id: staffUserId,
    });
    expect(loadErr).toBeNull();

    const { data: unitAfterLoad } = await admin
      .from("logistic_units")
      .select("status, is_available, current_position_id")
      .eq("id", fixture.unitId)
      .single();
    expect(unitAfterLoad?.status).toBe("exited");
    expect(unitAfterLoad?.is_available).toBe(false);
    expect(unitAfterLoad?.current_position_id).toBeNull();
  });

  it("prepare_outbound_order no mueve de nuevo una línea ya prepared", async () => {
    const fixture = await createLocatedUnit(admin, { quantity: 2 });
    cleanupUnits.push(fixture.unitId);
    const orderId = await createOutboundOrder(admin, staffUserId);
    cleanupOrders.push(orderId);
    const floorId = await getPositionId(admin, "FLOOR-OUTBOUND-01");

    await admin
      .from("logistic_units")
      .update({
        status: "in_floor_outbound",
        current_position_id: floorId,
      })
      .eq("id", fixture.unitId);

    await addUnitToOutboundOrder(admin, orderId, fixture.unitId, "prepared");

    const { error } = await auth.rpc("prepare_outbound_order", {
      p_order_id: orderId,
      p_user_id: staffUserId,
    });
    expect(error).toBeNull();

    const { count: prepMoves } = await admin
      .from("movements")
      .select("id", { count: "exact", head: true })
      .eq("outbound_order_id", orderId)
      .eq("movement_type", "outbound_preparation");

    expect(prepMoves).toBe(0);
  });

  it("UL fraccionada con destino outbound puede agregarse a retiro como prepared", async () => {
    const fixture = await createLocatedUnit(admin, { quantity: 5 });
    cleanupUnits.push(fixture.unitId);

    const { data: splitData, error: splitErr } = await auth.rpc(
      "split_logistic_unit",
      {
        p_parent_unit_id: fixture.unitId,
        p_user_id: staffUserId,
        p_destination: "outbound",
        p_lines: [{ content_id: fixture.contentId, quantity: 2 }],
      }
    );
    expect(splitErr).toBeNull();
    const childId = (splitData as { child_id: string }).child_id;
    cleanupUnits.push(childId);

    const orderId = await createOutboundOrder(admin, staffUserId);
    cleanupOrders.push(orderId);

    await addUnitToOutboundOrder(admin, orderId, childId, "prepared");

    const { data: line } = await admin
      .from("outbound_order_logistic_units")
      .select("line_status")
      .eq("outbound_order_id", orderId)
      .eq("logistic_unit_id", childId)
      .single();

    expect(line?.line_status).toBe("prepared");
  });

  it("cancelar orden solo funciona si no hay líneas prepared/loaded", async () => {
    const pendingFixture = await createLocatedUnit(admin, { quantity: 1 });
    cleanupUnits.push(pendingFixture.unitId);
    const pendingOrder = await createOutboundOrder(admin, staffUserId);
    cleanupOrders.push(pendingOrder);
    await addUnitToOutboundOrder(
      admin,
      pendingOrder,
      pendingFixture.unitId,
      "pending"
    );

    expect(await canCancelOutboundOrder(admin, pendingOrder)).toBe(true);

    const preparedOrder = await createOutboundOrder(admin, staffUserId);
    cleanupOrders.push(preparedOrder);
    const preparedFixture = await createLocatedUnit(admin, { quantity: 1 });
    cleanupUnits.push(preparedFixture.unitId);
    await addUnitToOutboundOrder(
      admin,
      preparedOrder,
      preparedFixture.unitId,
      "pending"
    );
    await auth.rpc("prepare_outbound_order", {
      p_order_id: preparedOrder,
      p_user_id: staffUserId,
    });

    expect(await canCancelOutboundOrder(admin, preparedOrder)).toBe(false);
  });
});
