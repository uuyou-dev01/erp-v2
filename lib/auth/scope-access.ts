import { prisma } from "@/lib/prisma";

const OPERATING_ROLES = new Set(["OWNER", "ADMIN", "MANAGER", "OPERATOR", "FULFILLMENT"]);

export function grantsLocationCapability(
  access: { locationId: string; role: string; permissions: unknown },
  capability: "receive" | "inspect" | "ship"
) {
  const permissions =
    access.permissions &&
    typeof access.permissions === "object" &&
    !Array.isArray(access.permissions)
      ? (access.permissions as Record<string, unknown>)
      : null;
  if (capability === "ship" && Array.isArray(permissions?.shipLocationIds)) {
    return permissions.shipLocationIds.includes(access.locationId);
  }
  if (permissions?.[capability] === false) return false;
  if (OPERATING_ROLES.has(access.role)) return true;
  return permissions?.[capability] === true;
}

export async function hasLocationCapability(
  userId: string,
  locationId: string,
  capability: "receive" | "inspect" | "ship"
) {
  const access = await prisma.locationAccess.findUnique({
    where: { locationId_userId: { locationId, userId } },
    select: { locationId: true, role: true, permissions: true },
  });
  if (!access) return false;
  return grantsLocationCapability(access, capability);
}

export async function getLocationIdsWithCapability(
  userId: string,
  capability: "receive" | "inspect" | "ship"
) {
  const accesses = await prisma.locationAccess.findMany({
    where: { userId },
    select: { locationId: true, role: true, permissions: true },
  });
  return accesses
    .filter((access) => grantsLocationCapability(access, capability))
    .map((access) => access.locationId);
}
