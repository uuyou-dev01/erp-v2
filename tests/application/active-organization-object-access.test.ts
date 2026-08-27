import { describe, expect, it } from "vitest";
import { canAccessScopedObjectInActiveOrganization } from "@/lib/auth/permissions";

describe("active organization object access", () => {
  it("allows a scoped object in the active organization", () => {
    expect(
      canAccessScopedObjectInActiveOrganization({
        activeOrganizationId: "org-a",
        membershipOrganizationIds: ["org-a", "org-b"],
        objectOrganizationId: "org-a",
        hasScopedAccess: true,
      })
    ).toBe(true);
  });

  it("blocks a direct link into another organization the same account belongs to", () => {
    expect(
      canAccessScopedObjectInActiveOrganization({
        activeOrganizationId: "org-b",
        membershipOrganizationIds: ["org-a", "org-b"],
        objectOrganizationId: "org-a",
        hasScopedAccess: true,
      })
    ).toBe(false);
  });

  it("preserves explicit cross-organization grants for an external collaborator", () => {
    expect(
      canAccessScopedObjectInActiveOrganization({
        activeOrganizationId: "warehouse-org",
        membershipOrganizationIds: ["warehouse-org"],
        objectOrganizationId: "client-org",
        hasScopedAccess: true,
      })
    ).toBe(true);
  });

  it("never grants access without an object-level scope", () => {
    expect(
      canAccessScopedObjectInActiveOrganization({
        activeOrganizationId: "warehouse-org",
        membershipOrganizationIds: ["warehouse-org"],
        objectOrganizationId: "client-org",
        hasScopedAccess: false,
      })
    ).toBe(false);
  });
});
