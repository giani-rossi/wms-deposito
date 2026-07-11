import { describe, expect, it } from "vitest";
import {
  CLIENT_PORTAL_MOVEMENT_LABELS,
  mapMovementTypeToClientLabel,
} from "@/lib/portal/movement-labels";
import type { MovementType } from "@/lib/types/database";

describe("mapMovementTypeToClientLabel", () => {
  it("mapea ingresos", () => {
    expect(mapMovementTypeToClientLabel("inbound_created")).toBe("Ingreso");
    expect(mapMovementTypeToClientLabel("location_assignment")).toBe(
      "Ingreso ubicado"
    );
  });

  it("mapea egreso", () => {
    expect(mapMovementTypeToClientLabel("outbound_loaded")).toBe("Egreso");
  });

  it("cubre todos los movement_type", () => {
    const types = Object.keys(CLIENT_PORTAL_MOVEMENT_LABELS) as MovementType[];
    expect(types.length).toBeGreaterThan(0);
    for (const type of types) {
      expect(mapMovementTypeToClientLabel(type)).toBeTruthy();
    }
  });
});
