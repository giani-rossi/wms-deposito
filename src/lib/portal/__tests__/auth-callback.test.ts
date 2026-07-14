import { describe, expect, it } from "vitest";
import {
  getAuthCallbackLoginError,
  hasAuthCallbackCredentials,
  isAuthLinkExpiredError,
  isSupabaseAuthErrorExpired,
  parseAuthCallbackUrl,
  resolveAuthCallbackNextPath,
} from "@/lib/portal/auth-callback";

describe("parseAuthCallbackUrl", () => {
  it("lee code en query", () => {
    const params = parseAuthCallbackUrl(
      "https://cli-logistica.lat/auth/callback?code=abc&next=%2Fauth%2Fset-password"
    );
    expect(params.code).toBe("abc");
    expect(params.next).toBe("/auth/set-password");
  });

  it("lee token_hash y type en query", () => {
    const params = parseAuthCallbackUrl(
      "https://cli-logistica.lat/auth/callback?token_hash=hash123&type=invite&next=%2Fauth%2Fset-password"
    );
    expect(params.tokenHash).toBe("hash123");
    expect(params.type).toBe("invite");
  });

  it("lee tokens y errores en hash", () => {
    const params = parseAuthCallbackUrl(
      "https://cli-logistica.lat/auth/callback?next=%2Fauth%2Fset-password#access_token=at&refresh_token=rt"
    );
    expect(params.hashAccessToken).toBe("at");
    expect(params.hashRefreshToken).toBe("rt");
  });

  it("lee otp_expired en hash", () => {
    const params = parseAuthCallbackUrl(
      "https://cli-logistica.lat/auth/callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"
    );
    expect(params.hashError).toBe("access_denied");
    expect(params.hashErrorCode).toBe("otp_expired");
  });
});

describe("auth callback errors", () => {
  it("marca otp_expired como link expirado", () => {
    const params = parseAuthCallbackUrl(
      "https://cli-logistica.lat/auth/callback#error=access_denied&error_code=otp_expired"
    );
    expect(isAuthLinkExpiredError(params)).toBe(true);
    expect(getAuthCallbackLoginError(params)).toBe("auth_link_expired");
  });

  it("no marca callback válido como expirado", () => {
    const params = parseAuthCallbackUrl(
      "https://cli-logistica.lat/auth/callback?token_hash=abc&type=recovery"
    );
    expect(getAuthCallbackLoginError(params)).toBeNull();
  });

  it("detecta credenciales disponibles", () => {
    expect(
      hasAuthCallbackCredentials(
        parseAuthCallbackUrl(
          "https://cli-logistica.lat/auth/callback?code=abc"
        )
      )
    ).toBe(true);
    expect(
      hasAuthCallbackCredentials(
        parseAuthCallbackUrl("https://cli-logistica.lat/auth/callback")
      )
    ).toBe(false);
  });
});

describe("resolveAuthCallbackNextPath", () => {
  it("default a set-password", () => {
    expect(
      resolveAuthCallbackNextPath(
        parseAuthCallbackUrl("https://cli-logistica.lat/auth/callback")
      )
    ).toBe("/auth/set-password");
  });
});

describe("isSupabaseAuthErrorExpired", () => {
  it("detecta errores de link expirado", () => {
    expect(
      isSupabaseAuthErrorExpired(new Error("Email link is invalid or has expired"))
    ).toBe(true);
    expect(isSupabaseAuthErrorExpired(new Error("other"))).toBe(false);
  });
});
