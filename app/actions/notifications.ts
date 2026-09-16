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
  const customerOrderIds = Array.from(
    new Set(
      notifications.flatMap((notification) =>
        notification.refType === "CUSTOMER_ORDER" && notification.refId ? [notification.refId] : []
      )
    )
  );
  const [organizations, customerOrders] = await Promise.all([
    prisma.organization.findMany({
      where: { id: { in: organizationIds } },
      select: { id: true, name: true },
    }),
    prisma.customerOrder.findMany({
      where: { id: { in: customerOrderIds } },
      select: {
        id: true,
        customerName: true,
        orderNumber: true,
        externalOrderNo: true,
        platform: { select: { name: true } },
      },
    }),
  ]);
  const organizationNameById = new Map(
    organizations.map((organization) => [organization.id, organization.name])
  );
  const customerOrderById = new Map(customerOrders.map((order) => [order.id, order]));
  return notifications.map((notification) => {
    const customerOrder = notification.refId
      ? customerOrderById.get(notification.refId)
      : undefined;
    return {
      ...notification,
      organizationName: organizationNameById.get(notification.organizationId) ?? "关联企业",
      customerName: customerOrder?.customerName ?? null,
      orderNumber: customerOrder?.orderNumber ?? null,
      externalOrderNo: customerOrder?.externalOrderNo ?? null,
      platformName: customerOrder?.platform?.name ?? null,
    };
  });
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
