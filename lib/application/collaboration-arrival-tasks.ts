import { prisma } from "@/lib/prisma";
import {
  consolidationManifestQuantity,
  resolveConsolidationManifestLines,
} from "@/lib/application/consolidation-manifest";
import { INCOMPLETE_TASK_STATUSES, TASK_TYPE } from "@/lib/application/tasks";

export async function getCollaborationArrivalTasksForUser(userId: string) {
  const roster = await prisma.locationFulfiller.findMany({
    where: { userId, status: "ACTIVE" },
    select: { organizationId: true, locationId: true },
  });
  if (!roster.length) return [];

  const tasks = await prisma.task.findMany({
    where: {
      assignedToId: userId,
      type: TASK_TYPE.CONFIRM_ARRIVAL,
      refType: "CONSOLIDATION_BATCH",
      status: { in: [...INCOMPLETE_TASK_STATUSES] },
      OR: roster.map((entry) => ({
        organizationId: entry.organizationId,
        fulfillmentLocationId: entry.locationId,
      })),
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
  });
  if (!tasks.length) return [];

  const [batches, organizations] = await Promise.all([
    prisma.consolidationBatch.findMany({
      where: {
        status: "SHIPPED",
        OR: tasks.map((task) => ({
          id: task.refId,
          storeId: task.storeId,
          toLocationId: task.fulfillmentLocationId,
        })),
      },
      select: {
        id: true,
        status: true,
        outboundTrackingNo: true,
        carrier: true,
        shippedAt: true,
        fromLocation: { select: { id: true, code: true, name: true } },
        toLocation: { select: { id: true, code: true, name: true } },
        lines: {
          select: {
            id: true,
            sourceType: true,
            sourceId: true,
            quantity: true,
          },
        },
      },
    }),
    prisma.organization.findMany({
      where: { id: { in: tasks.map((task) => task.organizationId) } },
      select: { id: true, name: true },
    }),
  ]);
  const batchById = new Map(batches.map((batch) => [batch.id, batch]));
  const organizationById = new Map(
    organizations.map((organization) => [organization.id, organization.name])
  );

  return Promise.all(
    tasks.flatMap((task) => {
      const batch = batchById.get(task.refId);
      if (!batch?.toLocation) return [];
      return [
        resolveConsolidationManifestLines(batch.lines).then((lines) => ({
          id: task.id,
          status: task.status,
          createdAt: task.createdAt.toISOString(),
          organizationName: organizationById.get(task.organizationId) ?? "委托企业",
          batch: {
            id: batch.id,
            status: batch.status,
            outboundTrackingNo: batch.outboundTrackingNo,
            carrier: batch.carrier,
            shippedAt: batch.shippedAt?.toISOString() ?? null,
            fromLocation: batch.fromLocation,
            toLocation: batch.toLocation,
            totalQuantity: consolidationManifestQuantity(lines),
            lines,
          },
        })),
      ];
    })
  );
}

export type CollaborationArrivalTask = Awaited<
  ReturnType<typeof getCollaborationArrivalTasksForUser>
>[number];
