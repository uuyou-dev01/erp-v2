"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/lib/auth/user-context";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import {
  markNotificationRead,
  reconcileNotificationResolutions,
} from "@/lib/application/notifications";

export async function getMyNotificationSummary() {
  const user = await requireAuthenticatedUser();
  const unreadCount = await prisma.notification.count({
    where: { recipientId: user.id, readAt: null },
  });
  return {
    unreadCount,
    userName: user.id,
  };
}

export async function getMyNotifications() {
  const user = await requireAuthenticatedUser();
  await reconcileNotificationResolutions(user.id);
  const notifications = await prisma.notification.findMany({
    where: { recipientId: user.id },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  const organizationIds = Array.from(
    new Set(notifications.map((notification) => notification.organizationId))
  );
  const organizations = await prisma.organization.findMany({
    where: { id: { in: organizationIds } },
    select: { id: true, name: true },
  });
  const organizationNameById = new Map(
    organizations.map((organization) => [organization.id, organization.name])
  );
  return notifications.map((notification) => ({
    ...notification,
    organizationName: organizationNameById.get(notification.organizationId) ?? "关联企业",
  }));
}

export async function markMyNotificationRead(notificationId: string) {
  const user = await requireAuthenticatedUser();
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, recipientId: user.id },
    select: { organizationId: true },
  });
  if (!notification) throw new Error("通知不存在或无权操作");
  await markNotificationRead({
    notificationId,
    recipientId: user.id,
    organizationId: notification.organizationId,
  });
  revalidatePath("/notifications");
}

export async function markMyNotificationReadAction(notificationId: string) {
  try {
    await markMyNotificationRead(notificationId);
    return actionSuccess({ notificationId });
  } catch (error) {
    return toActionFailure(error, "标记通知已读失败，请重试");
  }
}
