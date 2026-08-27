import type { Prisma } from "@prisma/client";
import { INCOMPLETE_TASK_STATUSES } from "@/lib/application/tasks";

type OrganizationAccessClient = Pick<
  Prisma.TransactionClient,
  | "membership"
  | "storeAccess"
  | "inventoryPoolAccess"
  | "channelAccess"
  | "locationAccess"
  | "task"
>;

export async function deactivateOrganizationMembershipAccess(
  client: OrganizationAccessClient,
  input: { organizationId: string; userId: string }
) {
  await client.membership.updateMany({
    where: { organizationId: input.organizationId, userId: input.userId },
    data: { status: "INACTIVE" },
  });
  await client.storeAccess.deleteMany({
    where: { userId: input.userId, store: { organizationId: input.organizationId } },
  });
  await client.inventoryPoolAccess.deleteMany({
    where: { userId: input.userId, inventoryPool: { organizationId: input.organizationId } },
  });
  await client.channelAccess.deleteMany({
    where: {
      userId: input.userId,
      salesChannelAccount: { organizationId: input.organizationId },
    },
  });
  await client.locationAccess.deleteMany({
    where: {
      userId: input.userId,
      location: {
        OR: [
          { store: { organizationId: input.organizationId } },
          { operatorOrganizationId: input.organizationId },
        ],
      },
    },
  });
  await client.task.updateMany({
    where: {
      organizationId: input.organizationId,
      assignedToId: input.userId,
      status: { in: [...INCOMPLETE_TASK_STATUSES] },
    },
    data: {
      assignedToId: null,
      delegatedToId: null,
      assignedAt: null,
      startedAt: null,
      status: "OPEN",
    },
  });
}
