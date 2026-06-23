"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserContext } from "@/lib/auth/user-context";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { getUnreadNotificationCount, markNotificationRead } from "@/lib/application/notifications";

export async function getMyNotificationSummary() {
  const context = await requireUserContext();
  const unreadCount = await getUnreadNotificationCount(context.userId);
  return {
    unreadCount,
    userName: context.userId,
  };
}

export async function getMyNotifications() {
  const context = await requireUserContext();
  return prisma.notification.findMany({
    where: { recipientId: context.userId },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
}

export async function markMyNotificationRead(notificationId: string) {
  const context = await requireUserContext();
  await markNotificationRead({
    notificationId,
    recipientId: context.userId,
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
