"use server";
import { notifyShippingParticipants } from "@/lib/application/shipping-notifications";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import {
  getCollaborationShippingTasksForUser,
  type CollaborationShippingTask,
} from "@/lib/application/collaboration-shipping-tasks";
import {
  parseShippingProof,
  shippingProofToJson,
  type ShippingProof,
} from "@/lib/application/shipping-proof";
import { bindAssetReferences } from "@/lib/assets/references";
import { notifyOrganizationAdministrators } from "@/lib/application/collaboration-notifications";
import { requireAuthenticatedUser } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";
import { markOrderShippedAsLocationFulfiller } from "@/app/actions/customer-orders";
import { getMyWorkMetrics } from "@/lib/application/work-metrics";
import {
  acceptShipOrderHandoff,
  claimShipOrderTask,
  declineShipOrderTask,
  requestShipOrderHandoff,
  assignQueuedShipOrderTask,
  returnShipOrderTask,
  withdrawShipOrderTask,
} from "@/lib/application/shipping-dispatch-lifecycle";
import { capabilitiesForLocationFulfillerRole } from "@/lib/application/collaboration-capabilities";
import { getCollaborationArrivalTasksForUser } from "@/lib/application/collaboration-arrival-tasks";
import { updateConsolidationStatus } from "@/app/actions/consolidations";
import { completeTask, TASK_TYPE } from "@/lib/application/tasks";

const ACTIVE_TASK_STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "OVERDUE"];
const VISIBLE_CREATED_TASK_STATUSES = [...ACTIVE_TASK_STATUSES, "DONE", "CANCELLED"];

type WarehouseInboxTask = Omit<CollaborationShippingTask, "assigneeName"> & {
  assigneeName: string | null;
  assignedToId: string | null;
  isAssignedToMe: boolean;
  isCreatedByMe: boolean;
  canDispatch?: boolean;
  transferCandidates: Array<{ id: string; name: string; email: string }>;
};

function revalidateCollaborationTaskViews() {
  revalidatePath("/collaboration/tasks");
  revalidatePath("/workbench");
}

export async function getCollaborationShippingTasks() {
  const user = await requireAuthenticatedUser();
  const tasks = await getCollaborationShippingTasksForUser(user.id);
  if (!tasks.length) return tasks;
  const organizationIds = Array.from(new Set(tasks.map((task) => task.organizationId)));
  const locationIds = Array.from(new Set(tasks.map((task) => task.fulfillmentLocationId)));
  const roster = await prisma.locationFulfiller.findMany({
    where: {
      organizationId: { in: organizationIds },
      locationId: { in: locationIds },
      status: "ACTIVE",
      userId: { not: null },
    },
    select: {
      organizationId: true,
      locationId: true,
      userId: true,
      role: true,
      user: { select: { name: true, email: true } },
    },
  });
  return tasks.map((task) => ({
    ...task,
    assignedToId: task.assignedToId,
    transferCandidates: roster.flatMap((candidate) =>
      candidate.organizationId === task.organizationId &&
      candidate.locationId === task.fulfillmentLocationId &&
      candidate.userId &&
      (capabilitiesForLocationFulfillerRole(candidate.role) as readonly string[]).includes(
        "warehouse.ship"
      )
        ? [
            {
              id: candidate.userId,
              name: candidate.user?.name || candidate.user?.email || "未命名协作者",
              email: candidate.user?.email || "",
            },
          ]
        : []
    ),
  }));
}

export async function assignCollaborationShippingTaskAction(taskId: string, assignedToId: string) {
  try {
    const user = await requireAuthenticatedUser();
    const result = await assignQueuedShipOrderTask({
      taskId,
      actorUserId: user.id,
      targetUserId: assignedToId,
    });
    revalidateCollaborationTaskViews();
    revalidatePath("/notifications");
    return actionSuccess({ taskId, outcome: result.outcome });
  } catch (error) {
    return toActionFailure(error, "指派任务失败，请重试");
  }
}

export async function getMyCollaborationWorkMetrics() {
  const user = await requireAuthenticatedUser();
  return getMyWorkMetrics({ userId: user.id });
}

export async function getCollaborationArrivalTasks() {
  const user = await requireAuthenticatedUser();
  return getCollaborationArrivalTasksForUser(user.id);
}

export async function completeCollaborationArrivalTaskAction(taskId: string) {
  try {
    const user = await requireAuthenticatedUser();
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        assignedToId: user.id,
        type: TASK_TYPE.CONFIRM_ARRIVAL,
        refType: "CONSOLIDATION_BATCH",
        status: { in: ACTIVE_TASK_STATUSES },
        fulfillmentLocationId: { not: null },
      },
    });
    if (!task?.fulfillmentLocationId) throw new Error("到仓任务不存在或已经完成");

    const roster = await prisma.locationFulfiller.findFirst({
      where: {
        organizationId: task.organizationId,
        locationId: task.fulfillmentLocationId,
        userId: user.id,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!roster) throw new Error("你已不在该仓库的协作范围内");

    const batch = await prisma.consolidationBatch.findUnique({
      where: { id: task.refId },
      select: { status: true, storeId: true, toLocationId: true },
    });
    if (!batch) throw new Error("集运批次不存在");
    if (batch.storeId !== task.storeId || batch.toLocationId !== task.fulfillmentLocationId) {
      throw new Error("到仓任务与集运批次不匹配");
    }
    if (batch.status === "SHIPPED") {
      await updateConsolidationStatus(task.refId, "RECEIVED");
    } else if (batch.status !== "RECEIVED") {
      throw new Error("当前集运状态不能确认到货");
    }

    await completeTask({ taskId: task.id, completedById: user.id });
    revalidateCollaborationTaskViews();
    revalidatePath(`/logistics/consolidations/${task.refId}`);
    revalidatePath("/logistics/consolidations");
    revalidatePath("/inventory/lots");
    revalidatePath("/inventory/items");
    revalidatePath("/inventory/sellable");
    revalidatePath("/notifications");
    return actionSuccess({ taskId, outcome: "arrival_confirmed" });
  } catch (error) {
    return toActionFailure(error, "确认集运到货失败，请重试");
  }
}

/**
 * Dashboard members need both sides of a warehouse hand-off: work assigned to
 * them and work they initiated for somebody else. The standalone collaborator
 * portal deliberately continues to use getCollaborationShippingTasks().
 */
export async function getWarehouseCollaborationTaskInbox() {
  const user = await requireAuthenticatedUser();
  const assignedTasks = await getCollaborationShippingTasksForUser(user.id);
  const createdRows = await prisma.task.findMany({
    where: {
      createdById: user.id,
      type: "SHIP_ORDER",
      refType: "CUSTOMER_ORDER",
      fulfillmentLocationId: { not: null },
      status: { in: VISIBLE_CREATED_TASK_STATUSES },
    },
    select: {
      id: true,
      status: true,
      title: true,
      description: true,
      dueAt: true,
      createdAt: true,
      completedAt: true,
      organizationId: true,
      assignedToId: true,
      fulfillmentLocationId: true,
      refId: true,
      metadata: true,
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
  });

  const locationIds = Array.from(
    new Set(
      [
        ...createdRows.map((task) => task.fulfillmentLocationId),
        ...assignedTasks.map((task) => task.fulfillmentLocationId),
      ].filter(Boolean) as string[]
    )
  );
  const organizationIds = Array.from(
    new Set([
      ...createdRows.map((task) => task.organizationId),
      ...assignedTasks.map((task) => task.organizationId),
    ])
  );
  const orderIds = Array.from(new Set(createdRows.map((task) => task.refId)));
  const assigneeIds = Array.from(
    new Set(createdRows.map((task) => task.assignedToId).filter(Boolean) as string[])
  );
  const [locations, organizations, orders, assignees, roster] = await Promise.all([
    prisma.location.findMany({
      where: { id: { in: locationIds } },
      select: { id: true, name: true, code: true, region: true },
    }),
    prisma.organization.findMany({
      where: { id: { in: organizationIds } },
      select: { id: true, name: true },
    }),
    prisma.customerOrder.findMany({
      where: { id: { in: orderIds } },
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        customerPhone: true,
        shippingAddress: true,
        shippingCountry: true,
        trackingNo: true,
        shippingProof: true,
        lines: {
          select: {
            id: true,
            quantity: true,
            sku: { select: { code: true, name: true, imageUrl: true, variantLabel: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.user.findMany({
      where: { id: { in: assigneeIds } },
      select: { id: true, name: true, email: true },
    }),
    prisma.locationFulfiller.findMany({
      where: {
        organizationId: { in: organizationIds },
        locationId: { in: locationIds },
        status: "ACTIVE",
        userId: { not: null },
      },
      select: { organizationId: true, locationId: true, userId: true },
    }),
  ]);

  const rosterUserIds = Array.from(
    new Set(roster.map((row) => row.userId).filter(Boolean) as string[])
  );
  const rosterUsers = await prisma.user.findMany({
    where: { id: { in: rosterUserIds } },
    select: { id: true, name: true, email: true },
  });
  const locationById = new Map(locations.map((location) => [location.id, location]));
  const organizationById = new Map(
    organizations.map((organization) => [organization.id, organization])
  );
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const assigneeById = new Map(assignees.map((assignee) => [assignee.id, assignee]));
  const rosterUserById = new Map(rosterUsers.map((rosterUser) => [rosterUser.id, rosterUser]));

  const createdTasks: WarehouseInboxTask[] = createdRows.flatMap((task) => {
    if (!task.fulfillmentLocationId) return [];
    const location = locationById.get(task.fulfillmentLocationId);
    const order = orderById.get(task.refId);
    if (!location || !order) return [];
    const assignee = task.assignedToId ? assigneeById.get(task.assignedToId) : null;
    const transferCandidates = roster
      .filter(
        (row) =>
          row.organizationId === task.organizationId &&
          row.locationId === task.fulfillmentLocationId &&
          Boolean(row.userId)
      )
      .flatMap((row) => {
        const candidate = row.userId ? rosterUserById.get(row.userId) : null;
        return candidate
          ? [{ id: candidate.id, name: candidate.name || candidate.email, email: candidate.email }]
          : [];
      });
    return [
      {
        id: task.id,
        status: task.status,
        title: task.title,
        description: task.description,
        dueAt: task.dueAt?.toISOString() ?? null,
        createdAt: task.createdAt.toISOString(),
        completedAt: task.completedAt?.toISOString() ?? null,
        isBundleSale:
          task.metadata !== null &&
          typeof task.metadata === "object" &&
          !Array.isArray(task.metadata) &&
          task.metadata.bundleSale === true,
        organizationId: task.organizationId,
        fulfillmentLocationId: task.fulfillmentLocationId,
        organizationName: organizationById.get(task.organizationId)?.name || "当前企业",
        assignedByName: user.name || user.email,
        assigneeName: assignee?.name || assignee?.email || null,
        assignedToId: task.assignedToId,
        isAssignedToMe: task.assignedToId === user.id,
        canDispatch: false,
        isCreatedByMe: true,
        handoffRequestId: null,
        isHandoffOffer: false,
        transferCandidates,
        location,
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          recipientVisible: true,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          shippingAddress: order.shippingAddress,
          shippingCountry: order.shippingCountry,
          trackingNo: order.trackingNo,
          shippingProof: parseShippingProof(order.shippingProof),
          lines: order.lines.map((line) => ({
            id: line.id,
            quantity: line.quantity.toString(),
            sku: line.sku,
          })),
        },
      },
    ];
  });

  const merged = new Map<string, WarehouseInboxTask>();
  for (const task of assignedTasks) {
    const transferCandidates = roster
      .filter(
        (row) =>
          row.organizationId === task.organizationId &&
          row.locationId === task.location.id &&
          Boolean(row.userId)
      )
      .flatMap((row) => {
        const candidate = row.userId ? rosterUserById.get(row.userId) : null;
        return candidate
          ? [{ id: candidate.id, name: candidate.name || candidate.email, email: candidate.email }]
          : [];
      });
    merged.set(task.id, {
      ...task,
      assignedToId: user.id,
      isAssignedToMe: true,
      isCreatedByMe: false,
      transferCandidates,
    });
  }
  for (const task of createdTasks) {
    const assigned = merged.get(task.id);
    merged.set(task.id, assigned ? { ...assigned, ...task, isAssignedToMe: true } : task);
  }
  return Array.from(merged.values());
}

export async function claimCollaborationShippingTaskAction(taskId: string) {
  try {
    const user = await requireAuthenticatedUser();
    const handoff = await prisma.collaborationRequest.findFirst({
      where: {
        kind: "SHIP_ORDER_HANDOFF",
        status: "OPEN",
        targetScopeType: "USER",
        targetScopeRef: user.id,
        payload: { path: ["taskId"], equals: taskId },
      },
      select: { id: true },
    });
    const result = handoff
      ? await acceptShipOrderHandoff({ requestId: handoff.id, taskId, userId: user.id })
      : await claimShipOrderTask({ taskId, userId: user.id });
    revalidateCollaborationTaskViews();
    revalidatePath("/notifications");
    return actionSuccess({ taskId, outcome: result.outcome });
  } catch (error) {
    return toActionFailure(error, "领取任务失败，请重试");
  }
}

export async function startCollaborationShippingTaskAction(taskId: string) {
  return claimCollaborationShippingTaskAction(taskId);
}

export async function returnCollaborationShippingTaskAction(taskId: string) {
  try {
    const user = await requireAuthenticatedUser();
    const result = await returnShipOrderTask({ taskId, userId: user.id });
    revalidateCollaborationTaskViews();
    return actionSuccess({ taskId, outcome: result.outcome });
  } catch (error) {
    return toActionFailure(error, "退回任务失败，请重试");
  }
}

export async function declineCollaborationShippingTaskAction(taskId: string) {
  try {
    const user = await requireAuthenticatedUser();
    const result = await declineShipOrderTask({ taskId, userId: user.id });
    revalidateCollaborationTaskViews();
    revalidatePath("/notifications");
    return actionSuccess({ taskId, outcome: result.outcome });
  } catch (error) {
    return toActionFailure(error, "暂不领取失败，请重试");
  }
}

export async function transferCollaborationShippingTaskAction(
  taskId: string,
  assignedToId: string
) {
  try {
    const user = await requireAuthenticatedUser();
    const result = await requestShipOrderHandoff({
      taskId,
      actorUserId: user.id,
      targetUserId: assignedToId,
    });
    revalidateCollaborationTaskViews();
    revalidatePath("/notifications");
    return actionSuccess({ taskId, outcome: result.outcome });
  } catch (error) {
    return toActionFailure(error, "转交任务失败，请重试");
  }
}

export async function withdrawCollaborationShippingTaskAction(taskId: string, reason?: string) {
  try {
    const user = await requireAuthenticatedUser();
    const result = await withdrawShipOrderTask({ taskId, actorUserId: user.id, reason });
    revalidateCollaborationTaskViews();
    revalidatePath("/notifications");
    return actionSuccess({ taskId, outcome: result.outcome });
  } catch (error) {
    return toActionFailure(error, "撤回任务失败，请重试");
  }
}

export async function saveCollaborationShippingPreparationAction(
  taskId: string,
  input: { imageUrls: string[]; proofNote?: string }
) {
  try {
    const user = await requireAuthenticatedUser();
    if (input.imageUrls.length > 30 || (input.proofNote?.length ?? 0) > 2000)
      throw new Error("资料过多，请限制在 30 张图片和 2000 字以内");
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        assignedToId: user.id,
        status: "IN_PROGRESS",
        type: TASK_TYPE.SHIP_ORDER,
        refType: "CUSTOMER_ORDER",
        fulfillmentLocationId: { not: null },
      },
      select: {
        id: true,
        organizationId: true,
        storeId: true,
        refId: true,
        fulfillmentLocationId: true,
        createdById: true,
      },
    });
    if (!task?.fulfillmentLocationId) throw new Error("请先领取发货任务，或刷新查看当前执行人");
    const roster = await prisma.locationFulfiller.findFirst({
      where: {
        userId: user.id,
        organizationId: task.organizationId,
        locationId: task.fulfillmentLocationId,
        status: "ACTIVE",
        organization: { memberships: { none: { userId: user.id, status: { not: "ACTIVE" } } } },
      },
      select: { id: true },
    });
    if (!roster) throw new Error("仓库合作权限已失效");
    const snapshot = await prisma.customerOrder.findFirst({
      where: { id: task.refId, storeId: task.storeId, orderStatus: "CONFIRMED" },
      select: { shippingProof: true },
    });
    if (!snapshot) throw new Error("订单已不在待发货状态");
    const knownUrls = new Set(parseShippingProof(snapshot.shippingProof).imageUrls ?? []);
    const newUrls = [...new Set(input.imageUrls)].filter((url) => !knownUrls.has(url));
    const assetIds = await bindAssetReferences(
      newUrls,
      { organizationId: task.organizationId, storeId: task.storeId, userId: user.id },
      "CUSTOMER_ORDER",
      task.refId
    );
    if (assetIds.length !== newUrls.length) throw new Error("请使用本任务上传的图片");
    const saved = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "tasks" WHERE "id" = ${task.id} FOR UPDATE`;
      const freshTask = await tx.task.findFirst({
        where: { id: task.id, assignedToId: user.id, status: "IN_PROGRESS" },
        select: { id: true },
      });
      if (!freshTask) throw new Error("任务已转交或完成，请刷新查看");
      await tx.$queryRaw`SELECT "id" FROM "customer_orders" WHERE "id" = ${task.refId} FOR UPDATE`;
      const order = await tx.customerOrder.findFirst({
        where: { id: task.refId, storeId: task.storeId, orderStatus: "CONFIRMED" },
        select: { shippingProof: true },
      });
      if (!order) throw new Error("订单已不在待发货状态，请刷新查看");
      const existing = parseShippingProof(order.shippingProof);
      const imageUrls = [...new Set([...(existing.imageUrls ?? []), ...input.imageUrls])];
      if (imageUrls.length > 30) throw new Error("发货前资料最多保留 30 张图片");
      await tx.customerOrder.update({
        where: { id: task.refId },
        data: {
          shippingProof: shippingProofToJson({
            ...existing,
            imageUrls,
            ...(input.proofNote !== undefined ? { proofNote: input.proofNote } : {}),
            updatedAt: new Date().toISOString(),
          }) as Prisma.InputJsonValue,
        },
      });
      return imageUrls;
    });
    await notifyShippingParticipants({
      orderId: task.refId,
      actorId: user.id,
      event: "PREPARATION",
    });
    revalidateCollaborationTaskViews();
    revalidatePath(`/sales/${task.refId}`);
    return actionSuccess({ imageUrls: saved });
  } catch (error) {
    return toActionFailure(error, "保存发货前资料失败，请重试");
  }
}

export async function completeCollaborationShippingTaskAction(
  taskId: string,
  input: {
    trackingNo?: string;
    shipper?: string;
    shippingMethod?: string;
    pickupCode?: string;
    proofNote?: string;
    imageUrls?: string[];
  }
) {
  try {
    const proof: ShippingProof = {
      shipper: input.shipper,
      shippingMethod: input.shippingMethod,
      pickupCode: input.pickupCode,
      proofNote: input.proofNote,
      imageUrls: input.imageUrls,
    };
    await markOrderShippedAsLocationFulfiller(taskId, {
      trackingNo: input.trackingNo,
      shippingProof: proof,
    });
    revalidateCollaborationTaskViews();
    return actionSuccess({ taskId });
  } catch (error) {
    return toActionFailure(error, "确认发货失败，请重试");
  }
}
