import { describe, expect, it, beforeAll, afterEach } from "vitest";
import { integrationEnabled } from "./env";
import {
  createServiceClient,
  ensureStaffAuthClient,
  type AuthClient,
  type ServiceClient,
} from "./helpers/supabase-client";
import {
  createLocatedUnit,
  deleteLogisticUnit,
  sumUnitQuantity,
} from "./helpers/fixtures";

describe.skipIf(!integrationEnabled)("split_logistic_unit RPC", () => {
  let admin: ServiceClient;
  let auth: AuthClient;
  let staffUserId: string;
  const cleanupUnitIds: string[] = [];

  beforeAll(async () => {
    admin = createServiceClient();
    const staff = await ensureStaffAuthClient();
    auth = staff.client;
    staffUserId = staff.userId;
  });

  afterEach(async () => {
    while (cleanupUnitIds.length) {
      const id = cleanupUnitIds.pop();
      if (id) await deleteLogisticUnit(admin, id);
    }
  });

  it("conserva cantidad total en fraccionamiento parcial", async () => {
    const fixture = await createLocatedUnit(admin, { quantity: 10 });
    cleanupUnitIds.push(fixture.unitId);

    const { data, error } = await auth.rpc("split_logistic_unit", {
      p_parent_unit_id: fixture.unitId,
      p_user_id: staffUserId,
      p_destination: "outbound",
      p_lines: [{ content_id: fixture.contentId, quantity: 4 }],
    });

    expect(error).toBeNull();
    expect(data).toBeTruthy();
    const childId = (data as { child_id: string }).child_id;
    cleanupUnitIds.push(childId);

    const parentQty = await sumUnitQuantity(admin, fixture.unitId);
    const childQty = await sumUnitQuantity(admin, childId);
    expect(parentQty + childQty).toBe(10);
  });

  it("rechaza cantidad mayor a la disponible", async () => {
    const fixture = await createLocatedUnit(admin, { quantity: 5 });
    cleanupUnitIds.push(fixture.unitId);

    const { error } = await auth.rpc("split_logistic_unit", {
      p_parent_unit_id: fixture.unitId,
      p_user_id: staffUserId,
      p_destination: "relocate",
      p_lines: [{ content_id: fixture.contentId, quantity: 99 }],
    });

    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/supera|disponible/i);
  });

  it("deja UL origen exited e is_available=false al fraccionar todo", async () => {
    const fixture = await createLocatedUnit(admin, { quantity: 6 });
    cleanupUnitIds.push(fixture.unitId);

    const { data, error } = await auth.rpc("split_logistic_unit", {
      p_parent_unit_id: fixture.unitId,
      p_user_id: staffUserId,
      p_destination: "relocate",
      p_lines: [{ content_id: fixture.contentId, quantity: 6 }],
    });

    expect(error).toBeNull();
    const childId = (data as { child_id: string; parent_exited: boolean })
      .child_id;
    cleanupUnitIds.push(childId);
    expect((data as { parent_exited: boolean }).parent_exited).toBe(true);

    const { data: parent } = await admin
      .from("logistic_units")
      .select("status, is_available")
      .eq("id", fixture.unitId)
      .single();

    expect(parent?.status).toBe("exited");
    expect(parent?.is_available).toBe(false);
  });
});
