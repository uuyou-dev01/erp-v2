import { prisma } from "@/lib/prisma";
import {
  notificationDeliveryTime,
  processNotificationOutbox,
} from "@/lib/mobile/notification-outbox";
import { Prisma } from "@prisma/client";

export const NOTIFICATION_RESOLUTION = {
  INFORMATIONAL: "INFORMATIONAL",
  TASK_STARTED: "TASK_STARTED",
  TASK_COMPLETED: "TASK_COMPLETED",
  TASK_CANCELLED: "TASK_CANCELLED",
  TASK_REASSIGNED: "TASK_REASSIGNED",
  CONNECTION_ACCEPTED: "CONNECTION_ACCEPTED",
  CONNECTION_REJECTED: "CONNECTION_REJECTED",
  CONNECTION_ENDED: "CONNECTION_ENDED",
  AGREEMENT_ACCEPTED: "AGREEMENT_ACCEPTED",
  AGREEMENT_ENDED: "AGREEMENT_ENDED",
} as const;

type NotificationResolutionCode =
  (typeof NOTIFICATION_RESOLUTION)[keyof typeof NOTIFICATION_RESOLUTION];

export function taskNotificationResolution(input: {
  notificationType: string;
  recipientId: string;
  status: string;
  assignedToId?: string | null;
  completedById?: string | null;
}) {
  if (input.notificationType === "TASK_DONE" && input.status === "DONE") {
    return {
      resolutionCode: NOTIFICATION_RESOLUTION.TASK_COMPLETED,
      resolvedById: input.completedById ?? null,
    };
  }
  if (input.notificationType !== "TASK_ASSIGNED") return null;
  if (input.status === "DONE") {
    return {
      resolutionCode: NOTIFICATION_RESOLUTION.TASK_COMPLETED,
      resolvedById: input.completedById ?? null,
    };
  }
  if (input.status === "CANCELLED") {
    return { resolutionCode: NOTIFICATION_RESOLUTION.TASK_CANCELLED, resolvedById: null };
  }
  if (input.assignedToId !== input.recipientId) {
    return { resolutionCode: NOTIFICATION_RESOLUTION.TASK_REASSIGNED, resolvedById: null };
  }
  if (input.status === "IN_PROGRESS") {
    return {
      resolutionCode: NOTIFICATION_RESOLUTION.TASK_STARTED,
      resolvedById: input.assignedToId,
    };
  }
  return null;
}

function connectionResolution(input: { status: string; respondedById?: string | null }) {
  if (input.status === "ACTIVE") {
    return {
      resolutionCode: NOTIFICATION_RESOLUTION.CONNECTION_ACCEPTED,
      resolvedById: input.respondedById ?? null,
    };
  }
  if (input.status === "REJECTED") {
    return {
      resolutionCode: NOTIFICATION_RESOLUTION.CONNECTION_REJECTED,
      resolvedById: input.respondedById ?? null,
    };
  }
  if (input.status === "ENDED") {
    return {
      resolutionCode: NOTIFICATION_RESOLUTION.CONNECTION_ENDED,
      resolvedById: input.respondedById ?? null,
    };
  }
  return null;
}

function serviceAgreementResolution(input: { status: string; acceptedById?: string | null }) {
  if (input.status === "ACTIVE") {
    return {
      resolutionCode: NOTIFICATION_RESOLUTION.AGREEMENT_ACCEPTED,
      resolvedById: input.acceptedById ?? null,
    };
  }
  if (input.status === "ENDED") {
    return {
      resolutionCode: NOTIFICATION_RESOLUTION.AGREEMENT_ENDED,
      resolvedById: null,
    };
  }
  return null;
}

export function shouldSkipNotification(input: {
  recipientId: string;
  actorId?: string | null;
  type: string;
}) {
  return Boolean(
    input.actorId && input.actorId === input.recipientId && input.type === "TASK_DONE"
  );
}

export async function notifyUser(input: {
  organizationId: string;
  storeId?: string | null;
  recipientId: string;
  actorId?: string | null;
  taskId?: string | null;
  refType?: string | null;
  refId?: string | null;
  type: string;
  title: string;
  body?: string | null;
  actionUrl?: string | null;
  priority?: "LOW" | "NORMAL" | "HIGH";
  dedupeKey?: string | null;
}) {
  if (shouldSkipNotification(input)) {
    return null;
  }

  const actionUrl =
    input.actionUrl ||
    (input.taskId ? `/m/tasks/${encodeURIComponent(input.taskId)}` : "/m/notifications");
  const informationalTypes = new Set([
    "TASK_DONE",
    "LOCATION_ACCESS_ADDED",
    "ORGANIZATION_CONNECTION_ACCEPTED",
    "ORGANIZATION_CONNECTION_REJECTED",
    "ORGANIZATION_CONNECTION_ENDED",
    "SERVICE_AGREEMENT_ACCEPTED",
    "SERVICE_AGREEMENT_RESUMED",
    "SERVICE_AGREEMENT_PAUSED",
    "SERVICE_AGREEMENT_ENDED",
    "SUPPLY_OFFER_STATUS_CHANGED",
    "FULFILLMENT_STATUS_CHANGED",
    "SETTLEMENT_STATUS_CHANGED",
    "MEMBERSHIP_ACCESS_CHANGED",
    "MEMBERSHIP_DEACTIVATED",
  ]);
  const informational = informationalTypes.has(input.type);
  if (input.dedupeKey) {
    const existing = await prisma.notification.findUnique({
      where: {
        recipientId_dedupeKey: {
          recipientId: input.recipientId,
          dedupeKey: input.dedupeKey,
        },
      },
    });
    if (existing) return existing;
  }
  const preference = await prisma.notificationPreference.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.recipientId,
      },
    },
  });
  const nextAttemptAt = notificationDeliveryTime({
    now: new Date(),
    digestMode: preference?.digestMode,
    quietStart: preference?.quietStart,
    quietEnd: preference?.quietEnd,
  });
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const notification = await tx.notification.create({
        data: {
          organizationId: input.organizationId,
          storeId: input.storeId,
          recipientId: input.recipientId,
          actorId: input.actorId,
          taskId: input.taskId,
          refType: input.refType,
          refId: input.refId,
          type: input.type,
          title: input.title,
          body: input.body,
          actionUrl,
          priority: input.priority ?? "NORMAL",
          dedupeKey: input.dedupeKey,
          resolvedAt: informational ? new Date() : null,
          resolutionCode: informational ? NOTIFICATION_RESOLUTION.INFORMATIONAL : null,
          resolvedById: informational ? input.actorId : null,
        },
      });
      const outbox = await tx.notificationOutbox.create({
        data: {
          notificationId: notification.id,
          organizationId: input.organizationId,
          userId: input.recipientId,
          nextAttemptAt,
        },
      });
      return { notification, outbox };
    });
  } catch (error) {
    if (
      input.dedupeKey &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return prisma.notification.findUniqueOrThrow({
        where: {
          recipientId_dedupeKey: {
            recipientId: input.recipientId,
            dedupeKey: input.dedupeKey,
          },
        },
      });
    }
    throw error;
  }
  if (nextAttemptAt <= new Date()) {
    void processNotificationOutbox({ ids: [result.outbox.id] }).catch(() => undefined);
  }
  return result.notification;
}

export async function resolveNotification(input: {
  notificationId: string;
  recipientId: string;
  organizationId?: string;
  resolutionCode: NotificationResolutionCode | string;
  resolvedById?: string | null;
  resolvedAt?: Date;
}) {
  return prisma.notification.updateMany({
    where: {
      id: input.notificationId,
      recipientId: input.recipientId,
      resolvedAt: null,
      ...(input.organizationId ? { organizationId: input.organizationId } : {}),
    },
    data: {
      resolvedAt: input.resolvedAt ?? new Date(),
      resolutionCode: input.resolutionCode,
      resolvedById: input.resolvedById ?? null,
    },
  });
}

/**
 * Repairs notification lifecycle state from the source-of-truth workflow records.
 * This keeps older notifications useful after a task or connection was handled by
 * another screen, without conflating that business outcome with whether it was read.
 */
export async function reconcileNotificationResolutions(recipientId: string) {
  const notifications = await prisma.notification.findMany({
    where: {
      recipientId,
      resolvedAt: null,
      OR: [
        { taskId: { not: null } },
        { refType: "ORGANIZATION_CONNECTION", refId: { not: null } },
        { refType: "SERVICE_AGREEMENT", refId: { not: null } },
      ],
    },
    select: { id: true, type: true, taskId: true, refType: true, refId: true },
  });
  if (!notifications.length) return 0;

  const taskIds = Array.from(
    new Set(notifications.map((notification) => notification.taskId).filter(Boolean))
  ) as string[];
  const connectionIds = Array.from(
    new Set(
      notifications
        .filter((notification) => notification.refType === "ORGANIZATION_CONNECTION")
        .map((notification) => notification.refId)
        .filter(Boolean)
    )
  ) as string[];
  const agreementIds = Array.from(
    new Set(
      notifications
        .filter((notification) => notification.refType === "SERVICE_AGREEMENT")
        .map((notification) => notification.refId)
        .filter(Boolean)
    )
  ) as string[];
  const [tasks, connections, agreements] = await Promise.all([
    taskIds.length
      ? prisma.task.findMany({
          where: { id: { in: taskIds } },
          select: { id: true, status: true, assignedToId: true, completedById: true },
        })
      : [],
    connectionIds.length
      ? prisma.organizationConnection.findMany({
          where: { id: { in: connectionIds } },
          select: { id: true, status: true, respondedById: true },
        })
      : [],
    agreementIds.length
      ? prisma.serviceAgreement.findMany({
          where: { id: { in: agreementIds } },
          select: { id: true, status: true, acceptedById: true },
        })
      : [],
  ]);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const connectionById = new Map(connections.map((connection) => [connection.id, connection]));
  const agreementById = new Map(agreements.map((agreement) => [agreement.id, agreement]));
  const resolvedAt = new Date();
  const updates = notifications.flatMap((notification) => {
    const task = notification.taskId ? taskById.get(notification.taskId) : null;
    const resolution = task
      ? taskNotificationResolution({
          notificationType: notification.type,
          recipientId,
          ...task,
        })
      : notification.refType === "ORGANIZATION_CONNECTION" && notification.refId
        ? connectionResolution(connectionById.get(notification.refId) ?? { status: "PENDING" })
        : notification.refType === "SERVICE_AGREEMENT" && notification.refId
          ? serviceAgreementResolution(
              agreementById.get(notification.refId) ?? { status: "PENDING_COUNTERPARTY" }
            )
          : null;
    return resolution
      ? [
          prisma.notification.updateMany({
            where: { id: notification.id, recipientId, resolvedAt: null },
            data: { ...resolution, resolvedAt },
          }),
        ]
      : [];
  });
  if (!updates.length) return 0;
  const results = await prisma.$transaction(updates);
  return results.reduce((count, result) => count + result.count, 0);
}

export async function getUnreadNotificationCount(userId: string, organizationId: string) {
  return prisma.notification.count({
    where: {
      recipientId: userId,
      organizationId,
      readAt: null,
    },
  });
}

export async function markNotificationRead(input: {
  notificationId: string;
  recipientId: string;
  organizationId: string;
}) {
  return prisma.notification.updateMany({
    where: {
      id: input.notificationId,
      recipientId: input.recipientId,
      organizationId: input.organizationId,
    },
    data: { readAt: new Date() },
  });
}
