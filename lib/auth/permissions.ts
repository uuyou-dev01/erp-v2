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

export function hasRoleAtLeast(
  role: string | null | undefined,
  minimum: string
) {
  return (ROLE_RANK[role ?? ""] ?? 0) >= (ROLE_RANK[minimum] ?? 0);
}
