import { shouldRedirectToSetPasswordAfterAuthCallback } from "@/lib/portal/access-auth";

export type AuthCallbackParams = {
  code: string | null;
  tokenHash: string | null;
  type: string | null;
  next: string | null;
  hashAccessToken: string | null;
  hashRefreshToken: string | null;
  hashError: string | null;
  hashErrorCode: string | null;
  queryError: string | null;
  queryErrorCode: string | null;
};

export type AuthCallbackLoginError = "auth_link_expired" | "auth_callback_error";

const EXPIRED_ERROR_CODES = new Set([
  "otp_expired",
  "flow_state_expired",
  "expired_token",
]);

export function parseAuthCallbackUrl(url: string): AuthCallbackParams {
  const parsed = new URL(url);
  const hashParams = new URLSearchParams(
    parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash
  );

  return {
    code: parsed.searchParams.get("code"),
    tokenHash: parsed.searchParams.get("token_hash"),
    type: parsed.searchParams.get("type"),
    next: parsed.searchParams.get("next"),
    hashAccessToken: hashParams.get("access_token"),
    hashRefreshToken: hashParams.get("refresh_token"),
    hashError: hashParams.get("error"),
    hashErrorCode: hashParams.get("error_code"),
    queryError: parsed.searchParams.get("error"),
    queryErrorCode: parsed.searchParams.get("error_code"),
  };
}

export function isAuthLinkExpiredError(params: AuthCallbackParams): boolean {
  const codes = [params.hashErrorCode, params.queryErrorCode].filter(
    (code): code is string => !!code
  );

  if (codes.some((code) => EXPIRED_ERROR_CODES.has(code))) {
    return true;
  }

  const descriptions = [params.hashError, params.queryError]
    .filter((value): value is string => !!value)
    .map((value) => value.toLowerCase());

  return descriptions.some(
    (value) =>
      value.includes("expired") ||
      value.includes("invalid or has expired") ||
      value === "access_denied"
  );
}

export function getAuthCallbackLoginError(
  params: AuthCallbackParams
): AuthCallbackLoginError | null {
  if (isAuthLinkExpiredError(params)) {
    return "auth_link_expired";
  }

  if (params.hashError || params.queryError) {
    return "auth_callback_error";
  }

  return null;
}

export function resolveAuthCallbackNextPath(params: AuthCallbackParams): string {
  return shouldRedirectToSetPasswordAfterAuthCallback(params.next);
}

export function hasAuthCallbackCredentials(params: AuthCallbackParams): boolean {
  return !!(
    params.code ||
    (params.tokenHash && params.type) ||
    (params.hashAccessToken && params.hashRefreshToken)
  );
}

export function isSupabaseAuthErrorExpired(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();

  return (
    message.includes("otp expired") ||
    message.includes("expired") ||
    message.includes("invalid or has expired") ||
    message.includes("flow state") ||
    message.includes("email link is invalid")
  );
}
