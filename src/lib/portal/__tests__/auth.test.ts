import { describe, expect, it } from "vitest";
import { homePathForRole, isClientViewer } from "@/lib/portal/roles";

describe("portal route guards", () => {
  it("identifica client_viewer", () => {
    expect(isClientViewer("client_viewer")).toBe(true);
    expect(isClientViewer("admin")).toBe(false);
    expect(isClientViewer("operator")).toBe(false);
  });

  it("redirige home por rol", () => {
    expect(homePathForRole("client_viewer")).toBe("/cliente/stock");
    expect(homePathForRole("admin")).toBe("/dashboard");
    expect(homePathForRole("supervisor")).toBe("/dashboard");
    expect(homePathForRole("operator")).toBe("/dashboard");
  });
});
