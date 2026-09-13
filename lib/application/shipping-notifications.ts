import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "./notifications";
import { parseShippingProof } from "./shipping-proof";

/** Notify active participants only, with a destination each participant can open. */
export async function notifyShippingParticipants(input: {
  orderId: string;
  actorId: string;
  event: "SHIPPED" | "PREPARATION" | "CLAIMED" | "RETURNED" | "DECLINED";
}) {
  const order = await prisma.customerOrder.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      storeId: true,
      orderNumber: true,
      shippingProof: true,
      shippedAt: true,
      store: { select: { organizationId: true } },
    },
  });
  if (!order?.store.organizationId) return;
  const organizationId = order.store.organizationId;
  const tasks = await prisma.task.findMany({
    where: {
      storeId: order.storeId,
      refType: "CUSTOMER_ORDER",
      refId: order.id,
      type: "SHIP_ORDER",
      status: { not: "CANCELLED" },
    },
    select: {
      id: true,
      createdById: true,
      assignedToId: true,
      fulfillmentLocationId: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const [memberships, accesses, roster, actor] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId },
      select: { userId: true, role: true, status: true },
    }),
    prisma.storeAccess.findMany({ where: { storeId: order.storeId }, select: { userId: true } }),
    prisma.locationFulfiller.findMany({
      where: {
        organizationId,
        status: "ACTIVE",
        locationId: {
          in: tasks.flatMap((t) => (t.fulfillmentLocationId ? [t.fulfillmentLocationId] : [])),
        },
      },
      select: { userId: true, locationId: true, role: true },
    }),
    prisma.user.findUnique({ where: { id: input.actorId }, select: { name: true } }),
  ]);
  const access = new Set(accesses.map((a) => a.userId));
  const internals = new Set(
    memberships.filter((m) => m.status === "ACTIVE" && access.has(m.userId)).map((m) => m.userId)
  );
  const blocked = new Set(memberships.filter((m) => m.status !== "ACTIVE").map((m) => m.userId));
  const participantIds = new Set([
    ...memberships
      .filter(
        (m) => m.status === "ACTIVE" && ["OWNER", "ADMIN"].includes(m.role) && access.has(m.userId)
      )
      .map((m) => m.userId),
    ...tasks.map((t) => t.createdById).filter((id) => internals.has(id)),
    ...tasks.flatMap((t) =>
      t.assignedToId &&
      (internals.has(t.assignedToId) ||
        roster.some((r) => r.userId === t.assignedToId && r.locationId === t.fulfillmentLocationId))
        ? [t.assignedToId]
        : []
    ),
    ...roster.flatMap((r) => (r.role === "MANAGER" && r.userId ? [r.userId] : [])),
  ]);
  const titles = {
    SHIPPED: "订单已发货",
    PREPARATION: "发货前资料已更新",
    CLAIMED: "发货任务已领取",
    RETURNED: "发货任务已退回，请重新安排",
    DECLINED: "发货指派被拒绝，请重新安排",
  };
  const proof = parseShippingProof(order.shippingProof);
  const content =
    input.event === "PREPARATION"
      ? JSON.stringify({ ...proof, updatedAt: undefined })
      : input.event === "SHIPPED"
        ? order.shippedAt?.toISOString()
        : tasks.map((t) => t.updatedAt.toISOString()).join();
  const hash = createHash("sha256")
    .update(content ?? "")
    .digest("hex");
  await Promise.all(
    [...participantIds]
      .filter((id) => id !== input.actorId && !blocked.has(id))
      .map((recipientId) => {
        const internal = internals.has(recipientId);
        const task =
          tasks.find((t) => t.assignedToId === recipientId) ??
          tasks.find((t) =>
            roster.some((r) => r.userId === recipientId && r.locationId === t.fulfillmentLocationId)
          );
        if (!internal && !task) return;
        return notifyUser({
          organizationId,
          storeId: order.storeId,
          recipientId,
          actorId: input.actorId,
          taskId: task?.id,
          refType: "CUSTOMER_ORDER",
          refId: order.id,
          type:
            input.event === "SHIPPED"
              ? "ORDER_SHIPPED"
              : input.event === "PREPARATION"
                ? "SHIPPING_PREPARATION_UPDATED"
                : "SHIPPING_PROGRESS_UPDATED",
          title: titles[input.event],
          body: `${order.orderNumber}：${actor?.name || "协作者"}${input.event === "SHIPPED" && proof.dispatchConfirmation?.mode === "ON_BEHALF" ? `代 ${proof.dispatchConfirmation.actualShipper} 确认发出` : titles[input.event]}。${input.event === "PREPARATION" ? "资料保存不代表已经发货。" : ""}`,
          actionUrl: internal ? `/sales/${order.id}` : `/collaboration/tasks?task=${task!.id}`,
          dedupeKey: `shipping:${order.id}:${input.event}:${hash}:${recipientId}`,
        });
      })
  );
}

export async function notifyShippingTaskProgress(
  taskId: string,
  actorId: string,
  event: "CLAIMED" | "RETURNED" | "DECLINED"
) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { refId: true } });
  if (task) await notifyShippingParticipants({ orderId: task.refId, actorId, event });
}
