import type { PortalAccessStatus } from "@/lib/types/database";

export const PORTAL_ACCESS_STATUS_LABELS: Record<PortalAccessStatus, string> = {
  invited: "Invitado",
  active: "Activo",
  disabled: "Deshabilitado",
};

export const PORTAL_DISABLED_LOGIN_MESSAGE =
  "Tu acceso al portal fue deshabilitado. Contactá a la administración del depósito.";
