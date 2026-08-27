import { prisma } from "@/lib/prisma";

export async function getOrderFulfillmentLocationIds(orderId: string) {
  const allocations = await prisma.orderAllocation.findMany({
    where: { orderLine: { orderId } },
    select: {
      inventoryLot: { select: { locationId: true } },
      itemUnit: { select: { locationId: true } },
    },
  });
  return Array.from(
    new Set(
      allocations
        .map(
          (allocation) =>
            allocation.itemUnit?.locationId ?? allocation.inventoryLot?.locationId ?? null
        )
        .filter((locationId): locationId is string => Boolean(locationId))
    )
  );
}

export async function getDefaultLocationFulfiller(locationId: string) {
  return prisma.locationFulfiller.findFirst({
    where: {
      locationId,
      status: "ACTIVE",
      isDefault: true,
      userId: { not: null },
    },
    select: { userId: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function isActiveLocationFulfiller(userId: string, locationId: string) {
  const fulfiller = await prisma.locationFulfiller.findFirst({
    where: { userId, locationId, status: "ACTIVE" },
    select: { id: true },
  });
  return Boolean(fulfiller);
}

export async function taskActionUrlForAssignee(input: {
  taskId: string;
  storeId: string;
  assignedToId: string;
  fulfillmentLocationId?: string | null;
}) {
  const internalAccess = await prisma.storeAccess.findFirst({
    where: { storeId: input.storeId, userId: input.assignedToId },
    select: { id: true },
  });
  if (internalAccess) return `/m/tasks/${encodeURIComponent(input.taskId)}`;
  if (
    input.fulfillmentLocationId &&
    (await isActiveLocationFulfiller(input.assignedToId, input.fulfillmentLocationId))
  ) {
    return `/collaboration/tasks?task=${encodeURIComponent(input.taskId)}`;
  }
  return `/m/tasks/${encodeURIComponent(input.taskId)}`;
}
