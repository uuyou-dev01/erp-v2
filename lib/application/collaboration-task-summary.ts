import { prisma } from "@/lib/prisma";
import { INCOMPLETE_TASK_STATUSES, TASK_TYPE } from "@/lib/application/tasks";

export type CollaborationTaskSummary = {
  hasWarehouseCollaboration: boolean;
  pendingTaskCount: number;
};

/**
 * Cross-organization warehouse work is deliberately not part of the active
 * organization's task queue. This lightweight summary powers a persistent
 * portal entry for users who also own or belong to another organization.
 */
export async function getCollaborationTaskSummaryForUser(
  userId: string
): Promise<CollaborationTaskSummary> {
  const roster = await prisma.locationFulfiller.findMany({
    where: { userId, status: "ACTIVE" },
    select: { organizationId: true, locationId: true },
  });

  if (!roster.length) {
    return { hasWarehouseCollaboration: false, pendingTaskCount: 0 };
  }

  const pendingTaskCount = await prisma.task.count({
    where: {
      assignedToId: userId,
      type: TASK_TYPE.SHIP_ORDER,
      refType: "CUSTOMER_ORDER",
      status: { in: [...INCOMPLETE_TASK_STATUSES] },
      OR: roster.map((access) => ({
        organizationId: access.organizationId,
        fulfillmentLocationId: access.locationId,
      })),
    },
  });

  return { hasWarehouseCollaboration: true, pendingTaskCount };
}
