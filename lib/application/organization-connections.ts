import type { Prisma } from "@prisma/client";

type OrganizationConnectionClient = Pick<Prisma.TransactionClient, "organizationConnection">;

export function organizationPairKey(firstId: string, secondId: string) {
  return [firstId, secondId].sort().join(":");
}

export async function getActiveOrganizationConnection(
  client: OrganizationConnectionClient,
  firstOrganizationId: string,
  secondOrganizationId: string
) {
  if (firstOrganizationId === secondOrganizationId) return null;
  return client.organizationConnection.findFirst({
    where: {
      pairKey: organizationPairKey(firstOrganizationId, secondOrganizationId),
      status: "ACTIVE",
    },
  });
}
