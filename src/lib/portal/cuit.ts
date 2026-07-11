/** Normaliza CUIT/tax_id a solo dígitos. */
export function normalizeCuit(value: string | null | undefined): string | null {
  if (value == null) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length ? digits : null;
}

/** Formato legible opcional para pantalla (XX-XXXXXXXX-X). */
export function formatCuitDisplay(value: string | null | undefined): string {
  const digits = normalizeCuit(value);
  if (!digits) return "—";
  if (digits.length === 11) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
  }
  return digits;
}
