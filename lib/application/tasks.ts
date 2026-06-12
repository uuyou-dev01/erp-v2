import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/application/activity-log";
import { notifyUser } from "@/lib/application/notifications";

export const TASK_STATUS = {
  OPEN: "OPEN",
  ASSIGNED: "ASSIGNED",
  IN_PROGRESS: "IN_PROGRESS",
  DONE: "DONE",
  CANCELLED: "CANCELLED",
  OVERDUE: "OVERDUE",
} as const;

export const TASK_TYPE = {
  LISTING_CREATE: "LISTING_CREATE",
  LISTING_UPDATE: "LISTING_UPDATE",
  PACK_ORDER: "PACK_ORDER",
  SHIP_ORDER: "SHIP_ORDER",
  CONFIRM_ARRIVAL: "CONFIRM_ARRIVAL",
  INSPECT_ITEM: "INSPECT_ITEM",
  SETTLE_ORDER: "SETTLE_ORDER",
  RESOLVE_EXCEPTION: "RESOLVE_EXCEPTION",
} as const;

export const INCOMPLETE_TASK_STATUSES = [
  TASK_STATUS.OPEN,
  TASK_STATUS.ASSIGNED,
  TASK_STATUS.IN_PROGRESS,
  TASK_STATUS.OVERDUE,
] as const;

export async function createTask(input: {
  organizationId: string;
  storeId: string;
  type: string;
  title: string;
  description?: string | null;
  refType: string;
  refId: string;
  createdById: string;
  assignedToId?: string | null;
  dueAt?: Date | null;
  metadata?: unknown;
}) {
  const task = await prisma.task.create({
    data: {
      organizationId: input.organizationId,
      storeId: input.storeId,
      type: input.type,
      status: input.assignedToId ? TASK_STATUS.ASSIGNED : TASK_STATUS.OPEN,
      title: input.title,
      description: input.description,
      refType: input.refType,
      refId: input.refId,
      createdById: input.createdById,
      assignedToId: input.assignedToId,
      delegatedToId: input.assignedToId,
      assignedAt: input.assignedToId ? new Date() : null,
      dueAt: input.dueAt,
      metadata:
        input.metadata === undefined
          ? Prisma.JsonNull
          : (input.metadata as Prisma.InputJsonValue),
    },
  });

  if (input.assignedToId) {
    await notifyUser({
      organizationId: input.organizationId,
      storeId: input.storeId,
      recipientId: input.assignedToId,
      actorId: input.createdById,
      taskId: task.id,
      refType: input.refType,
      refId: input.refId,
      type: "TASK_ASSIGNED",
      title: "你有一个新的任务",
      body: input.title,
    });
  }

  return task;
}

export async function createTaskIfMissing(input: {
  organizationId: string;
  storeId: string;
  type: string;
  title: string;
  description?: string | null;
  refType: string;
  refId: string;
  createdById: string;
  assignedToId?: string | null;
  dueAt?: Date | null;
  metadata?: unknown;
}) {
  const existing = await prisma.task.findFirst({
    where: {
      organizationId: input.organizationId,
      storeId: input.storeId,
      type: input.type,
      refType: input.refType,
      refId: input.refId,
      status: {
        in: [...INCOMPLETE_TASK_STATUSES],
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (existing) return existing;

  return createTask(input);
}

export async function assignTask(input: {
  taskId: string;
  assignedToId: string;
  actorId: string;
  organizationId: string;
}) {
  const task = await prisma.task.update({
    where: { id: input.taskId },
    data: {
      assignedToId: input.assignedToId,
      delegatedToId: input.assignedToId,
      assignedAt: new Date(),
      status: TASK_STATUS.ASSIGNED,
    },
  });

  await notifyUser({
    organizationId: input.organizationId,
    storeId: task.storeId,
    recipientId: input.assignedToId,
    actorId: input.actorId,
    taskId: task.id,
    refType: task.refType,
    refId: task.refId,
    type: "TASK_ASSIGNED",
    title: "你有一个新的任务",
    body: task.title,
  });

  await logActivity({
    organizationId: input.organizationId,
    storeId: task.storeId,
    actorId: input.actorId,
    action: "TASK_ASSIGNED",
    refType: task.refType,
    refId: task.refId,
    taskId: task.id,
    after: { assignedToId: input.assignedToId },
    message: task.title,
  });

  return task;
}

export async function startTask(input: { taskId: string; actorId: string }) {
  return prisma.task.update({
    where: { id: input.taskId },
    data: {
      status: TASK_STATUS.IN_PROGRESS,
      startedAt: new Date(),
    },
  });
}

export async function completeTask(input: {
  taskId: string;
  completedById: string;
}) {
  const task = await prisma.task.update({
    where: { id: input.taskId },
    data: {
      status: TASK_STATUS.DONE,
      completedById: input.completedById,
      completedAt: new Date(),
    },
  });

  await notifyUser({
    organizationId: task.organizationId,
    storeId: task.storeId,
    recipientId: task.createdById,
    actorId: input.completedById,
    taskId: task.id,
    refType: task.refType,
    refId: task.refId,
    type: "TASK_DONE",
    title: "任务已完成",
    body: task.title,
  });

  return task;
}

export async function completeTasksForRef(input: {
  organizationId: string;
  storeId: string;
  type: string;
  refType: string;
  refId: string;
  completedById: string;
}) {
  const tasks = await prisma.task.findMany({
    where: {
      organizationId: input.organizationId,
      storeId: input.storeId,
      type: input.type,
      refType: input.refType,
      refId: input.refId,
      status: {
        in: [...INCOMPLETE_TASK_STATUSES],
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const completed = [];
  for (const task of tasks) {
    completed.push(
      await completeTask({
        taskId: task.id,
        completedById: input.completedById,
      })
    );
  }

  return completed;
}

export async function cancelTask(input: {
  taskId: string;
  actorId: string;
  reason?: string | null;
}) {
  const task = await prisma.task.update({
    where: { id: input.taskId },
    data: {
      status: TASK_STATUS.CANCELLED,
      cancelledAt: new Date(),
    },
  });

  await logActivity({
    organizationId: task.organizationId,
    storeId: task.storeId,
    actorId: input.actorId,
    action: "TASK_CANCELLED",
    refType: task.refType,
    refId: task.refId,
    taskId: task.id,
    message: input.reason ?? task.title,
  });

  return task;
}
