import { describe, expect, it } from "vitest";
import { splitLogisticUnitSchema } from "@/lib/validation/logistic-unit-split";

const UNIT_ID = "30000001-0000-0000-0000-000000000001";
const CONTENT_ID = "80000001-0000-0000-0000-000000000001";
const RACK_ID = "90000001-0000-0000-0000-000000000001";

const baseInput = {
  logistic_unit_id: UNIT_ID,
  lines: [{ content_id: CONTENT_ID, quantity: 2 }],
};

describe("splitLogisticUnitSchema", () => {
  it("rechaza cantidad 0", () => {
    const result = splitLogisticUnitSchema.safeParse({
      ...baseInput,
      destination: "relocate",
      lines: [{ content_id: CONTENT_ID, quantity: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza cantidad negativa", () => {
    const result = splitLogisticUnitSchema.safeParse({
      ...baseInput,
      destination: "relocate",
      lines: [{ content_id: CONTENT_ID, quantity: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it("acepta cantidad positiva con destination relocate", () => {
    const result = splitLogisticUnitSchema.safeParse({
      ...baseInput,
      destination: "relocate",
    });
    expect(result.success).toBe(true);
  });

  it("acepta destination outbound", () => {
    const result = splitLogisticUnitSchema.safeParse({
      ...baseInput,
      destination: "outbound",
    });
    expect(result.success).toBe(true);
  });

  it("acepta destination rack con target_position_id", () => {
    const result = splitLogisticUnitSchema.safeParse({
      ...baseInput,
      destination: "rack",
      target_position_id: RACK_ID,
    });
    expect(result.success).toBe(true);
  });

  it("rechaza rack sin target_position_id", () => {
    const result = splitLogisticUnitSchema.safeParse({
      ...baseInput,
      destination: "rack",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("target_position_id"))).toBe(
        true
      );
    }
  });
});
