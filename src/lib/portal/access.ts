import type { PortalAccessStatus, UserRole } from "@/lib/types/database";

const STAFF_ROLES: UserRole[] = ["admin", "supervisor", "operator"];

export function canManagePortalAccess(role: UserRole): boolean {
  return role === "admin" || role === "supervisor";
}

export function isStaffPortalRole(role: UserRole): boolean {
  return STAFF_ROLES.includes(role);
}

export function normalizePortalEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isPortalAccessAllowed(
  status: PortalAccessStatus | null | undefined
): boolean {
  return status === "invited" || status === "active";
}

export function isPortalAccessDisabled(
  status: PortalAccessStatus | null | undefined
): boolean {
  return status === "disabled";
}

export type PortalEmailConflict =
  | { ok: true }
  | { ok: false; reason: "staff_user" | "other_client" };

export function validatePortalInviteEmail(params: {
  email: string;
  clientId: string;
  existingRole: UserRole | null;
  existingClientId: string | null;
}): PortalEmailConflict {
  if (!params.existingRole) {
    return { ok: true };
  }

  if (params.existingRole !== "client_viewer") {
    return { ok: false, reason: "staff_user" };
  }

  if (params.existingClientId && params.existingClientId !== params.clientId) {
    return { ok: false, reason: "other_client" };
  }

  return { ok: true };
}

export function clientHasInvitableCuit(taxId: string | null | undefined): boolean {
  if (!taxId) return false;
  return /^[0-9]+$/.test(taxId.trim());
}

export function portalAccessStatusAfterLogin(
  current: PortalAccessStatus | null | undefined
): PortalAccessStatus {
  if (current === "invited") return "active";
  return current ?? "active";
}
