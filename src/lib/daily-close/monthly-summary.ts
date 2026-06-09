import type { DailyPositionOccupancyRow } from "@/lib/types/database";

export type MonthlyClientSummary = {
  clientId: string;
  totalPositionDays: number;
  daysWithOccupancy: number;
  avgPerOccupiedDay: number;
  avgPerCalendarDay: number;
  firstOccupancyDate: string | null;
  lastOccupancyDate: string | null;
};

export type DailyClientDetail = {
  date: string;
  clientId: string;
  positionsUsed: number;
};

export type MonthBounds = {
  month: string;
  start: string;
  end: string;
  calendarDays: number;
  /** Días del mes ya transcurridos (hasta hoy en AR). Mes futuro = 0. */
  elapsedDays: number;
};

/** Fecha actual YYYY-MM-DD en America/Argentina/Buenos_Aires. */
export function todayInArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
}

/** Mes actual YYYY-MM en Argentina. */
export function currentMonthInArgentina(): string {
  return todayInArgentina().slice(0, 7);
}

export function parseMonthParam(value?: string): string {
  if (value && /^\d{4}-\d{2}$/.test(value)) return value;
  return currentMonthInArgentina();
}

export function getMonthBounds(month: string): MonthBounds {
  const year = Number(month.slice(0, 4));
  const monthNum = Number(month.slice(5, 7));
  const calendarDays = new Date(year, monthNum, 0).getDate();
  const start = `${month}-01`;
  const end = `${month}-${String(calendarDays).padStart(2, "0")}`;

  const today = todayInArgentina();
  const todayMonth = today.slice(0, 7);
  let elapsedDays = calendarDays;
  if (month === todayMonth) {
    elapsedDays = Number(today.slice(8, 10));
  } else if (month > todayMonth) {
    elapsedDays = 0;
  }

  return { month, start, end, calendarDays, elapsedDays };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Agrupa filas de snapshot en resumen mensual por cliente. */
export function computeMonthlySummaries(
  rows: DailyPositionOccupancyRow[],
  calendarDays: number
): MonthlyClientSummary[] {
  const byClient = new Map<
    string,
    { total: number; dates: Set<string> }
  >();

  for (const r of rows) {
    const entry = byClient.get(r.client_id) ?? {
      total: 0,
      dates: new Set<string>(),
    };
    entry.total += 1;
    entry.dates.add(r.date);
    byClient.set(r.client_id, entry);
  }

  return [...byClient.entries()]
    .map(([clientId, { total, dates }]) => {
      const daysWithOccupancy = dates.size;
      const sortedDates = [...dates].sort();
      return {
        clientId,
        totalPositionDays: total,
        daysWithOccupancy,
        avgPerOccupiedDay:
          daysWithOccupancy > 0 ? round2(total / daysWithOccupancy) : 0,
        avgPerCalendarDay:
          calendarDays > 0 ? round2(total / calendarDays) : 0,
        firstOccupancyDate: sortedDates[0] ?? null,
        lastOccupancyDate: sortedDates[sortedDates.length - 1] ?? null,
      };
    })
    .sort((a, b) => a.clientId.localeCompare(b.clientId));
}

/** Detalle diario: posiciones usadas por cliente y fecha. */
export function computeDailyClientDetails(
  rows: DailyPositionOccupancyRow[]
): DailyClientDetail[] {
  const byKey = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.date}:${r.client_id}`;
    byKey.set(key, (byKey.get(key) ?? 0) + 1);
  }

  return [...byKey.entries()]
    .map(([key, positionsUsed]) => {
      const [date, clientId] = key.split(":");
      return { date, clientId, positionsUsed };
    })
    .sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp !== 0) return dateCmp;
      return a.clientId.localeCompare(b.clientId);
    });
}

/** Días del mes (hasta hoy si es el mes actual) sin ningún registro de cierre. */
export function countMissingCloseDays(
  rowsInMonth: DailyPositionOccupancyRow[],
  bounds: MonthBounds
): number {
  if (bounds.elapsedDays <= 0) return 0;
  const datesWithData = new Set(rowsInMonth.map((r) => r.date));
  return Math.max(0, bounds.elapsedDays - datesWithData.size);
}
