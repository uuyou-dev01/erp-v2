import { describe, expect, it } from "vitest";
import { hasRoleAtLeast, ROLES } from "@/lib/auth/permissions";

describe("role permissions", () => {
  it("allows managers and admins to manage team operations", () => {
    expect(hasRoleAtLeast(ROLES.MANAGER, ROLES.MANAGER)).toBe(true);
    expect(hasRoleAtLeast(ROLES.ADMIN, ROLES.MANAGER)).toBe(true);
    expect(hasRoleAtLeast(ROLES.OWNER, ROLES.MANAGER)).toBe(true);
  });

  it("does not allow fulfillment or listing operators to manage team operations", () => {
    expect(hasRoleAtLeast(ROLES.FULFILLMENT, ROLES.MANAGER)).toBe(false);
    expect(hasRoleAtLeast(ROLES.LISTING, ROLES.MANAGER)).toBe(false);
    expect(hasRoleAtLeast(ROLES.VIEWER, ROLES.MANAGER)).toBe(false);
  });
});
