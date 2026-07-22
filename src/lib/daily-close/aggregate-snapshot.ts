import type { PositionStatus } from "@/lib/types/database";

export type OccupancySnapshotRow = {
  client_id: string;
  position_id: string;
  position_code: string;
  position_status: PositionStatus;
  occupied_units_count: number;
};

type RackPosition = {
  id: string;
  code: string;
  status: PositionStatus;
};

type LocatedUnit = {
  client_id: string;
  current_position_id: string | null;
};

/** Agrupa unidades ubicadas en almacenamiento final por cliente + posición. */
export function aggregateOccupancySnapshot(
  storagePositions: RackPosition[],
  units: LocatedUnit[]
): OccupancySnapshotRow[] {
  const posMap = new Map(storagePositions.map((p) => [p.id, p]));
  const aggMap = new Map<string, OccupancySnapshotRow>();

  for (const row of units) {
    if (!row.current_position_id) continue;
    const pos = posMap.get(row.current_position_id);
    if (!pos) continue;

    const key = `${row.client_id}:${pos.id}`;
    const existing = aggMap.get(key);
    if (existing) {
      existing.occupied_units_count += 1;
    } else {
      aggMap.set(key, {
        client_id: row.client_id,
        position_id: pos.id,
        position_code: pos.code,
        position_status: pos.status,
        occupied_units_count: 1,
      });
    }
  }

  return Array.from(aggMap.values());
}

/** Posiciones de almacenamiento final con más de un cliente en el snapshot (mezcla / override). */
export function countMixedPositions(rows: OccupancySnapshotRow[]): number {
  const clientsByPosition = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = clientsByPosition.get(row.position_id) ?? new Set<string>();
    set.add(row.client_id);
    clientsByPosition.set(row.position_id, set);
  }
  return [...clientsByPosition.values()].filter((s) => s.size > 1).length;
}

export function distinctOccupiedPositions(rows: OccupancySnapshotRow[]): number {
  return new Set(rows.map((r) => r.position_id)).size;
}
