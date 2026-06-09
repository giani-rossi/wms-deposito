import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

/** Formatea una fecha ISO a "dd MMM yyyy" en español. */
export function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "dd MMM yyyy", { locale: es });
  } catch {
    return "—";
  }
}

/** Formatea una fecha ISO con hora a "dd MMM yyyy HH:mm". */
export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "dd MMM yyyy HH:mm", { locale: es });
  } catch {
    return "—";
  }
}

/** Devuelve un valor o un guion si está vacío. */
export function orDash(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}
