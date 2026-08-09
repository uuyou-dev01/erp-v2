import { prisma } from "@/lib/prisma";
import { notificationDeliveryTime, processNotificationOutbox } from "@/lib/mobile/notification-outbox";
import { Prisma } from "@prisma/client";

export function shouldSkipNotification(input: {
  recipientId: string;
  actorId?: string | null;
  type: string;
}) {
  return Boolean(
    input.actorId &&
      input.actorId === input.recipientId &&
      input.type === "TASK_DONE"
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

  const actionUrl = input.actionUrl || (input.taskId ? `/m/tasks/${encodeURIComponent(input.taskId)}` : "/m/notifications");
  if (input.dedupeKey) {
    const existing = await prisma.notification.findUnique({
      where: { recipientId_dedupeKey: { recipientId: input.recipientId, dedupeKey: input.dedupeKey } },
    });
    if (existing) return existing;
  }
  const preference = await prisma.notificationPreference.findUnique({
    where: { organizationId_userId: { organizationId: input.organizationId, userId: input.recipientId } },
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
      },
    });
    const outbox = await tx.notificationOutbox.create({
      data: { notificationId: notification.id, organizationId: input.organizationId, userId: input.recipientId, nextAttemptAt },
    });
    return { notification, outbox };
    });
  } catch (error) {
    if (input.dedupeKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return prisma.notification.findUniqueOrThrow({ where: { recipientId_dedupeKey: { recipientId: input.recipientId, dedupeKey: input.dedupeKey } } });
    }
    throw error;
  }
  if (nextAttemptAt <= new Date()) {
    void processNotificationOutbox({ ids: [result.outbox.id] }).catch(() => undefined);
  }
  return result.notification;
}

export async function getUnreadNotificationCount(userId: string) {
  return prisma.notification.count({
    where: {
      recipientId: userId,
      readAt: null,
    },
  });
}

export async function markNotificationRead(input: {
  notificationId: string;
  recipientId: string;
}) {
  return prisma.notification.updateMany({
    where: { id: input.notificationId, recipientId: input.recipientId },
    data: { readAt: new Date() },
  });
}
