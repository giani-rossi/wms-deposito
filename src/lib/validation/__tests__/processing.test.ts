import { describe, expect, it } from "vitest";
import { processReceivedUnitSchema } from "@/lib/validation/processing";
import {
  balancesMatch,
  buildProductBalance,
  totalQuantity,
} from "@/lib/processing/balance";

const RECEIVED_UNIT_ID = "20000001-0000-0000-0000-000000000001";
const PRODUCT_A = "40000001-0000-0000-0000-000000000001";
const PRODUCT_B = "40000002-0000-0000-0000-000000000002";

const validClassificationInput = {
  received_unit_id: RECEIVED_UNIT_ID,
  operation_type: "classification" as const,
  result_units: [
    {
      type: "box" as const,
      contents: [{ product_id: PRODUCT_A, quantity: 5 }],
    },
    {
      type: "box" as const,
      contents: [{ product_id: PRODUCT_B, quantity: 3 }],
    },
  ],
};

describe("processReceivedUnitSchema", () => {
  it("acepta balance correcto con múltiples unidades resultantes", () => {
    const result = processReceivedUnitSchema.safeParse(validClassificationInput);
    expect(result.success).toBe(true);
  });

  it("rechaza procesar sin contenido en unidad resultante", () => {
    const result = processReceivedUnitSchema.safeParse({
      ...validClassificationInput,
      result_units: [{ type: "box", contents: [] }],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza desconsolidación con una sola unidad resultante", () => {
    const result = processReceivedUnitSchema.safeParse({
      received_unit_id: RECEIVED_UNIT_ID,
      operation_type: "desconsolidation",
      result_units: [
        {
          type: "box",
          contents: [{ product_id: PRODUCT_A, quantity: 5 }],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza received_unit_id inválido", () => {
    const result = processReceivedUnitSchema.safeParse({
      ...validClassificationInput,
      received_unit_id: "invalid",
    });
    expect(result.success).toBe(false);
  });
});

describe("processing balance helpers", () => {
  it("detecta balance incorrecto entre origen y resultado", () => {
    const origin = buildProductBalance([
      { product_id: PRODUCT_A, quantity: 8 },
      { product_id: PRODUCT_B, quantity: 4 },
    ]);
    const result = buildProductBalance([
      { product_id: PRODUCT_A, quantity: 8 },
      { product_id: PRODUCT_B, quantity: 3 },
    ]);

    expect(balancesMatch(origin, result)).toBe(false);
  });

  it("acepta balance correcto por producto", () => {
    const origin = buildProductBalance([
      { product_id: PRODUCT_A, quantity: 5 },
      { product_id: PRODUCT_B, quantity: 3 },
    ]);
    const result = buildProductBalance([
      { product_id: PRODUCT_A, quantity: 2 },
      { product_id: PRODUCT_B, quantity: 1 },
      { product_id: PRODUCT_A, quantity: 3 },
      { product_id: PRODUCT_B, quantity: 2 },
    ]);

    expect(balancesMatch(origin, result)).toBe(true);
    expect(totalQuantity([{ quantity: 2 }, { quantity: 3 }])).toBe(5);
  });
});
