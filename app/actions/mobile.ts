"use server";

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserContext } from "@/lib/auth/user-context";
import { getMobileTask } from "@/lib/mobile/tasks";
import { getMobileActionPolicy } from "@/lib/mobile/action-policy";
import {
  completeTask,
  createTaskIfMissing,
  INCOMPLETE_TASK_STATUSES,
  TASK_TYPE,
} from "@/lib/application/tasks";
import {
  submitConfirmArrival,
  submitConfirmDelivery,
  submitConfirmOrder,
  submitConsolidatePurchase,
  submitFillLogistics,
  submitInbound,
  submitShipOrder,
  submitRegisterReturn,
  submitApproveReturnInspection,
  submitTransferPurchase,
  type ConfirmArrivalPayload,
  type FillLogisticsPayload,
  type InboundPayload,
  type ShipOrderPayload,
} from "@/app/actions/workflow-actions";
import { assignWorkTask } from "@/app/actions/tasks";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { requireActiveCompanionDevice } from "@/lib/mobile/device-auth";
import { assertMobileRateLimit } from "@/lib/mobile/rate-limit";

export interface ExecuteMobileTaskInput {
  taskId: string;
  action: string;
  expectedVersion: string;
  idempotencyKey: string;
  fields: Record<string, string | boolean | string[] | undefined>;
  confirmation?: { acceptedImpact?: boolean };
}

const REF_TYPE_BY_ENTITY = {
  customerOrder: "CUSTOMER_ORDER",
  listing: "LISTING",
  purchaseOrder: "PURCHASE_ORDER",
  shipment: "INBOUND_SHIPMENT",
  sku: "SKU",
  itemUnit: "ITEM_UNIT",
  inventoryLot: "INVENTORY_LOT",
  quickEntry: "QUICK_ENTRY",
} as const;

const TASK_TYPE_BY_ACTION: Record<string, string> = {
  fillLogistics: TASK_TYPE.FILL_LOGISTICS,
  receivePurchase: TASK_TYPE.CONFIRM_ARRIVAL,
  confirmArrival: TASK_TYPE.CONFIRM_ARRIVAL,
  disposition: TASK_TYPE.DISPOSITION,
  inbound: TASK_TYPE.INBOUND,
  confirmOrder: TASK_TYPE.CONFIRM_ORDER,
  shipOrder: TASK_TYPE.SHIP_ORDER,
  confirmDelivery: TASK_TYPE.CONFIRM_DELIVERY,
  approveReturnInspection: TASK_TYPE.INSPECT_ITEM,
  registerReturn: TASK_TYPE.RESOLVE_EXCEPTION,
  resolveException: TASK_TYPE.RESOLVE_EXCEPTION,
  createListing: TASK_TYPE.LISTING_CREATE,
};

async function ensureMobileTask(workItemId: string) {
  const current = await getMobileTask(workItemId);
  if (!current) throw new Error("任务不存在、已处理或无权访问");
  if (current.summary.taskId) return { current, taskId: current.summary.taskId };
  const context = await requireUserContext();
  const task = await createTaskIfMissing({
    organizationId: context.organizationId,
    storeId: context.activeStoreId,
    type: TASK_TYPE_BY_ACTION[current.summary.primaryAction] ?? current.summary.primaryAction,
    title: `${current.summary.primaryActionLabel} · ${current.summary.title}`,
    description: current.summary.subtitle,
    refType: REF_TYPE_BY_ENTITY[current.summary.entityType],
    refId: current.summary.entityId,
    createdById: context.userId,
    metadata: { source: "MOBILE_COMPANION", workItemId: current.summary.id },
  });
  return { current, taskId: task.id };
}

function requestHash(input: ExecuteMobileTaskInput) {
  return createHash("sha256")
    .update(JSON.stringify({ taskId: input.taskId, action: input.action, fields: input.fields, confirmation: input.confirmation }))
    .digest("hex");
}

async function finishAttachedTask(taskId: string | null, userId: string) {
  if (!taskId) return;
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { status: true } });
  if (!task || !INCOMPLETE_TASK_STATUSES.includes(task.status as never)) return;
  await completeTask({ taskId, completedById: userId });
}

async function executeDomainAction(input: ExecuteMobileTaskInput) {
  const current = await getMobileTask(input.taskId);
  if (!current) throw new Error("该任务已发生变化或已被处理，请刷新后再处理");
  if (current.expectedVersion !== input.expectedVersion) {
    throw new Error("该任务已发生变化，请刷新后再处理");
  }
  if (current.summary.primaryAction !== input.action) {
    throw new Error("当前节点已变化，原操作不再可用");
  }
  const policy = getMobileActionPolicy(current.summary.primaryAction);
  if (!policy.enabled) throw new Error("该操作暂不支持在手机完成，请使用 PC 处理");
  if (policy.requiresSecondConfirm && !input.confirmation?.acceptedImpact) {
    throw new Error("请确认已经核对业务影响");
  }

  const fields = input.fields;
  if (policy.requiredEvidence?.includes("PHOTO") && !((fields.imageUrls as string[] | undefined)?.length)) {
    throw new Error("该节点必须上传至少一张凭证照片");
  }
  const assetIds = (fields.assetIds as string[] | undefined)?.filter(Boolean) ?? [];
  if (assetIds.length) {
    const context = await requireUserContext();
    const uniqueAssetIds = [...new Set(assetIds)];
    const readyAssets = await prisma.mobileAsset.count({
      where: {
        id: { in: uniqueAssetIds },
        organizationId: context.organizationId,
        userId: context.userId,
        status: "READY",
      },
    });
    if (readyAssets !== uniqueAssetIds.length) {
      throw new Error("部分凭证文件不存在、未上传完成或无权使用");
    }
  }
  if ((input.action === "confirmArrival" || input.action === "receivePurchase") && fields.isComplete === false && !((fields.imageUrls as string[] | undefined)?.length)) {
    throw new Error("部分或异常到货必须上传现场照片");
  }
  if (input.action === "shipOrder" && !((fields.imageUrls as string[] | undefined)?.length)) {
    throw new Error("确认发货必须上传至少一张凭证照片");
  }
  if (input.action === "fillLogistics") {
    await submitFillLogistics(current.summary.entityType, current.summary.entityId, fields as FillLogisticsPayload);
  } else if (input.action === "confirmArrival" || input.action === "receivePurchase") {
    await submitConfirmArrival(current.summary.entityType, current.summary.entityId, fields as ConfirmArrivalPayload);
  } else if (input.action === "shipOrder") {
    await submitShipOrder(current.summary.entityId, fields as ShipOrderPayload);
  } else if (input.action === "inbound") {
    await submitInbound(current.summary.entityType, current.summary.entityId, fields as InboundPayload);
  } else if (input.action === "disposition") {
    const mode = String(fields.mode || "inbound");
    if (mode === "inbound") {
      await submitInbound(current.summary.entityType, current.summary.entityId, fields as InboundPayload);
    } else if (mode === "consolidate") {
      await submitConsolidatePurchase(current.summary.entityType, current.summary.entityId, {
        batchMode: "existing",
        batchId: String(fields.batchId || ""),
        note: String(fields.note || ""),
      });
    } else {
      await submitTransferPurchase(current.summary.entityType, current.summary.entityId, {
        toLocationId: String(fields.toLocationId || ""),
        trackingNo: String(fields.trackingNo || ""),
        carrier: String(fields.carrier || ""),
        note: String(fields.note || ""),
      });
    }
  } else if (input.action === "confirmDelivery") {
    await submitConfirmDelivery(current.summary.entityId);
  } else if (input.action === "confirmOrder") {
    await submitConfirmOrder(current.summary.entityId);
  } else if (input.action === "registerReturn") {
    await submitRegisterReturn(current.summary.entityId, {
      note: String(fields.note || ""),
      returnTrackingNo: String(fields.returnTrackingNo || ""),
      restockMode: fields.restockMode === "AVAILABLE" ? "AVAILABLE" : "RETURN_CHECK",
      refundAmount: String(fields.refundAmount || ""),
      platformFeeReversal: String(fields.platformFeeReversal || ""),
      shippingFeeReversal: String(fields.shippingFeeReversal || ""),
    });
  } else if (input.action === "approveReturnInspection") {
    await submitApproveReturnInspection(current.summary.entityId, { note: String(fields.note || "") });
  } else {
    throw new Error("该移动操作尚未实现");
  }

  return current;
}

export async function executeMobileTaskAction(input: ExecuteMobileTaskInput) {
  const activeDevice = await requireActiveCompanionDevice();
  await assertMobileRateLimit({ organizationId: activeDevice.context.organizationId, subjectId: activeDevice.device.id, key: "task-action", limit: 90 });
  const context = await requireUserContext();
  if (!input.idempotencyKey.trim()) throw new Error("缺少操作幂等键");
  const hash = requestHash(input);
  const existing = await prisma.mobileActionRequest.findUnique({
    where: {
      organizationId_userId_idempotencyKey: {
        organizationId: context.organizationId,
        userId: context.userId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
  if (existing) {
    if (existing.requestHash !== hash) throw new Error("幂等键已用于其他操作");
    if (existing.status === "COMPLETED") return existing.responsePayload;
    if (existing.status === "DOMAIN_COMPLETED") {
      await finishAttachedTask(existing.taskId, context.userId);
      await prisma.mobileActionRequest.update({
        where: { id: existing.id },
        data: { status: "COMPLETED", errorMessage: null },
      });
      return existing.responsePayload;
    }
    if (existing.status === "PROCESSING") throw new Error("操作正在处理中，请勿重复提交");
  }

  const request = existing
    ? await prisma.mobileActionRequest.update({
        where: { id: existing.id },
        data: { status: "PROCESSING", errorMessage: null },
      })
    : await prisma.mobileActionRequest.create({
        data: {
          organizationId: context.organizationId,
          userId: context.userId,
          idempotencyKey: input.idempotencyKey,
          taskId: null,
          workItemId: input.taskId,
          action: input.action,
          requestHash: hash,
          requestPayload: input as unknown as Prisma.InputJsonValue,
        },
      });

  try {
    const current = await executeDomainAction(input);
    const response = {
      success: true,
      message: `${current.summary.primaryActionLabel}已完成`,
      taskId: current.summary.taskId,
      workItemId: current.summary.id,
    };
    await prisma.mobileActionRequest.update({
      where: { id: request.id },
      data: {
        taskId: current.summary.taskId,
        status: "DOMAIN_COMPLETED",
        responsePayload: response as Prisma.InputJsonValue,
      },
    });
    await finishAttachedTask(current.summary.taskId, context.userId);
    await prisma.mobileActionRequest.update({
      where: { id: request.id },
      data: { status: "COMPLETED", errorMessage: null },
    });
    revalidatePath("/m");
    revalidatePath("/m/tasks");
    revalidatePath(`/m/tasks/${encodeURIComponent(input.taskId)}`);
    return response;
  } catch (error) {
    const latest = await prisma.mobileActionRequest.findUnique({ where: { id: request.id }, select: { status: true } });
    if (latest?.status !== "DOMAIN_COMPLETED") {
      await prisma.mobileActionRequest.update({
        where: { id: request.id },
        data: {
          status: "FAILED",
          errorMessage: error instanceof Error ? error.message : "移动操作失败",
        },
      });
    }
    throw error;
  }
}

export async function executeMobileTaskActionResult(input: ExecuteMobileTaskInput) {
  try {
    const result = await executeMobileTaskAction(input);
    return actionSuccess({ result });
  } catch (error) {
    return toActionFailure(error, "操作失败，请重试");
  }
}

export async function assignMobileTaskAction(
  taskId: string,
  assignedToId: string,
  options?: { dueAt?: string; note?: string }
) {
  try {
    await requireActiveCompanionDevice();
    const persisted = await ensureMobileTask(taskId);
    await assignWorkTask(persisted.taskId, assignedToId);
    const dueAt = options?.dueAt?.trim() ? new Date(options.dueAt) : null;
    if (dueAt && Number.isNaN(dueAt.getTime())) throw new Error("截止时间格式不正确");
    if (dueAt || options?.note?.trim()) {
      await prisma.task.update({
        where: { id: persisted.taskId },
        data: {
          dueAt: dueAt ?? undefined,
          description: options?.note?.trim() || undefined,
        },
      });
    }
    revalidatePath("/m");
    revalidatePath("/m/tasks");
    revalidatePath(`/m/tasks/${encodeURIComponent(taskId)}`);
    return actionSuccess({ taskId: persisted.taskId });
  } catch (error) {
    return toActionFailure(error, "委托失败，请重试");
  }
}

export async function startMobileTaskAction(taskId: string) {
  try {
    await requireActiveCompanionDevice();
    const context = await requireUserContext();
    const persisted = await ensureMobileTask(taskId);
    const task = await prisma.task.findFirst({ where: { id: persisted.taskId, organizationId: context.organizationId } });
    if (!task) throw new Error("任务不存在或无权访问");
    if (task.assignedToId && task.assignedToId !== context.userId) throw new Error("该任务已指派给其他成员");
    await prisma.task.update({
      where: { id: task.id },
      data: { assignedToId: context.userId, delegatedToId: context.userId, assignedAt: task.assignedAt ?? new Date(), startedAt: new Date(), status: "IN_PROGRESS" },
    });
    revalidatePath("/m");
    revalidatePath("/m/tasks");
    revalidatePath(`/m/tasks/${encodeURIComponent(taskId)}`);
    return actionSuccess({ taskId: task.id });
  } catch (error) {
    return toActionFailure(error, "开始任务失败，请重试");
  }
}
