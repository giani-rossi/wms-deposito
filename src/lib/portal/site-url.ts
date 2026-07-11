import "server-only";

import { buildAuthCallbackUrl } from "@/lib/portal/access-auth";

export function getSiteUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    "http://localhost:3000";
  return base.replace(/\/$/, "");
}

/** Redirect de Supabase Auth → callback → next (ej. /auth/set-password). */
export function getAuthCallbackUrl(next: string): string {
  return buildAuthCallbackUrl(getSiteUrl(), next);
}

/** @deprecated Usar getAuthCallbackUrl('/auth/set-password') */
export function getPortalInviteRedirectUrl(): string {
  return getAuthCallbackUrl("/auth/set-password");
}
