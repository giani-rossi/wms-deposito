import { describe, expect, it } from "vitest";
import {
  aggregateOccupancySnapshot,
  countMixedPositions,
  distinctOccupiedPositions,
} from "@/lib/daily-close/aggregate-snapshot";

const CLIENT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CLIENT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const RACK_1 = "11111111-1111-1111-1111-111111111111";
const RACK_2 = "22222222-2222-2222-2222-222222222222";
const FLOOR_STORAGE_1 = "33333333-3333-3333-3333-333333333333";

const racks = [
  { id: RACK_1, code: "R1-A-1", status: "occupied" as const },
  { id: RACK_2, code: "R1-B-1", status: "partially_occupied" as const },
];

const finalStoragePositions = [
  ...racks,
  {
    id: FLOOR_STORAGE_1,
    code: "FLOOR-STORAGE-01",
    status: "occupied" as const,
  },
];

describe("aggregateOccupancySnapshot", () => {
  it("agrupa varias UL del mismo cliente en la misma posición", () => {
    const rows = aggregateOccupancySnapshot(racks, [
      { client_id: CLIENT_A, current_position_id: RACK_1 },
      { client_id: CLIENT_A, current_position_id: RACK_1 },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].occupied_units_count).toBe(2);
  });

  it("ignora unidades fuera de posiciones de almacenamiento final", () => {
    const rows = aggregateOccupancySnapshot(racks, [
      {
        client_id: CLIENT_A,
        current_position_id: "99999999-9999-9999-9999-999999999999",
      },
    ]);

    expect(rows).toHaveLength(0);
  });

  it("genera una fila por cliente y posición", () => {
    const rows = aggregateOccupancySnapshot(racks, [
      { client_id: CLIENT_A, current_position_id: RACK_1 },
      { client_id: CLIENT_B, current_position_id: RACK_2 },
    ]);

    expect(rows).toHaveLength(2);
    expect(distinctOccupiedPositions(rows)).toBe(2);
  });

  it("incluye posiciones floor_temporary ocupadas (piso guardado)", () => {
    const rows = aggregateOccupancySnapshot(finalStoragePositions, [
      { client_id: CLIENT_A, current_position_id: FLOOR_STORAGE_1 },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].position_code).toBe("FLOOR-STORAGE-01");
    expect(rows[0].occupied_units_count).toBe(1);
    expect(distinctOccupiedPositions(rows)).toBe(1);
  });
});

describe("countMixedPositions", () => {
  it("detecta posiciones con más de un cliente", () => {
    const rows = aggregateOccupancySnapshot(racks, [
      { client_id: CLIENT_A, current_position_id: RACK_1 },
      { client_id: CLIENT_B, current_position_id: RACK_1 },
    ]);

    expect(countMixedPositions(rows)).toBe(1);
  });
});
