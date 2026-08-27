import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/application/activity-log";
import { notifyUser } from "@/lib/application/notifications";
import { taskActionUrlForAssignee } from "@/lib/application/location-fulfillment-roster";
import { recordWork, type RecordWorkInput } from "@/lib/application/work-records";

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
  FILL_LOGISTICS: "FILL_LOGISTICS",
  DISPOSITION: "DISPOSITION",
  INBOUND: "INBOUND",
  CONFIRM_ORDER: "CONFIRM_ORDER",
  CONFIRM_DELIVERY: "CONFIRM_DELIVERY",
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
  fulfillmentLocationId?: string | null;
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
      fulfillmentLocationId: input.fulfillmentLocationId,
      delegatedToId: input.assignedToId,
      assignedAt: input.assignedToId ? new Date() : null,
      dueAt: input.dueAt,
      metadata:
        input.metadata === undefined ? Prisma.JsonNull : (input.metadata as Prisma.InputJsonValue),
    },
  });

  if (input.assignedToId) {
    const actionUrl = await taskActionUrlForAssignee({
      taskId: task.id,
      storeId: input.storeId,
      assignedToId: input.assignedToId,
      fulfillmentLocationId: input.fulfillmentLocationId,
    });
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
      actionUrl,
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
  fulfillmentLocationId?: string | null;
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
  fulfillmentLocationId?: string | null;
}) {
  const task = await prisma.task.update({
    where: { id: input.taskId },
    data: {
      assignedToId: input.assignedToId,
      delegatedToId: input.assignedToId,
      assignedAt: new Date(),
      status: TASK_STATUS.ASSIGNED,
      ...(input.fulfillmentLocationId !== undefined
        ? { fulfillmentLocationId: input.fulfillmentLocationId }
        : {}),
    },
  });

  const actionUrl = await taskActionUrlForAssignee({
    taskId: task.id,
    storeId: task.storeId,
    assignedToId: input.assignedToId,
    fulfillmentLocationId: task.fulfillmentLocationId,
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
    actionUrl,
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

type TaskWorkInput = Pick<RecordWorkInput, "code" | "name" | "quantity" | "unit" | "metadata">;

type TaskMutationClient = Pick<
  Prisma.TransactionClient,
  "task" | "membership" | "locationFulfiller" | "workType" | "workRecord"
>;

function workFromTaskMetadata(metadata: unknown): TaskWorkInput | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const work = (metadata as Record<string, unknown>).work;
  if (!work || typeof work !== "object" || Array.isArray(work)) return null;
  const value = work as Record<string, unknown>;
  if (
    typeof value.code !== "string" ||
    typeof value.name !== "string" ||
    (typeof value.quantity !== "string" && typeof value.quantity !== "number") ||
    typeof value.unit !== "string"
  ) {
    return null;
  }
  return {
    code: value.code,
    name: value.name,
    quantity: value.quantity,
    unit: value.unit,
    metadata:
      value.metadata && typeof value.metadata === "object"
        ? (value.metadata as Prisma.InputJsonValue)
        : undefined,
  };
}

async function resolveTaskWorkRelationship(
  client: TaskMutationClient,
  input: {
    organizationId: string;
    createdById: string;
    completedById: string;
    fulfillmentLocationId: string | null;
  }
) {
  const memberships = await client.membership.findMany({
    where: { userId: input.completedById, status: "ACTIVE" },
    select: { organizationId: true },
    orderBy: { createdAt: "asc" },
  });
  const isCommissioningMember = memberships.some(
    (membership) => membership.organizationId === input.organizationId
  );
  const warehouseRoster = input.fulfillmentLocationId
    ? await client.locationFulfiller.findFirst({
        where: {
          organizationId: input.organizationId,
          locationId: input.fulfillmentLocationId,
          userId: input.completedById,
          status: "ACTIVE",
        },
        select: { id: true },
      })
    : null;
  const executorOrganizationId =
    memberships.find((membership) => membership.organizationId !== input.organizationId)
      ?.organizationId ?? (isCommissioningMember ? input.organizationId : null);

  return {
    relationshipType:
      input.completedById === input.createdById
        ? ("SELF" as const)
        : isCommissioningMember
          ? ("MEMBER" as const)
          : warehouseRoster
            ? ("WAREHOUSE_COLLABORATOR" as const)
            : executorOrganizationId
              ? ("PARTNER_ORGANIZATION" as const)
              : ("UNKNOWN" as const),
    executorOrganizationId,
  };
}

export async function completeTaskInTransaction(
  client: TaskMutationClient,
  input: {
    taskId: string;
    completedById: string;
    work?: TaskWorkInput;
  }
) {
  const task = await client.task.update({
    where: { id: input.taskId },
    data: {
      status: TASK_STATUS.DONE,
      completedById: input.completedById,
      completedAt: new Date(),
    },
  });

  const work = input.work ??
    workFromTaskMetadata(task.metadata) ?? {
      code: task.type,
      name: task.type,
      quantity: 1,
      unit: "次",
    };
  const relationship = await resolveTaskWorkRelationship(client, {
    organizationId: task.organizationId,
    createdById: task.createdById,
    completedById: input.completedById,
    fulfillmentLocationId: task.fulfillmentLocationId,
  });
  await recordWork(client, {
    organizationId: task.organizationId,
    storeId: task.storeId,
    userId: input.completedById,
    taskId: task.id,
    sourceType: task.refType,
    sourceId: task.refId,
    relationshipType: relationship.relationshipType,
    locationId: task.fulfillmentLocationId,
    executorOrganizationId: relationship.executorOrganizationId,
    dedupeKey: `TASK_DONE:${task.id}`,
    occurredAt: task.completedAt ?? new Date(),
    ...work,
  });

  return task;
}

export async function completeTask(input: {
  taskId: string;
  completedById: string;
  work?: TaskWorkInput;
}) {
  const task = await prisma.$transaction((tx) => completeTaskInTransaction(tx, input));

  await notifyTaskCompleted(task, input.completedById);

  return task;
}

export async function notifyTaskCompleted(
  task: {
    id: string;
    organizationId: string;
    storeId: string;
    createdById: string;
    refType: string;
    refId: string;
    title: string;
  },
  completedById: string
) {
  return notifyUser({
    organizationId: task.organizationId,
    storeId: task.storeId,
    recipientId: task.createdById,
    actorId: completedById,
    taskId: task.id,
    refType: task.refType,
    refId: task.refId,
    type: "TASK_DONE",
    title: "任务已完成",
    body: task.title,
  });
}

export async function completeTasksForRef(input: {
  organizationId: string;
  storeId: string;
  type: string;
  refType: string;
  refId: string;
  completedById: string;
  work?: TaskWorkInput;
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
        work: input.work,
      })
    );
  }

  return completed;
}

export async function completeTasksForRefInTransaction(
  client: TaskMutationClient,
  input: {
    organizationId: string;
    storeId: string;
    type: string;
    refType: string;
    refId: string;
    completedById: string;
    work?: TaskWorkInput;
  }
) {
  const tasks = await client.task.findMany({
    where: {
      organizationId: input.organizationId,
      storeId: input.storeId,
      type: input.type,
      refType: input.refType,
      refId: input.refId,
      status: { in: [...INCOMPLETE_TASK_STATUSES] },
    },
    orderBy: { createdAt: "asc" },
  });

  const completed = [];
  for (const task of tasks) {
    completed.push(
      await completeTaskInTransaction(client, {
        taskId: task.id,
        completedById: input.completedById,
        work: input.work,
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
