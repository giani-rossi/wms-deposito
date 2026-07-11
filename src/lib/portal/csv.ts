/** Columnas que nunca deben aparecer en exports del portal. */
export const PORTAL_CSV_FORBIDDEN_COLUMNS = [
  "position_id",
  "position_code",
  "current_position_id",
  "from_position_id",
  "to_position_id",
  "notes",
] as const;

export function escapeCsvCell(value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildCsvContent(headers: string[], rows: unknown[][]): string {
  for (const header of headers) {
    if (
      PORTAL_CSV_FORBIDDEN_COLUMNS.includes(
        header as (typeof PORTAL_CSV_FORBIDDEN_COLUMNS)[number]
      )
    ) {
      throw new Error(`Columna prohibida en export portal: ${header}`);
    }
  }

  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ];
  return `\uFEFF${lines.join("\n")}`;
}

export function csvDownloadResponse(
  filename: string,
  headers: string[],
  rows: unknown[][]
): Response {
  const body = buildCsvContent(headers, rows);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
