export const ROLES = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
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
  return new Set<string>([ROLES.OWNER, ROLES.ADMIN, ROLES.MANAGER, ROLES.LISTING]).has(role ?? "");
}

export function canShipOrders(role: string | null | undefined) {
  return new Set<string>([ROLES.OWNER, ROLES.ADMIN, ROLES.MANAGER, ROLES.FULFILLMENT]).has(
    role ?? ""
  );
}

export function isNavigationHrefAllowed(role: string | null | undefined, href: string) {
  if (hasRoleAtLeast(role, ROLES.MANAGER)) return true;
  const path = href.split("?")[0];
  const allowedPrefixesByRole: Record<string, string[]> = {
    FULFILLMENT: [
      "/workbench",
      "/notifications",
      "/fulfillment/requests",
      "/logistics/consolidations",
      "/inventory/items",
      "/sales/after-sales",
      "/finance/wallet",
      "/reports/workload",
      "/settings/personal",
    ],
    LISTING: [
      "/workbench",
      "/notifications",
      "/inventory/skus",
      "/inventory/sellable",
      "/inventory/items",
      "/listing",
      "/sales",
      "/marketplace",
      "/resale",
      "/finance/wallet",
      "/reports/workload",
      "/settings/personal",
    ],
    FINANCE: [
      "/workbench",
      "/notifications",
      "/finance",
      "/reports",
      "/settings/personal",
      "/settings/system",
    ],
    VIEWER: [
      "/workbench",
      "/notifications",
      "/inventory/sellable",
      "/marketplace",
      "/reports/workload",
      "/settings/personal",
    ],
  };
  return (allowedPrefixesByRole[role ?? ""] ?? []).some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}
