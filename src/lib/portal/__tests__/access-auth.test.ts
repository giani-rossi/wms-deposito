import { describe, expect, it } from "vitest";
import {
  buildAuthCallbackUrl,
  canSendPortalAccessLink,
  isAuthUserAlreadyRegisteredError,
  postSetPasswordRedirectPath,
  resolvePortalAccessDelivery,
  shouldRedirectToSetPasswordAfterAuthCallback,
} from "@/lib/portal/access-auth";

describe("resolvePortalAccessDelivery", () => {
  it("usa invite para email nuevo sin perfil ni auth", () => {
    expect(
      resolvePortalAccessDelivery({
        hasExistingPortalProfile: false,
        hasKnownAuthUserId: false,
      })
    ).toBe("invite");
  });

  it("usa recovery si ya hay perfil portal", () => {
    expect(
      resolvePortalAccessDelivery({
        hasExistingPortalProfile: true,
        hasKnownAuthUserId: false,
      })
    ).toBe("recovery");
  });

  it("usa recovery si ya existe usuario en Auth", () => {
    expect(
      resolvePortalAccessDelivery({
        hasExistingPortalProfile: false,
        hasKnownAuthUserId: true,
      })
    ).toBe("recovery");
  });
});

describe("isAuthUserAlreadyRegisteredError", () => {
  it("detecta email ya registrado", () => {
    expect(
      isAuthUserAlreadyRegisteredError(
        new Error("A user with this email address has already been registered")
      )
    ).toBe(true);
    expect(isAuthUserAlreadyRegisteredError(new Error("other"))).toBe(false);
  });
});

describe("auth callback redirect", () => {
  it("default a set-password", () => {
    expect(shouldRedirectToSetPasswordAfterAuthCallback(null)).toBe(
      "/auth/set-password"
    );
  });

  it("respeta next válido", () => {
    expect(shouldRedirectToSetPasswordAfterAuthCallback("/auth/set-password")).toBe(
      "/auth/set-password"
    );
  });

  it("no redirige a login directo desde callback config", () => {
    const url = buildAuthCallbackUrl(
      "https://wms-deposito.vercel.app",
      "/auth/set-password"
    );
    expect(url).toContain("/auth/callback");
    expect(url).toContain("next=%2Fauth%2Fset-password");
    expect(url).not.toContain("/login");
  });
});

describe("postSetPasswordRedirectPath", () => {
  it("client_viewer va al portal", () => {
    expect(postSetPasswordRedirectPath("client_viewer")).toBe("/cliente/stock");
  });

  it("staff va al dashboard", () => {
    expect(postSetPasswordRedirectPath("admin")).toBe("/dashboard");
  });
});

describe("canSendPortalAccessLink", () => {
  it("bloquea disabled", () => {
    expect(canSendPortalAccessLink("disabled")).toBe(false);
    expect(canSendPortalAccessLink("invited")).toBe(true);
    expect(canSendPortalAccessLink("active")).toBe(true);
  });
});
