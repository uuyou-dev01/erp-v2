import { prisma } from "@/lib/prisma";

const OPERATING_ROLES = new Set(["OWNER", "ADMIN", "MANAGER", "OPERATOR", "FULFILLMENT"]);

function grantsCapability(
  access: { role: string; permissions: unknown },
  capability: "receive" | "inspect" | "ship"
) {
  if (OPERATING_ROLES.has(access.role)) return true;
  if (
    !access.permissions ||
    typeof access.permissions !== "object" ||
    Array.isArray(access.permissions)
  ) {
    return false;
  }
  return (access.permissions as Record<string, unknown>)[capability] === true;
}

export async function hasLocationCapability(
  userId: string,
  locationId: string,
  capability: "receive" | "inspect" | "ship"
) {
  const access = await prisma.locationAccess.findUnique({
    where: { locationId_userId: { locationId, userId } },
    select: { role: true, permissions: true },
  });
  if (!access) return false;
  return grantsCapability(access, capability);
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
    .filter((access) => grantsCapability(access, capability))
    .map((access) => access.locationId);
}
