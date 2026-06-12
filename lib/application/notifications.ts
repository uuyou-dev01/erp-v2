import { prisma } from "@/lib/prisma";

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
}) {
  if (shouldSkipNotification(input)) {
    return null;
  }

  return prisma.notification.create({
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
    },
  });
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
