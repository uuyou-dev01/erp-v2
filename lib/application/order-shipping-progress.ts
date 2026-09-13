import { prisma } from "@/lib/prisma";
export async function getOrderShippingProgress(storeId: string, orderIds: string[]) {
  const tasks = await prisma.task.findMany({
    where: { storeId, type: "SHIP_ORDER", refType: "CUSTOMER_ORDER", refId: { in: orderIds } },
    select: {
      id: true,
      refId: true,
      status: true,
      assignedToId: true,
      fulfillmentLocationId: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const [locations, users] = await Promise.all([
    prisma.location.findMany({
      where: {
        storeId,
        id: {
          in: tasks.flatMap((t) => (t.fulfillmentLocationId ? [t.fulfillmentLocationId] : [])),
        },
      },
      select: { id: true, name: true, code: true },
    }),
    prisma.user.findMany({
      where: { id: { in: tasks.flatMap((t) => (t.assignedToId ? [t.assignedToId] : [])) } },
      select: { id: true, name: true },
    }),
  ]);
  return new Map(
    orderIds.map((id) => {
      const task =
        tasks.find((t) => t.refId === id && t.status !== "CANCELLED") ??
        tasks.find((t) => t.refId === id);
      return [
        id,
        {
          taskId: task?.id ?? null,
          status: task?.status ?? null,
          location: locations.find((l) => l.id === task?.fulfillmentLocationId) ?? null,
          assigneeName: users.find((u) => u.id === task?.assignedToId)?.name ?? null,
        },
      ];
    })
  );
}
export const shippingTaskStatusLabels: Record<string, string> = {
  OPEN: "待领取",
  ASSIGNED: "待领取",
  IN_PROGRESS: "处理中",
  DONE: "已完成",
  CANCELLED: "已取消",
  OVERDUE: "已超时",
};
