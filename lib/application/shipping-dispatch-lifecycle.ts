import type { Prisma } from "@prisma/client";
import { capabilitiesForLocationFulfillerRole } from "@/lib/application/collaboration-capabilities";
import {
  cancelAcceptedCollaborationRequest,
  claimTaskDispatch,
  closeCollaborationRequest,
  completeTaskDispatch,
  createCollaborationRequest,
  respondToCollaborationRequest,
  withdrawCollaborationRequest,
} from "@/lib/application/collaboration-protocol";
import { createShipOrderDispatch } from "@/lib/application/collaboration-protocol-shipping";
import { notifyUser } from "@/lib/application/notifications";
import { INCOMPLETE_TASK_STATUSES, TASK_STATUS, TASK_TYPE } from "@/lib/application/tasks";
import { prisma } from "@/lib/prisma";

const SHIP_CAPABILITY = "warehouse.ship";
const MANAGE_CAPABILITY = "warehouse.manage";

function roleHasCapability(role: string | null | undefined, capability: string) {
  return (capabilitiesForLocationFulfillerRole(role) as readonly string[]).includes(capability);
}

function taskActionUrl(taskId: string) {
  return `/collaboration/tasks?task=${encodeURIComponent(taskId)}`;
}

async function eligibleWarehouseUsers(input: {
  organizationId: string;
  locationId: string;
}) {
  const roster = await prisma.locationFulfiller.findMany({
    where: {
      organizationId: input.organizationId,
      locationId: input.locationId,
      status: "ACTIVE",
      userId: { not: null },
    },
    select: { userId: true, role: true },
  });
  return Array.from(
    new Set(
      roster.flatMap((entry) =>
        entry.userId && roleHasCapability(entry.role, SHIP_CAPABILITY)
          ? [entry.userId]
          : []
      )
    )
  );
}

export async function notifyShipOrderQueue(input: {
  taskId: string;
  organizationId: string;
  storeId: string;
  locationId: string;
  orderId: string;
  actorId: string;
  title: string;
  notificationKey?: string;
}) {
  const recipientIds = await eligibleWarehouseUsers(input);
  await Promise.all(
    recipientIds.map((recipientId) =>
      notifyUser({
        organizationId: input.organizationId,
        storeId: input.storeId,
        recipientId,
        actorId: input.actorId,
        taskId: input.taskId,
        refType: "CUSTOMER_ORDER",
        refId: input.orderId,
        type: "WAREHOUSE_TASK_AVAILABLE",
        title: "仓库有新的待领取发货任务",
        body: input.title,
        actionUrl: taskActionUrl(input.taskId),
        dedupeKey: `warehouse-task:${input.taskId}:${input.notificationKey ?? "available"}`,
      })
    )
  );
  return recipientIds;
}

export async function ensureShipOrderTaskDispatch(input: {
  organizationId: string;
  storeId: string;
  orderId: string;
  orderNumber: string;
  createdById: string;
  locationId: string;
  dueAt?: Date | null;
  description?: string | null;
}) {
  const bundle = await prisma.$transaction(async (tx) => {
    let task = await tx.task.findFirst({
      where: {
        organizationId: input.organizationId,
        storeId: input.storeId,
        type: TASK_TYPE.SHIP_ORDER,
        refType: "CUSTOMER_ORDER",
        refId: input.orderId,
        status: { in: [...INCOMPLETE_TASK_STATUSES] },
      },
      orderBy: { createdAt: "asc" },
    });
    if (!task) {
      task = await tx.task.create({
        data: {
          organizationId: input.organizationId,
          storeId: input.storeId,
          type: TASK_TYPE.SHIP_ORDER,
          status: TASK_STATUS.OPEN,
          title: `发货订单 ${input.orderNumber}`,
          description: input.description ?? "订单已确认，等待仓库领取并发货。",
          refType: "CUSTOMER_ORDER",
          refId: input.orderId,
          createdById: input.createdById,
          fulfillmentLocationId: input.locationId,
          dueAt: input.dueAt,
          metadata: {
            assignmentMode: "WAREHOUSE_QUEUE",
            work: { code: "SHIP_ORDER", name: "订单发货", quantity: 1, unit: "件" },
          },
        },
      });
    }
    if (task.fulfillmentLocationId !== input.locationId) {
      throw new Error("发货任务的来源仓库与订单库存分配不一致");
    }
    const protocol = await createShipOrderDispatch(tx, {
      organizationId: input.organizationId,
      createdByUserId: input.createdById,
      locationId: input.locationId,
      orderId: input.orderId,
      taskId: task.id,
      idempotencyKey: `ship-order:${input.orderId}:${input.locationId}`,
      metadata: { storeId: input.storeId, taskId: task.id },
    });
    return { task, ...protocol };
  });

  await notifyShipOrderQueue({
    taskId: bundle.task.id,
    organizationId: input.organizationId,
    storeId: input.storeId,
    locationId: input.locationId,
    orderId: input.orderId,
    actorId: input.createdById,
    title: bundle.task.title,
  });
  return bundle;
}

export async function claimShipOrderTask(input: { taskId: string; userId: string }) {
  const result = await prisma.$transaction(async (tx) => {
    const dispatch = await tx.taskDispatch.findUnique({
      where: { taskId: input.taskId },
      include: { task: true, request: true },
    });
    if (!dispatch?.task) throw new Error("任务尚未进入仓库派发队列");
    if (dispatch.task.status === TASK_STATUS.CANCELLED) return { outcome: "withdrawn" as const };
    if (dispatch.task.status === TASK_STATUS.DONE) return { outcome: "completed" as const };

    await claimTaskDispatch(tx, { dispatchId: dispatch.id, userId: input.userId });
    const claimed = await tx.task.updateMany({
      where: {
        id: input.taskId,
        status: { in: [TASK_STATUS.OPEN, TASK_STATUS.ASSIGNED, TASK_STATUS.OVERDUE] },
        OR: [{ assignedToId: null }, { assignedToId: input.userId }],
      },
      data: {
        status: TASK_STATUS.IN_PROGRESS,
        assignedToId: input.userId,
        delegatedToId: input.userId,
        assignedAt: new Date(),
        startedAt: new Date(),
      },
    });
    if (!claimed.count) {
      const current = await tx.task.findUniqueOrThrow({ where: { id: input.taskId } });
      if (current.status !== TASK_STATUS.IN_PROGRESS || current.assignedToId !== input.userId) {
        throw new Error("任务已经被其他协作者领取");
      }
    }
    return { outcome: "claimed" as const, organizationId: dispatch.request.organizationId };
  });

  if (result.outcome === "claimed") {
    await prisma.notification.updateMany({
      where: { taskId: input.taskId, resolvedAt: null },
      data: {
        resolvedAt: new Date(),
        resolutionCode: "TASK_CLAIMED",
        resolvedById: input.userId,
      },
    });
  }
  return result;
}

export async function declineShipOrderTask(input: { taskId: string; userId: string }) {
  return prisma.$transaction(async (tx) => {
    const dispatch = await tx.taskDispatch.findUnique({
      where: { taskId: input.taskId },
      include: { request: true },
    });
    if (!dispatch) throw new Error("任务派发不存在");
    await respondToCollaborationRequest(tx, {
      requestId: dispatch.requestId,
      responder: { type: "USER", ref: input.userId },
      decision: "REJECT",
      idempotencyKey: `dispatch:${dispatch.id}:decline:${input.userId}`,
    });
    await tx.notification.updateMany({
      where: { taskId: input.taskId, recipientId: input.userId, resolvedAt: null },
      data: {
        resolvedAt: new Date(),
        resolutionCode: "TASK_DECLINED_BY_RECIPIENT",
        resolvedById: input.userId,
      },
    });
    return { outcome: "declined" as const };
  });
}

export async function returnShipOrderTask(input: { taskId: string; userId: string }) {
  const task = await prisma.$transaction(async (tx) => {
    const dispatch = await tx.taskDispatch.findUnique({
      where: { taskId: input.taskId },
      include: { task: true, request: true },
    });
    if (!dispatch?.task) throw new Error("任务派发不存在");
    if (dispatch.status === "QUEUED" && dispatch.task.status === TASK_STATUS.OPEN) {
      return dispatch.task;
    }
    if (dispatch.status !== "CLAIMED" || dispatch.claimedByUserId !== input.userId) {
      throw new Error("只有当前执行人可以退回任务");
    }
    const now = new Date();
    await tx.taskDispatch.update({
      where: { id: dispatch.id },
      data: { status: "QUEUED", claimedByUserId: null, claimedAt: null },
    });
    await tx.collaborationRequest.update({
      where: { id: dispatch.requestId },
      data: { status: "OPEN", resolvedAt: null, resolutionCode: null },
    });
    const pendingHandoffs = await tx.collaborationRequest.findMany({
      where: {
        parentRequestId: dispatch.requestId,
        kind: "SHIP_ORDER_HANDOFF",
        status: "OPEN",
      },
      select: { id: true },
    });
    await tx.collaborationRequest.updateMany({
      where: { id: { in: pendingHandoffs.map((request) => request.id) } },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        resolvedAt: now,
        resolutionCode: "PARENT_TASK_RETURNED",
      },
    });
    for (const handoff of pendingHandoffs) {
      await tx.collaborationEvent.create({
        data: {
          requestId: handoff.id,
          type: "CANCELLED",
          actorScopeType: "USER",
          actorScopeRef: input.userId,
          dedupeKey: "request:cancelled:parent-returned",
          payload: { taskId: input.taskId },
        },
      });
    }
    const updated = await tx.task.update({
      where: { id: dispatch.task.id },
      data: {
        status: TASK_STATUS.OPEN,
        assignedToId: null,
        delegatedToId: null,
        assignedAt: null,
        startedAt: null,
      },
    });
    await tx.collaborationEvent.create({
      data: {
        requestId: dispatch.requestId,
        dispatchId: dispatch.id,
        type: "TASK_RETURNED",
        actorScopeType: "USER",
        actorScopeRef: input.userId,
        dedupeKey: `dispatch:${dispatch.id}:returned:${now.toISOString()}`,
      },
    });
    return updated;
  });

  if (!task.fulfillmentLocationId) throw new Error("任务未绑定来源仓库");
  await notifyShipOrderQueue({
    taskId: task.id,
    organizationId: task.organizationId,
    storeId: task.storeId,
    locationId: task.fulfillmentLocationId,
    orderId: task.refId,
    actorId: input.userId,
    title: `任务已退回队列：${task.title}`,
    notificationKey: `returned:${Date.now()}`,
  });
  return { outcome: "returned" as const };
}

export async function requestShipOrderHandoff(input: {
  taskId: string;
  actorUserId: string;
  targetUserId: string;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const dispatch = await tx.taskDispatch.findUnique({
      where: { taskId: input.taskId },
      include: { task: true, request: true },
    });
    if (!dispatch?.task || !dispatch.task.fulfillmentLocationId) {
      throw new Error("任务派发或来源仓库不存在");
    }
    if (
      dispatch.status !== "CLAIMED" ||
      (dispatch.claimedByUserId !== input.actorUserId &&
        dispatch.task.createdById !== input.actorUserId)
    ) {
      throw new Error("只有当前执行人或委托方可以发起转交");
    }
    const target = await tx.locationFulfiller.findFirst({
      where: {
        organizationId: dispatch.task.organizationId,
        locationId: dispatch.task.fulfillmentLocationId,
        userId: input.targetUserId,
        status: "ACTIVE",
      },
      select: { role: true },
    });
    if (!target || !roleHasCapability(target.role, SHIP_CAPABILITY)) {
      throw new Error("接收人不具备该仓库的发货能力");
    }
    const pendingHandoff = await tx.collaborationRequest.findFirst({
      where: {
        parentRequestId: dispatch.requestId,
        kind: "SHIP_ORDER_HANDOFF",
        status: "OPEN",
      },
    });
    if (pendingHandoff) {
      if (pendingHandoff.targetScopeRef !== input.targetUserId) {
        throw new Error("已有一项转交请求等待对方处理，请先撤回或等待响应");
      }
      return { task: dispatch.task, handoff: pendingHandoff };
    }
    const existingCount = await tx.collaborationRequest.count({
      where: { parentRequestId: dispatch.requestId, kind: "SHIP_ORDER_HANDOFF" },
    });
    const handoff = await createCollaborationRequest(tx, {
      organizationId: dispatch.task.organizationId,
      protocol: "warehouse.shipping",
      protocolVersion: 1,
      kind: "SHIP_ORDER_HANDOFF",
      acceptancePolicy: "DIRECT_ACCEPT",
      requester: { type: "USER", ref: input.actorUserId },
      target: { type: "USER", ref: input.targetUserId },
      parentRequestId: dispatch.requestId,
      idempotencyKey: `ship-order:${input.taskId}:handoff:${existingCount + 1}:${input.targetUserId}`,
      payload: {
        taskId: input.taskId,
        locationId: dispatch.task.fulfillmentLocationId,
        fromUserId: dispatch.claimedByUserId,
      },
      createdById: input.actorUserId,
    });
    return { task: dispatch.task, handoff };
  });

  await notifyUser({
    organizationId: result.task.organizationId,
    storeId: result.task.storeId,
    recipientId: input.targetUserId,
    actorId: input.actorUserId,
    taskId: result.task.id,
    refType: "COLLABORATION_REQUEST",
    refId: result.handoff.id,
    type: "TASK_HANDOFF_REQUESTED",
    title: "有人向你转交仓库发货任务",
    body: result.task.title,
    actionUrl: taskActionUrl(result.task.id),
    dedupeKey: `handoff:${result.handoff.id}:${input.targetUserId}`,
  });
  return { outcome: "transfer_pending" as const, requestId: result.handoff.id };
}

export async function acceptShipOrderHandoff(input: {
  requestId: string;
  taskId: string;
  userId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const handoff = await tx.collaborationRequest.findFirst({
      where: {
        id: input.requestId,
        kind: "SHIP_ORDER_HANDOFF",
        targetScopeType: "USER",
        targetScopeRef: input.userId,
        status: "OPEN",
      },
    });
    if (!handoff) throw new Error("转交请求不存在、已处理或不属于你");
    const dispatch = await tx.taskDispatch.findUnique({
      where: { taskId: input.taskId },
      include: { task: true },
    });
    if (!dispatch?.task || dispatch.requestId !== handoff.parentRequestId) {
      throw new Error("转交请求与任务不匹配");
    }
    if (dispatch.status !== "CLAIMED" || !dispatch.claimedByUserId) {
      throw new Error("原任务已经退回、撤回或完成，不能再接受转交");
    }
    await respondToCollaborationRequest(tx, {
      requestId: handoff.id,
      responder: { type: "USER", ref: input.userId },
      decision: "ACCEPT",
      idempotencyKey: `handoff:${handoff.id}:accept:${input.userId}`,
    });
    await closeCollaborationRequest(tx, {
      requestId: handoff.id,
      actor: { type: "USER", ref: input.userId },
      resolutionCode: "HANDOFF_ACCEPTED",
    });
    await tx.taskDispatch.update({
      where: { id: dispatch.id },
      data: { claimedByUserId: input.userId, claimedAt: new Date() },
    });
    await tx.task.update({
      where: { id: input.taskId },
      data: {
        assignedToId: input.userId,
        delegatedToId: input.userId,
        assignedAt: new Date(),
      },
    });
    await tx.notification.updateMany({
      where: { taskId: input.taskId, resolvedAt: null },
      data: {
        resolvedAt: new Date(),
        resolutionCode: "HANDOFF_ACCEPTED",
        resolvedById: input.userId,
      },
    });
    return { outcome: "handoff_accepted" as const };
  });
}

async function hasWarehouseManageCapability(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; locationId: string; userId: string }
) {
  const roster = await tx.locationFulfiller.findFirst({
    where: { ...input, status: "ACTIVE" },
    select: { role: true },
  });
  return roleHasCapability(roster?.role, MANAGE_CAPABILITY);
}

export async function withdrawShipOrderTask(input: {
  taskId: string;
  actorUserId: string;
  reason?: string | null;
}) {
  const reason = input.reason?.trim() || null;
  return prisma.$transaction(async (tx) => {
    const dispatch = await tx.taskDispatch.findUnique({
      where: { taskId: input.taskId },
      include: { task: true, request: true },
    });
    if (!dispatch?.task || !dispatch.task.fulfillmentLocationId) {
      throw new Error("任务派发不存在");
    }
    const membership = await tx.membership.findFirst({
      where: {
        organizationId: dispatch.task.organizationId,
        userId: input.actorUserId,
        status: "ACTIVE",
        role: { in: ["OWNER", "ADMIN", "MANAGER"] },
      },
      select: { id: true },
    });
    const warehouseManager = await hasWarehouseManageCapability(tx, {
      organizationId: dispatch.task.organizationId,
      locationId: dispatch.task.fulfillmentLocationId,
      userId: input.actorUserId,
    });
    if (!membership && !warehouseManager) throw new Error("无权撤回这个仓库任务");
    if (dispatch.task.status === TASK_STATUS.DONE) throw new Error("已完成任务不能撤回");
    if (dispatch.task.status === TASK_STATUS.IN_PROGRESS && !reason) {
      throw new Error("任务已经开始，请填写撤回原因");
    }
    if (dispatch.request.status === "OPEN") {
      await withdrawCollaborationRequest(tx, {
        requestId: dispatch.requestId,
        actor: { type: "USER", ref: input.actorUserId },
        resolutionCode: reason || "WITHDRAWN_BY_MANAGER",
      });
    } else if (dispatch.request.status === "ACCEPTED") {
      await cancelAcceptedCollaborationRequest(tx, {
        requestId: dispatch.requestId,
        actor: { type: "USER", ref: input.actorUserId },
        resolutionCode: reason || "CANCELLED_BY_MANAGER",
      });
    }
    const cancelledAt = new Date();
    const pendingHandoffs = await tx.collaborationRequest.findMany({
      where: {
        parentRequestId: dispatch.requestId,
        kind: "SHIP_ORDER_HANDOFF",
        status: "OPEN",
      },
      select: { id: true },
    });
    await tx.collaborationRequest.updateMany({
      where: { id: { in: pendingHandoffs.map((request) => request.id) } },
      data: {
        status: "CANCELLED",
        cancelledAt,
        resolvedAt: cancelledAt,
        resolutionCode: "PARENT_TASK_CANCELLED",
      },
    });
    for (const handoff of pendingHandoffs) {
      await tx.collaborationEvent.create({
        data: {
          requestId: handoff.id,
          type: "CANCELLED",
          actorScopeType: "USER",
          actorScopeRef: input.actorUserId,
          dedupeKey: "request:cancelled:parent-cancelled",
          payload: { taskId: input.taskId, reason },
        },
      });
    }
    await tx.task.update({
      where: { id: input.taskId },
      data: { status: TASK_STATUS.CANCELLED, cancelledAt },
    });
    await tx.notification.updateMany({
      where: { taskId: input.taskId, resolvedAt: null },
      data: {
        resolvedAt: new Date(),
        resolutionCode: "TASK_CANCELLED",
        resolvedById: input.actorUserId,
      },
    });
    return { outcome: "withdrawn" as const };
  });
}

export async function completeShipOrderDispatchInTransaction(
  tx: Prisma.TransactionClient,
  input: { taskId: string; userId: string }
) {
  let dispatch = await tx.taskDispatch.findUnique({ where: { taskId: input.taskId } });
  if (!dispatch) return null;
  // Internal order shipping already passed the store role and LocationAccess
  // checks in assertCanShipCustomerOrder. Preserve that established path while
  // still recording the same protocol response and event trail as a queue claim.
  if (dispatch.status === "QUEUED") {
    const claimedAt = new Date();
    await tx.taskDispatch.update({
      where: { id: dispatch.id },
      data: {
        status: "CLAIMED",
        claimedByUserId: input.userId,
        claimedAt,
      },
    });
    const responseKey = `dispatch:${dispatch.id}:trusted-claim:${input.userId}`;
    const response = await tx.collaborationResponse.upsert({
      where: {
        requestId_idempotencyKey: {
          requestId: dispatch.requestId,
          idempotencyKey: responseKey,
        },
      },
      update: {},
      create: {
        requestId: dispatch.requestId,
        responderScopeType: "USER",
        responderScopeRef: input.userId,
        decision: "ACCEPT",
        idempotencyKey: responseKey,
        payload: { taskId: input.taskId, source: "AUTHORIZED_INTERNAL_SHIPMENT" },
        respondedAt: claimedAt,
      },
    });
    await tx.collaborationRequest.updateMany({
      where: { id: dispatch.requestId, status: "OPEN" },
      data: {
        status: "ACCEPTED",
        resolvedAt: claimedAt,
        resolutionCode: "AUTHORIZED_INTERNAL_SHIPMENT",
      },
    });
    for (const event of [
      { type: "RESPONSE_RECORDED" as const, key: `response:${response.id}:recorded` },
      { type: "ACCEPTED" as const, key: `request:accepted:dispatch:${dispatch.id}` },
      { type: "TASK_ACCEPTED" as const, key: `dispatch:${dispatch.id}:claimed` },
    ]) {
      await tx.collaborationEvent.upsert({
        where: {
          requestId_dedupeKey: { requestId: dispatch.requestId, dedupeKey: event.key },
        },
        update: {},
        create: {
          requestId: dispatch.requestId,
          responseId: response.id,
          dispatchId: dispatch.id,
          type: event.type,
          actorScopeType: "USER",
          actorScopeRef: input.userId,
          dedupeKey: event.key,
          payload: { source: "AUTHORIZED_INTERNAL_SHIPMENT" },
        },
      });
    }
    dispatch = await tx.taskDispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
  }
  return completeTaskDispatch(tx, {
    dispatchId: dispatch.id,
    userId: input.userId,
    payload: { taskId: input.taskId },
  });
}
