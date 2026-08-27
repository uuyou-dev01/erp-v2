export const ROLES = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  PROCUREMENT: "PROCUREMENT",
  WAREHOUSE: "WAREHOUSE",
  LISTING: "LISTING",
  FULFILLMENT: "FULFILLMENT",
  FINANCE: "FINANCE",
  VIEWER: "VIEWER",
} as const;

export type Role = keyof typeof ROLES;

const ROLE_RANK: Record<string, number> = {
  OWNER: 100,
  ADMIN: 90,
  MANAGER: 70,
  FINANCE: 50,
  PROCUREMENT: 40,
  WAREHOUSE: 40,
  LISTING: 40,
  FULFILLMENT: 40,
  VIEWER: 10,
};

export function hasRoleAtLeast(role: string | null | undefined, minimum: string) {
  return (ROLE_RANK[role ?? ""] ?? 0) >= (ROLE_RANK[minimum] ?? 0);
}

export function canViewInventoryCost(role: string | null | undefined) {
  return new Set<string>([ROLES.OWNER, ROLES.ADMIN, ROLES.MANAGER, ROLES.FINANCE]).has(role ?? "");
}

export function canUseQuickEntry(role: string | null | undefined) {
  return new Set<string>([
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.MANAGER,
    ROLES.PROCUREMENT,
    ROLES.LISTING,
  ]).has(role ?? "");
}

export function canShipOrders(role: string | null | undefined) {
  return new Set<string>([
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.MANAGER,
    ROLES.WAREHOUSE,
    ROLES.FULFILLMENT,
  ]).has(role ?? "");
}

export function isNavigationHrefAllowed(role: string | null | undefined, href: string) {
  const path = href.split("?")[0];
  if (
    ["/workbench", "/notifications", "/settings/personal"].some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`)
    )
  ) {
    return true;
  }
  if (hasRoleAtLeast(role, ROLES.MANAGER)) return true;
  const allowedPrefixesByRole: Record<string, string[]> = {
    FULFILLMENT: [
      "/fulfillment/requests",
      "/logistics/consolidations",
      "/inventory/items",
      "/sales/after-sales",
      "/finance/wallet",
      "/reports/workload",
    ],
    PROCUREMENT: [
      "/procurement",
      "/logistics/consolidations",
      "/inventory/sellable",
      "/inventory/items",
      "/reports/workload",
    ],
    WAREHOUSE: [
      "/fulfillment/requests",
      "/logistics/consolidations",
      "/inventory/sellable",
      "/inventory/items",
      "/inventory/lots",
      "/sales/after-sales",
      "/reports/workload",
    ],
    LISTING: [
      "/inventory/skus",
      "/inventory/sellable",
      "/inventory/items",
      "/listing",
      "/sales",
      "/marketplace",
      "/resale",
      "/finance/wallet",
      "/reports/workload",
    ],
    FINANCE: ["/finance", "/reports", "/settings/system"],
    VIEWER: ["/inventory/sellable", "/marketplace", "/reports/workload"],
  };
  return (allowedPrefixesByRole[role ?? ""] ?? []).some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

export function canAccessScopedObjectInActiveOrganization(input: {
  activeOrganizationId: string;
  membershipOrganizationIds: string[];
  objectOrganizationId: string | null;
  hasScopedAccess: boolean;
}) {
  if (!input.hasScopedAccess) return false;
  if (!input.objectOrganizationId) return true;
  return (
    input.objectOrganizationId === input.activeOrganizationId ||
    !input.membershipOrganizationIds.includes(input.objectOrganizationId)
  );
}
