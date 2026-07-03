import { describe, expect, it } from "vitest";
import {
  createOutboundOrderSchema,
  outboundOrderIdSchema,
  outboundOrderUnitSchema,
  removeOutboundLineSchema,
} from "@/lib/validation/outbound";

const CLIENT_ID = "c0000001-0000-0000-0000-000000000001";
const ORDER_ID = "50000001-0000-0000-0000-000000000001";
const UNIT_ID = "30000001-0000-0000-0000-000000000001";
const LINE_ID = "60000001-0000-0000-0000-000000000001";

describe("outbound validation schemas", () => {
  describe("createOutboundOrderSchema", () => {
    it("acepta create order válido", () => {
      const result = createOutboundOrderSchema.safeParse({
        client_id: CLIENT_ID,
        requested_date: "2026-06-08",
        notes: "Retiro urgente",
      });
      expect(result.success).toBe(true);
    });

    it("rechaza client_id inválido", () => {
      const result = createOutboundOrderSchema.safeParse({
        client_id: "not-a-uuid",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("outboundOrderUnitSchema", () => {
    it("acepta add UL válido", () => {
      const result = outboundOrderUnitSchema.safeParse({
        outbound_order_id: ORDER_ID,
        logistic_unit_id: UNIT_ID,
      });
      expect(result.success).toBe(true);
    });

    it("rechaza uuid inválido", () => {
      const result = outboundOrderUnitSchema.safeParse({
        outbound_order_id: ORDER_ID,
        logistic_unit_id: "bad-id",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("outboundOrderIdSchema", () => {
    it("acepta prepare/confirm válido", () => {
      const result = outboundOrderIdSchema.safeParse({
        outbound_order_id: ORDER_ID,
      });
      expect(result.success).toBe(true);
    });

    it("rechaza orden inválida", () => {
      const result = outboundOrderIdSchema.safeParse({
        outbound_order_id: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("removeOutboundLineSchema", () => {
    it("acepta remove line válido", () => {
      const result = removeOutboundLineSchema.safeParse({
        outbound_order_id: ORDER_ID,
        line_id: LINE_ID,
      });
      expect(result.success).toBe(true);
    });
  });
});
