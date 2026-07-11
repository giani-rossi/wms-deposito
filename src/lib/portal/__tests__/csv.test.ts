import { describe, expect, it } from "vitest";
import {
  buildCsvContent,
  escapeCsvCell,
  PORTAL_CSV_FORBIDDEN_COLUMNS,
} from "@/lib/portal/csv";

describe("escapeCsvCell", () => {
  it("escapa comillas y comas", () => {
    expect(escapeCsvCell('a"b,c')).toBe('"a""b,c"');
  });

  it("maneja null", () => {
    expect(escapeCsvCell(null)).toBe("");
  });
});

describe("buildCsvContent", () => {
  it("incluye BOM UTF-8", () => {
    const csv = buildCsvContent(["col"], [["x"]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("col");
  });

  it("rechaza columnas de ubicación", () => {
    for (const col of PORTAL_CSV_FORBIDDEN_COLUMNS) {
      expect(() => buildCsvContent([col], [])).toThrow(/prohibida/);
    }
  });

  it("no incluye position_code en headers válidos", () => {
    const headers = ["producto", "sku", "cantidad"];
    const csv = buildCsvContent(headers, [["A", "SKU-1", 10]]);
    expect(csv).not.toContain("position_code");
    expect(csv).toContain("producto");
  });
});
