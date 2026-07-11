import { describe, expect, it } from "vitest";
import { formatCuitDisplay, normalizeCuit } from "@/lib/portal/cuit";

describe("normalizeCuit", () => {
  it("deja solo dígitos", () => {
    expect(normalizeCuit("20-12345678-9")).toBe("20123456789");
    expect(normalizeCuit(" 30 708 765 43 ")).toBe("3070876543");
  });

  it("retorna null para vacío o sin dígitos", () => {
    expect(normalizeCuit("")).toBeNull();
    expect(normalizeCuit("---")).toBeNull();
    expect(normalizeCuit(null)).toBeNull();
  });
});

describe("formatCuitDisplay", () => {
  it("formatea 11 dígitos", () => {
    expect(formatCuitDisplay("20123456789")).toBe("20-12345678-9");
  });

  it("devuelve em dash sin valor", () => {
    expect(formatCuitDisplay(null)).toBe("—");
  });
});
