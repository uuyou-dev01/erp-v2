import { prisma } from "@/lib/prisma";
import { requireUserContext } from "@/lib/auth/user-context";
import {
  getWorkbenchAssignableMembers,
  getWorkbenchWorkItemDetail,
  getWorkbenchWorkItems,
} from "@/app/actions/workbench";
import { getMobileActionPolicy } from "@/lib/mobile/action-policy";
import type { EntityType, WorkItem } from "@/lib/application/next-actions";
import { getMobileSlaMetrics } from "@/lib/mobile/metrics";

export type MobileTaskScope = "today" | "mine" | "open" | "delegated" | "completed";

export interface MobileTaskSummary {
  id: string;
  taskId: string | null;
  entityType: EntityType;
  entityId: string;
  queue: WorkItem["queue"];
  title: string;
  subtitle: string | null;
  currentStatusLabel: string;
  primaryAction: WorkItem["primaryAction"];
  primaryActionLabel: string;
  priority: WorkItem["priority"];
  waitingSince: string;
  dueAt: string | null;
  overdue: boolean;
  assignedToId: string | null;
  assignedToName: string | null;
  createdById: string | null;
  createdByName: string | null;
  mobileEnabled: boolean;
  detailHref: string | null;
  lineItems: WorkItem["lineItems"];
}

function endOfToday() {
  const value = new Date();
  value.setHours(23, 59, 59, 999);
  return value;
}

function toSummary(item: WorkItem): MobileTaskSummary {
  const dueAt = item.taskDueAt ?? null;
  const dueDate = dueAt ? new Date(dueAt) : null;
  return {
    id: item.id,
    taskId: item.taskId ?? null,
    entityType: item.entityType,
    entityId: item.entityId,
    queue: item.queue,
    title: item.title,
    subtitle: item.subtitle ?? null,
    currentStatusLabel: item.currentStatusLabel,
    primaryAction: item.primaryAction,
    primaryActionLabel: item.primaryActionLabel,
    priority: item.priority,
    waitingSince: item.waitingSince,
    dueAt,
    overdue: Boolean(dueDate && dueDate.getTime() < Date.now()),
    assignedToId: item.taskAssignedToId ?? null,
    assignedToName: item.taskAssignedToName ?? null,
    createdById: item.taskCreatedById ?? null,
    createdByName: item.taskCreatedByName ?? null,
    mobileEnabled: getMobileActionPolicy(item.primaryAction).enabled,
    detailHref: item.detailHref ?? null,
    lineItems: item.lineItems,
  };
}

function taskWeight(item: MobileTaskSummary) {
  if (item.overdue) return 0;
  if (item.priority === "critical") return 1;
  if (item.priority === "warning") return 2;
  if (item.dueAt) return 3;
  return 4;
}

function sortTasks(items: MobileTaskSummary[]) {
  return [...items].sort((a, b) => {
    if (a.mobileEnabled !== b.mobileEnabled) return a.mobileEnabled ? -1 : 1;
    const weight = taskWeight(a) - taskWeight(b);
    if (weight !== 0) return weight;
    const aTime = a.dueAt ?? a.waitingSince;
    const bTime = b.dueAt ?? b.waitingSince;
    return new Date(aTime).getTime() - new Date(bTime).getTime();
  });
}

const ENTITY_BY_REF: Record<string, EntityType> = {
  CUSTOMER_ORDER: "customerOrder",
  LISTING: "listing",
  PURCHASE_ORDER: "purchaseOrder",
  INBOUND_SHIPMENT: "shipment",
  SKU: "sku",
  ITEM_UNIT: "itemUnit",
  INVENTORY_LOT: "inventoryLot",
  QUICK_ENTRY: "quickEntry",
};

const ACTION_BY_TASK_TYPE: Record<string, WorkItem["primaryAction"]> = {
  FILL_LOGISTICS: "fillLogistics",
  CONFIRM_ARRIVAL: "confirmArrival",
  DISPOSITION: "disposition",
  INBOUND: "inbound",
  CONFIRM_ORDER: "confirmOrder",
  SHIP_ORDER: "shipOrder",
  CONFIRM_DELIVERY: "confirmDelivery",
  INSPECT_ITEM: "approveReturnInspection",
  LISTING_CREATE: "createListing",
  LISTING_UPDATE: "createListing",
  SETTLE_ORDER: "settleOrder",
  RESOLVE_EXCEPTION: "resolveException",
};

function actionLabel(action: WorkItem["primaryAction"]) {
  return {
    fillLogistics: "补采购物流",
    confirmArrival: "确认到货",
    disposition: "确认分流",
    inbound: "确认入库",
    confirmOrder: "确认订单",
    shipOrder: "确认发货",
    confirmDelivery: "确认妥投",
    approveReturnInspection: "退货检查",
    createListing: "创建上架",
    settleOrder: "确认结算",
    resolveException: "处理异常",
    receivePurchase: "确认收货",
    registerReturn: "登记退货",
    cancelOrder: "取消订单",
    retryProcess: "重试处理",
    viewDetails: "查看详情",
  }[action];
}

async function getCompletedMobileTasks(userId: string, organizationId: string, storeId: string) {
  const rows = await prisma.task.findMany({
    where: {
      organizationId,
      storeId,
      status: "DONE",
      OR: [{ assignedToId: userId }, { createdById: userId }, { completedById: userId }],
    },
    orderBy: { completedAt: "desc" },
    take: 80,
  });
  const userIds = [...new Set(rows.flatMap((row) => [row.assignedToId, row.createdById]).filter(Boolean) as string[])];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : [];
  const names = new Map(users.map((user) => [user.id, user.name || user.email]));
  return rows.map((row): MobileTaskSummary => {
    const action = ACTION_BY_TASK_TYPE[row.type] ?? "viewDetails";
    return {
      id: row.id,
      taskId: row.id,
      entityType: ENTITY_BY_REF[row.refType] ?? "quickEntry",
      entityId: row.refId,
      queue: "completed",
      title: row.title,
      subtitle: row.description,
      currentStatusLabel: "已完成",
      primaryAction: action,
      primaryActionLabel: actionLabel(action),
      priority: "normal",
      waitingSince: (row.completedAt ?? row.createdAt).toISOString(),
      dueAt: row.dueAt?.toISOString() ?? null,
      overdue: false,
      assignedToId: row.assignedToId,
      assignedToName: row.assignedToId ? names.get(row.assignedToId) ?? "未命名成员" : null,
      createdById: row.createdById,
      createdByName: names.get(row.createdById) ?? "系统",
      mobileEnabled: false,
      detailHref: null,
      lineItems: undefined,
    };
  });
}

export async function getMobileTasks(scope: MobileTaskScope = "today") {
  const context = await requireUserContext();
  if (scope === "completed") {
    return getCompletedMobileTasks(context.userId, context.organizationId, context.activeStoreId);
  }
  const items = (await getWorkbenchWorkItems(context.activeStoreId, undefined, 240)).map(toSummary);
  const todayEnd = endOfToday().getTime();

  const filtered = items.filter((item) => {
    if (scope === "mine") return item.assignedToId === context.userId;
    if (scope === "open") return !item.assignedToId;
    if (scope === "delegated") return item.createdById === context.userId;
    if (item.assignedToId && item.assignedToId !== context.userId) return false;
    return item.overdue || !item.dueAt || new Date(item.dueAt).getTime() <= todayEnd;
  });

  return sortTasks(filtered);
}

export async function getMobileTaskReceipt(taskId: string) {
  const context = await requireUserContext();
  const task = await prisma.task.findFirst({
    where: { id: taskId, organizationId: context.organizationId, storeId: context.activeStoreId, status: { in: ["DONE", "CANCELLED"] } },
  });
  if (!task) return null;
  const [creator, assignee, completer, activities, request] = await Promise.all([
    prisma.user.findUnique({ where: { id: task.createdById }, select: { name: true, email: true } }),
    task.assignedToId ? prisma.user.findUnique({ where: { id: task.assignedToId }, select: { name: true, email: true } }) : null,
    task.completedById ? prisma.user.findUnique({ where: { id: task.completedById }, select: { name: true, email: true } }) : null,
    prisma.activityLog.findMany({ where: { organizationId: context.organizationId, taskId: task.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.mobileActionRequest.findFirst({ where: { organizationId: context.organizationId, taskId: task.id, status: "COMPLETED" }, orderBy: { updatedAt: "desc" } }),
  ]);
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    createdAt: task.createdAt,
    completedAt: task.completedAt,
    creatorName: creator?.name || creator?.email || "系统",
    assigneeName: assignee?.name || assignee?.email || null,
    completerName: completer?.name || completer?.email || null,
    action: request?.action ?? ACTION_BY_TASK_TYPE[task.type] ?? "viewDetails",
    response: request?.responsePayload ?? null,
    activities,
  };
}

async function getEntityUpdatedAt(entityType: EntityType, entityId: string) {
  if (entityType === "purchaseOrder") {
    return (await prisma.purchaseOrder.findUnique({ where: { id: entityId }, select: { updatedAt: true } }))?.updatedAt;
  }
  if (entityType === "shipment") {
    return (await prisma.inboundShipment.findUnique({ where: { id: entityId }, select: { updatedAt: true } }))?.updatedAt;
  }
  if (entityType === "customerOrder") {
    return (await prisma.customerOrder.findUnique({ where: { id: entityId }, select: { updatedAt: true } }))?.updatedAt;
  }
  if (entityType === "quickEntry") {
    return (await prisma.quickEntry.findUnique({ where: { id: entityId }, select: { updatedAt: true } }))?.updatedAt;
  }
  if (entityType === "sku") {
    return (await prisma.sKU.findUnique({ where: { id: entityId }, select: { updatedAt: true } }))?.updatedAt;
  }
  if (entityType === "inventoryLot") {
    return (await prisma.inventoryLot.findUnique({ where: { id: entityId }, select: { updatedAt: true } }))?.updatedAt;
  }
  if (entityType === "itemUnit") {
    return (await prisma.itemUnit.findUnique({ where: { id: entityId }, select: { updatedAt: true } }))?.updatedAt;
  }
  return (await prisma.listing.findUnique({ where: { id: entityId }, select: { updatedAt: true } }))?.updatedAt;
}

export async function getMobileTask(taskId: string) {
  const context = await requireUserContext();
  const items = await getWorkbenchWorkItems(context.activeStoreId, undefined, 300);
  const item = items.find((candidate) => candidate.id === taskId || candidate.taskId === taskId);
  if (!item) return null;

  const [detail, locations, members, taskRow, entityUpdatedAt] = await Promise.all([
    getWorkbenchWorkItemDetail(item.entityType, item.entityId),
    prisma.location.findMany({
      where: { storeId: context.activeStoreId },
      select: { id: true, name: true, code: true, type: true },
      orderBy: { name: "asc" },
    }),
    getWorkbenchAssignableMembers(context.activeStoreId),
    item.taskId
      ? prisma.task.findFirst({
          where: { id: item.taskId, organizationId: context.organizationId },
          select: { id: true, updatedAt: true, status: true },
        })
      : Promise.resolve(null),
    getEntityUpdatedAt(item.entityType, item.entityId),
  ]);
  if (!detail || !entityUpdatedAt) return null;

  return {
    summary: toSummary(item),
    policy: getMobileActionPolicy(item.primaryAction),
    detail,
    locations,
    members,
    expectedVersion: `${taskRow?.updatedAt.toISOString() ?? "virtual"}:${entityUpdatedAt.toISOString()}`,
    taskStatus: taskRow?.status ?? null,
  };
}

export async function getMobileHome() {
  const context = await requireUserContext();
  const [user, store, tasks, unreadCount, sla] = await Promise.all([
    prisma.user.findUnique({ where: { id: context.userId }, select: { name: true, email: true } }),
    prisma.store.findUnique({ where: { id: context.activeStoreId }, select: { name: true } }),
    getMobileTasks("today"),
    prisma.notification.count({
      where: {
        recipientId: context.userId,
        organizationId: context.organizationId,
        readAt: null,
      },
    }),
    getMobileSlaMetrics(),
  ]);
  const actionableTasks = tasks.filter((task) => task.mobileEnabled);
  return {
    user: { name: user?.name || user?.email || "当前用户", email: user?.email ?? "" },
    storeName: store?.name ?? "当前店铺",
    tasks: actionableTasks.slice(0, 8),
    counts: {
      total: actionableTasks.length,
      overdue: actionableTasks.filter((task) => task.overdue).length,
      critical: actionableTasks.filter((task) => task.priority === "critical").length,
      unread: unreadCount,
    },
    sla,
  };
}
