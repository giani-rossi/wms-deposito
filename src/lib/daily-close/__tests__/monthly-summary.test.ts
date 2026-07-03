import { describe, expect, it } from "vitest";
import {
  countMissingCloseDays,
  getMonthBounds,
  yesterdayInArgentina,
} from "@/lib/daily-close/monthly-summary";
import type { DailyPositionOccupancyRow } from "@/lib/types/database";

let rowCounter = 0;
function row(date: string, clientId: string, positionId: string): DailyPositionOccupancyRow {
  rowCounter += 1;
  return {
    id: `00000000-0000-0000-0000-${String(rowCounter).padStart(12, "0")}`,
    date,
    client_id: clientId,
    position_id: positionId,
    position_code: "R1-A-1",
    occupied_units_count: 1,
    position_status: "occupied",
    created_at: new Date().toISOString(),
  };
}

describe("countMissingCloseDays", () => {
  it("cuenta días transcurridos sin snapshot", () => {
    const month = "2026-06-01".slice(0, 7);
    const bounds = getMonthBounds(month);
    const rows = [row("2026-06-01", "c1", "p1"), row("2026-06-03", "c1", "p2")];

    const missing = countMissingCloseDays(rows, {
      ...bounds,
      elapsedDays: 5,
    });

    expect(missing).toBe(3);
  });

  it("devuelve 0 si no hay días transcurridos", () => {
    const bounds = getMonthBounds("2099-01");
    expect(countMissingCloseDays([], bounds)).toBe(0);
  });
});

describe("yesterdayInArgentina", () => {
  it("devuelve formato YYYY-MM-DD", () => {
    expect(yesterdayInArgentina()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
