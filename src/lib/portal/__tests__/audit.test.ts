import { describe, expect, it } from "vitest";
import { buildPortalAuditInsert } from "@/lib/portal/audit";

describe("buildPortalAuditInsert", () => {
  it("arma payload de export stock", () => {
    expect(
      buildPortalAuditInsert({
        userId: "user-1",
        clientId: "client-1",
        eventType: "stock_export",
        resource: "client_portal_stock",
        metadata: { format: "csv", row_count: 3 },
      })
    ).toEqual({
      user_id: "user-1",
      client_id: "client-1",
      event_type: "stock_export",
      resource: "client_portal_stock",
      metadata: { format: "csv", row_count: 3 },
    });
  });

  it("arma payload de export movimientos", () => {
    expect(
      buildPortalAuditInsert({
        userId: "user-1",
        clientId: "client-1",
        eventType: "movements_export",
        resource: "client_portal_movements",
        metadata: { format: "csv", row_count: 10 },
      })
    ).toEqual({
      user_id: "user-1",
      client_id: "client-1",
      event_type: "movements_export",
      resource: "client_portal_movements",
      metadata: { format: "csv", row_count: 10 },
    });
  });

  it("no incluye columnas de ubicación en metadata", () => {
    const row = buildPortalAuditInsert({
      userId: "u",
      clientId: "c",
      eventType: "stock_export",
      resource: "client_portal_stock",
      metadata: { format: "csv", row_count: 1 },
    });
    expect(JSON.stringify(row)).not.toContain("position");
  });
});
