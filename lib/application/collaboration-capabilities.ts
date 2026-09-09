import type { Prisma } from "@prisma/client";
import {
  capabilitiesForWarehouseRole,
  COLLABORATION_CAPABILITY,
  type CollaborationCapability,
} from "@/lib/application/relationship-foundation";

export { COLLABORATION_CAPABILITY, type CollaborationCapability };

type CollaborationCapabilityClient = Pick<
  Prisma.TransactionClient,
  "locationFulfiller" | "membership"
>;

export function capabilitiesForLocationFulfillerRole(role: string | null | undefined) {
  return capabilitiesForWarehouseRole(role);
}

export async function resolveCollaborationCapabilities(
  client: CollaborationCapabilityClient,
  input: { userId: string; organizationId: string; locationId?: string | null }
) {
  if (!input.locationId) return new Set<string>();

  const roster = await client.locationFulfiller.findFirst({
    where: {
      organizationId: input.organizationId,
      locationId: input.locationId,
      userId: input.userId,
      status: "ACTIVE",
    },
    select: { role: true },
  });

  return new Set<string>(capabilitiesForLocationFulfillerRole(roster?.role));
}

export async function isUserEligibleForCollaborationScope(
  client: CollaborationCapabilityClient,
  input: {
    userId: string;
    organizationId: string;
    scopeType: "ORGANIZATION" | "LOCATION" | "ROLE" | "USER";
    scopeRef: string;
  }
) {
  if (input.scopeType === "USER") return input.scopeRef === input.userId;

  if (input.scopeType === "LOCATION") {
    const roster = await client.locationFulfiller.findFirst({
      where: {
        organizationId: input.organizationId,
        locationId: input.scopeRef,
        userId: input.userId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    return Boolean(roster);
  }

  const membership = await client.membership.findFirst({
    where: {
      organizationId: input.organizationId,
      userId: input.userId,
      status: "ACTIVE",
      ...(input.scopeType === "ROLE" ? { role: input.scopeRef } : {}),
    },
    select: { id: true },
  });
  return Boolean(membership);
}
