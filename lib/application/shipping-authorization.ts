import { RESERVING_ALLOCATION_STATUSES } from "@/lib/application/order-allocation";
import { INCOMPLETE_TASK_STATUSES, TASK_TYPE } from "@/lib/application/tasks";
import { canShipOrders } from "@/lib/auth/permissions";
import { getLocationIdsWithCapability } from "@/lib/auth/scope-access";
import { prisma } from "@/lib/prisma";

export function assertCurrentShipmentAccess(input: {
  role: string;
  userId: string;
  allocationLocationIds: string[];
  authorizedLocationIds: string[];
  assignedToId?: string | null;
}) {
  if (!canShipOrders(input.role)) {
    throw new Error("当前角色没有订单发货权限");
  }
  if (input.assignedToId && input.assignedToId !== input.userId) {
    throw new Error("该发货任务已指派给其他执行人");
  }
  const authorized = new Set(input.authorizedLocationIds);
  const unauthorizedLocation = input.allocationLocationIds.find(
    (locationId) => !authorized.has(locationId)
  );
  if (unauthorizedLocation) {
    throw new Error("当前账号没有订单库存所在仓库的发货权限");
  }
}

export async function assertCanShipCustomerOrder(input: {
  orderId: string;
  organizationId: string;
  storeId: string;
  userId: string;
  role: string;
}) {
  const [allocations, conflictingTask, authorizedLocationIds] = await Promise.all([
    prisma.orderAllocation.findMany({
      where: {
        orderLine: { orderId: input.orderId },
        status: { in: [...RESERVING_ALLOCATION_STATUSES] },
      },
      select: {
        inventoryLot: { select: { locationId: true } },
        itemUnit: { select: { locationId: true } },
      },
    }),
    prisma.task.findFirst({
      where: {
        organizationId: input.organizationId,
        storeId: input.storeId,
        type: TASK_TYPE.SHIP_ORDER,
        refType: "CUSTOMER_ORDER",
        refId: input.orderId,
        status: { in: [...INCOMPLETE_TASK_STATUSES] },
        assignedToId: { not: null },
      },
      select: { assignedToId: true },
      orderBy: { createdAt: "desc" },
    }),
    getLocationIdsWithCapability(input.userId, "ship"),
  ]);

  const allocationLocationIds = Array.from(
    new Set(
      allocations
        .map(
          (allocation) =>
            allocation.itemUnit?.locationId ?? allocation.inventoryLot?.locationId ?? null
        )
        .filter((locationId): locationId is string => Boolean(locationId))
    )
  );

  assertCurrentShipmentAccess({
    role: input.role,
    userId: input.userId,
    allocationLocationIds,
    authorizedLocationIds,
    assignedToId: conflictingTask?.assignedToId,
  });
}
