import { describe, expect, it } from "vitest";
import {
  FINAL_STORAGE_POSITION_TYPES,
  floorZonePrimaryLabel,
  isFinalStoragePosition,
  isFloorStorageCode,
  isMapFloorStoragePosition,
  isMapOperationalTransitFloorPosition,
  mapFloorZoneDisplay,
  positionPrimaryLabel,
  positionSelectLabel,
} from "@/lib/constants";

describe("floor storage positions", () => {
  it("trata floor_temporary como almacenamiento final", () => {
    expect(isFinalStoragePosition("rack")).toBe(true);
    expect(isFinalStoragePosition("floor_temporary")).toBe(true);
    expect(isFinalStoragePosition("floor_inbound")).toBe(false);
    expect(FINAL_STORAGE_POSITION_TYPES).toContain("floor_temporary");
  });

  it("reconoce códigos FLOOR-STORAGE-XX", () => {
    expect(isFloorStorageCode("FLOOR-STORAGE-01")).toBe(true);
    expect(isFloorStorageCode("FLOOR-INBOUND-01")).toBe(false);
  });

  it("usa label amigable sin código interno", () => {
    expect(positionPrimaryLabel("FLOOR-STORAGE-03")).toBe("Piso guardado");
    expect(positionSelectLabel("FLOOR-STORAGE-03")).toBe("Piso guardado (03)");
    expect(floorZonePrimaryLabel("floor_temporary", "FLOOR-STORAGE-03")).toBe(
      "Piso guardado"
    );
  });

  it("diferencia piso guardado de zonas de tránsito", () => {
    expect(floorZonePrimaryLabel("floor_inbound", "FLOOR-INBOUND-02")).toBe(
      "Piso ingreso"
    );
    expect(floorZonePrimaryLabel("floor_outbound", "FLOOR-OUTBOUND-01")).toBe(
      "Piso retiro"
    );
    expect(floorZonePrimaryLabel("floor_incident", "FLOOR-INCIDENT-01")).toBe(
      "Revisión"
    );
  });

  it("incluye piso guardado en zonas del mapa de forma dinámica", () => {
    expect(
      isMapFloorStoragePosition({
        type: "floor_temporary",
        code: "FLOOR-STORAGE-07",
      })
    ).toBe(true);
    expect(
      isMapOperationalTransitFloorPosition({
        type: "floor_inbound",
        code: "FLOOR-INBOUND-02",
      })
    ).toBe(true);
    expect(
      isMapOperationalTransitFloorPosition({
        type: "floor_temporary",
        code: "FLOOR-STORAGE-01",
      })
    ).toBe(false);
    expect(
      isMapFloorStoragePosition({
        type: "floor_inbound",
        code: "FLOOR-STORAGE-01",
      })
    ).toBe(true);
    expect(mapFloorZoneDisplay("floor_temporary", "FLOOR-STORAGE-04")).toEqual({
      primary: "Piso guardado",
      secondary: "04",
    });
  });
});
