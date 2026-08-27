import type { Prisma } from "@prisma/client";

const WAREHOUSE_ROSTER_SOURCE = "WAREHOUSE_ROSTER";

type LocationAccessClient = Pick<Prisma.TransactionClient, "locationAccess">;

export function isWarehouseRosterManagedAccess(permissions: unknown) {
  return (
    Boolean(permissions) &&
    typeof permissions === "object" &&
    !Array.isArray(permissions) &&
    (permissions as Record<string, unknown>).source === WAREHOUSE_ROSTER_SOURCE
  );
}

export async function ensureWarehouseRosterLocationAccess(
  client: LocationAccessClient,
  input: { locationId: string; userId: string }
) {
  const existing = await client.locationAccess.findUnique({
    where: {
      locationId_userId: { locationId: input.locationId, userId: input.userId },
    },
    select: { id: true, role: true, permissions: true },
  });

  const permissions = {
    ship: true,
    viewRecipient: true,
    source: WAREHOUSE_ROSTER_SOURCE,
  };

  if (!existing) {
    return client.locationAccess.create({
      data: {
        locationId: input.locationId,
        userId: input.userId,
        // VIEWER is intentionally not an operating role. Capability checks therefore
        // honor the explicit `ship` permission instead of granting receive/inspect.
        role: "VIEWER",
        permissions,
      },
    });
  }

  if (!isWarehouseRosterManagedAccess(existing.permissions)) {
    // A manual, team, or agreement-derived grant owns this shared row. The warehouse
    // roster is sufficient for the collaboration portal, so preserve that grant.
    return existing;
  }

  return client.locationAccess.update({
    where: { id: existing.id },
    data: { role: "VIEWER", permissions },
  });
}

export async function revokeWarehouseRosterLocationAccess(
  client: LocationAccessClient,
  input: { locationId: string; userId: string }
) {
  const existing = await client.locationAccess.findUnique({
    where: {
      locationId_userId: { locationId: input.locationId, userId: input.userId },
    },
    select: { id: true, permissions: true },
  });
  if (!existing || !isWarehouseRosterManagedAccess(existing.permissions)) return false;

  await client.locationAccess.delete({ where: { id: existing.id } });
  return true;
}
