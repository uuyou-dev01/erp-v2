"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserContext } from "@/lib/auth/user-context";
import { assignTask } from "@/lib/application/tasks";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { canShipOrders, hasRoleAtLeast, ROLES } from "@/lib/auth/permissions";
import { hasLocationCapability } from "@/lib/auth/scope-access";
import { getOrderFulfillmentLocationIds } from "@/lib/application/location-fulfillment-roster";

export async function assignWorkTask(taskId: string, assignedToId: string) {
  const context = await requireUserContext();
  if (!hasRoleAtLeast(context.role, ROLES.MANAGER)) {
    throw new Error("只有运营负责人及以上角色可以指派任务");
  }
  const task = await prisma.task.findFirst({
    where: { id: taskId, organizationId: context.organizationId },
    select: {
      id: true,
      storeId: true,
      type: true,
      refType: true,
      refId: true,
      fulfillmentLocationId: true,
    },
  });
  if (!task) {
    throw new Error("任务不存在或无权操作");
  }
  const fulfillmentLocationIds =
    task.type === "SHIP_ORDER" && task.refType === "CUSTOMER_ORDER"
      ? await getOrderFulfillmentLocationIds(task.refId)
      : task.fulfillmentLocationId
        ? [task.fulfillmentLocationId]
        : [];
  const singleFulfillmentLocationId =
    fulfillmentLocationIds.length === 1 ? fulfillmentLocationIds[0] : null;

  const assignee = await prisma.user.findUnique({
    where: {
      id: assignedToId,
    },
    select: {
      id: true,
      memberships: {
        where: { organizationId: context.organizationId, status: "ACTIVE" },
        select: { role: true },
      },
      storeAccesses: {
        where: { storeId: task.storeId },
        select: { id: true },
      },
      locationFulfillerAssignments:
        task.type === "SHIP_ORDER" && singleFulfillmentLocationId
          ? {
              where: {
                organizationId: context.organizationId,
                locationId: singleFulfillmentLocationId,
                status: "ACTIVE",
              },
              select: { id: true },
            }
          : false,
    },
  });
  const membershipRole = assignee?.memberships[0]?.role;
  const isInternalMember = Boolean(membershipRole && assignee?.storeAccesses.length);
  const hasWarehouseRosterAccess = Boolean(
    assignee &&
    "locationFulfillerAssignments" in assignee &&
    assignee.locationFulfillerAssignments.length
  );
  const hasInternalShipmentAccess = Boolean(
    assignee &&
    isInternalMember &&
    canShipOrders(membershipRole) &&
    (fulfillmentLocationIds.length === 0 ||
      (
        await Promise.all(
          fulfillmentLocationIds.map((locationId) =>
            hasLocationCapability(assignee.id, locationId, "ship")
          )
        )
      ).every(Boolean))
  );
  const canReceiveTask =
    task.type === "SHIP_ORDER"
      ? hasInternalShipmentAccess || hasWarehouseRosterAccess
      : isInternalMember;
  if (!assignee || !canReceiveTask) {
    throw new Error("被指派人不具备全部出库仓库的发货权限");
  }

  await assignTask({
    taskId,
    assignedToId,
    actorId: context.userId,
    organizationId: context.organizationId,
    // The workbench can resolve the warehouse from the order allocation even
    // when an older task row has not persisted it yet. Keep the task's security
    // scope in sync so an external warehouse collaborator can actually receive it.
    fulfillmentLocationId: singleFulfillmentLocationId,
  });
  revalidatePath("/workbench");
  revalidatePath("/collaboration/tasks");
}

export async function assignWorkTaskAction(taskId: string, assignedToId: string) {
  try {
    await assignWorkTask(taskId, assignedToId);
    return actionSuccess({ taskId });
  } catch (error) {
    return toActionFailure(error, "指派失败，请重试");
  }
}
