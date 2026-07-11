import { describe, expect, it } from "vitest";
import {
  canManagePortalAccess,
  clientHasInvitableCuit,
  isPortalAccessAllowed,
  isPortalAccessDisabled,
  isStaffPortalRole,
  normalizePortalEmail,
  portalAccessStatusAfterLogin,
  validatePortalInviteEmail,
} from "@/lib/portal/access";

describe("canManagePortalAccess", () => {
  it("permite admin y supervisor", () => {
    expect(canManagePortalAccess("admin")).toBe(true);
    expect(canManagePortalAccess("supervisor")).toBe(true);
  });

  it("niega operator y client_viewer", () => {
    expect(canManagePortalAccess("operator")).toBe(false);
    expect(canManagePortalAccess("client_viewer")).toBe(false);
  });
});

describe("validatePortalInviteEmail", () => {
  const clientId = "client-a";

  it("permite email nuevo", () => {
    expect(
      validatePortalInviteEmail({
        email: "a@b.com",
        clientId,
        existingRole: null,
        existingClientId: null,
      })
    ).toEqual({ ok: true });
  });

  it("rechaza email staff", () => {
    expect(
      validatePortalInviteEmail({
        email: "a@b.com",
        clientId,
        existingRole: "operator",
        existingClientId: null,
      })
    ).toEqual({ ok: false, reason: "staff_user" });
  });

  it("rechaza client_viewer de otro cliente", () => {
    expect(
      validatePortalInviteEmail({
        email: "a@b.com",
        clientId,
        existingRole: "client_viewer",
        existingClientId: "client-b",
      })
    ).toEqual({ ok: false, reason: "other_client" });
  });

  it("permite reinvitar mismo cliente", () => {
    expect(
      validatePortalInviteEmail({
        email: "a@b.com",
        clientId,
        existingRole: "client_viewer",
        existingClientId: clientId,
      })
    ).toEqual({ ok: true });
  });
});

describe("portal access status", () => {
  it("invited y active pueden acceder", () => {
    expect(isPortalAccessAllowed("invited")).toBe(true);
    expect(isPortalAccessAllowed("active")).toBe(true);
    expect(isPortalAccessAllowed("disabled")).toBe(false);
  });

  it("disabled bloquea", () => {
    expect(isPortalAccessDisabled("disabled")).toBe(true);
    expect(isPortalAccessDisabled("active")).toBe(false);
  });

  it("promueve invited a active en login", () => {
    expect(portalAccessStatusAfterLogin("invited")).toBe("active");
    expect(portalAccessStatusAfterLogin("active")).toBe("active");
  });
});

describe("clientHasInvitableCuit", () => {
  it("requiere tax_id solo dígitos", () => {
    expect(clientHasInvitableCuit("30711222334")).toBe(true);
    expect(clientHasInvitableCuit("30-71122233-4")).toBe(false);
    expect(clientHasInvitableCuit(null)).toBe(false);
  });
});

describe("normalizePortalEmail", () => {
  it("normaliza a minúsculas", () => {
    expect(normalizePortalEmail("  Portal@Cliente.COM ")).toBe("portal@cliente.com");
  });
});

describe("isStaffPortalRole", () => {
  it("identifica roles internos", () => {
    expect(isStaffPortalRole("admin")).toBe(true);
    expect(isStaffPortalRole("client_viewer")).toBe(false);
  });
});
