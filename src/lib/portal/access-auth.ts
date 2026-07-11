import type { PortalAccessStatus } from "@/lib/types/database";

export type PortalAccessDelivery = "invite" | "recovery";

export function resolvePortalAccessDelivery(params: {
  hasExistingPortalProfile: boolean;
  hasKnownAuthUserId: boolean;
}): PortalAccessDelivery {
  if (params.hasExistingPortalProfile || params.hasKnownAuthUserId) {
    return "recovery";
  }
  return "invite";
}

export function isAuthUserAlreadyRegisteredError(
  error: unknown
): boolean {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();
  return (
    message.includes("already been registered") ||
    message.includes("already registered") ||
    message.includes("user already registered") ||
    message.includes("email address has already been registered")
  );
}

export function canSendPortalAccessLink(
  portalAccessStatus: PortalAccessStatus | null | undefined
): boolean {
  return portalAccessStatus !== "disabled";
}

export function shouldRedirectToSetPasswordAfterAuthCallback(
  nextParam: string | null
): string {
  if (nextParam && nextParam.startsWith("/")) {
    return nextParam;
  }
  return "/auth/set-password";
}

export function buildAuthCallbackUrl(siteUrl: string, next: string): string {
  const base = siteUrl.replace(/\/$/, "");
  const nextPath = next.startsWith("/") ? next : `/${next}`;
  return `${base}/auth/callback?next=${encodeURIComponent(nextPath)}`;
}

export function postSetPasswordRedirectPath(role: string): string {
  return role === "client_viewer" ? "/cliente/stock" : "/dashboard";
}
