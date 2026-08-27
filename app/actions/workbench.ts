"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  collectWorkItems,
  getQueueCounts,
  getProductTicketByEntity,
  getRecentActivity,
  getWorkItemDetail,
  type ProductTicket,
  type RecentActivityItem,
  type WorkItemDetail,
} from "@/lib/application/workflow-queries";
import type { QueueCounts, WorkItem, WorkQueue } from "@/lib/application/next-actions";
import {
  bulkConfirmInboundShipmentsDelivered,
  dispatchPurchaseTransfer,
} from "@/app/actions/logistics";
import {
  markPurchaseAsShipped,
  markPurchaseOrderArrived,
  receivePurchaseOrder,
  returnPurchaseOrder,
} from "@/app/actions/purchase-orders";
import {
  addPurchaseOrdersToConsolidation,
  createConsolidationForPurchaseOrders,
} from "@/app/actions/consolidations";
import { getListingPendingItems } from "@/lib/application/listing-pending";
import {
  applyPendingListingContext,
  mergePendingListingWorkItems,
} from "@/lib/application/workbench-pending-listing";
import { requireUserContext } from "@/lib/auth/user-context";
import { INCOMPLETE_TASK_STATUSES } from "@/lib/application/tasks";
import { grantsLocationCapability } from "@/lib/auth/scope-access";
import { RESERVING_ALLOCATION_STATUSES } from "@/lib/application/order-allocation";
import {
  LOGISTICS_COST_SOURCE_TYPES,
  normalizeLogisticsCostInput,
  saveLogisticsShippingCost,
} from "@/lib/application/logistics-cost";

function clean(value?: string | null) {
  return value?.trim() || undefined;
}

function optionalInputDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

const TASK_STATUS_LABELS: Record<string, string> = {
  OPEN: "未指派",
  ASSIGNED: "已指派",
  IN_PROGRESS: "处理中",
  DONE: "已完成",
  CANCELLED: "已取消",
  OVERDUE: "已逾期",
};

function workItemRef(item: WorkItem) {
  if (item.entityType === "customerOrder") {
    return { refType: "CUSTOMER_ORDER", refId: item.entityId };
  }
  if (item.entityType === "listing") {
    return { refType: "LISTING", refId: item.entityId };
  }
  if (item.entityType === "purchaseOrder") {
    return { refType: "PURCHASE_ORDER", refId: item.entityId };
  }
  if (item.entityType === "shipment") {
    return { refType: "INBOUND_SHIPMENT", refId: item.entityId };
  }
  if (item.entityType === "sku") {
    return { refType: "SKU", refId: item.entityId };
  }
  if (item.entityType === "itemUnit") {
    return { refType: "ITEM_UNIT", refId: item.entityId };
  }
  if (item.entityType === "inventoryLot") {
    return { refType: "INVENTORY_LOT", refId: item.entityId };
  }
  return { refType: "QUICK_ENTRY", refId: item.entityId };
}

function taskFulfillmentLocationIds(task: {
  fulfillmentLocationId: string | null;
  metadata: unknown;
}) {
  if (task.fulfillmentLocationId) return [task.fulfillmentLocationId];
  if (!task.metadata || typeof task.metadata !== "object" || Array.isArray(task.metadata)) {
    return [];
  }
  const ids = (task.metadata as Record<string, unknown>).fulfillmentLocationIds;
  return Array.isArray(ids)
    ? Array.from(new Set(ids.filter((id): id is string => typeof id === "string" && Boolean(id))))
    : [];
}

async function attachTaskMetadata(storeId: string, items: WorkItem[]): Promise<WorkItem[]> {
  if (items.length === 0) return items;

  const refs = items.map(workItemRef);
  const tasks = await prisma.task.findMany({
    where: {
      storeId,
      status: { in: [...INCOMPLETE_TASK_STATUSES] },
      OR: refs.map((ref) => ({ refType: ref.refType, refId: ref.refId })),
    },
    orderBy: { createdAt: "asc" },
  });

  const orderIdsMissingTaskLocation = tasks
    .filter(
      (task) =>
        task.type === "SHIP_ORDER" &&
        task.refType === "CUSTOMER_ORDER" &&
        taskFulfillmentLocationIds(task).length === 0
    )
    .map((task) => task.refId);
  const fallbackAllocations = orderIdsMissingTaskLocation.length
    ? await prisma.orderAllocation.findMany({
        where: {
          orderLine: { orderId: { in: orderIdsMissingTaskLocation } },
          status: { in: [...RESERVING_ALLOCATION_STATUSES] },
        },
        select: {
          orderLine: { select: { orderId: true } },
          inventoryLot: { select: { locationId: true } },
          itemUnit: { select: { locationId: true } },
        },
      })
    : [];
  const fallbackLocationIdsByOrder = new Map<string, Set<string>>();
  for (const allocation of fallbackAllocations) {
    const locationId = allocation.itemUnit?.locationId ?? allocation.inventoryLot?.locationId;
    if (!locationId) continue;
    const ids = fallbackLocationIdsByOrder.get(allocation.orderLine.orderId) ?? new Set<string>();
    ids.add(locationId);
    fallbackLocationIdsByOrder.set(allocation.orderLine.orderId, ids);
  }
  const resolvedTaskLocationIds = (task: (typeof tasks)[number]) => {
    const explicitIds = taskFulfillmentLocationIds(task);
    if (explicitIds.length) return explicitIds;
    return task.type === "SHIP_ORDER" && task.refType === "CUSTOMER_ORDER"
      ? Array.from(fallbackLocationIdsByOrder.get(task.refId) ?? [])
      : [];
  };

  const userIds = Array.from(
    new Set(
      tasks.flatMap((task) => [task.assignedToId, task.createdById]).filter(Boolean) as string[]
    )
  );
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const userNameById = new Map(users.map((user) => [user.id, user.name || user.email]));
  const locationIds = Array.from(new Set(tasks.flatMap(resolvedTaskLocationIds)));
  const locations = locationIds.length
    ? await prisma.location.findMany({
        where: { id: { in: locationIds } },
        select: { id: true, name: true },
      })
    : [];
  const locationNameById = new Map(locations.map((location) => [location.id, location.name]));

  const taskByRef = new Map<string, (typeof tasks)[number]>();
  for (const task of tasks) {
    const key = `${task.refType}:${task.refId}`;
    if (!taskByRef.has(key)) taskByRef.set(key, task);
  }

  return items.map((item) => {
    const ref = workItemRef(item);
    const task = taskByRef.get(`${ref.refType}:${ref.refId}`);
    if (!task) return item;
    const fulfillmentLocationIds = resolvedTaskLocationIds(task);
    const fulfillmentLocationNames = fulfillmentLocationIds.map(
      (locationId) => locationNameById.get(locationId) ?? "未命名仓库"
    );
    return {
      ...item,
      taskId: task.id,
      taskStatus: task.status,
      taskStatusLabel: TASK_STATUS_LABELS[task.status] ?? task.status,
      taskAssignedToId: task.assignedToId,
      taskAssignedToName: task.assignedToId
        ? (userNameById.get(task.assignedToId) ?? "未命名成员")
        : null,
      taskCreatedById: task.createdById,
      taskCreatedByName: userNameById.get(task.createdById) ?? "系统",
      taskDueAt: task.dueAt?.toISOString() ?? null,
      taskFulfillmentLocationId: task.fulfillmentLocationId,
      taskFulfillmentLocationName: task.fulfillmentLocationId
        ? (locationNameById.get(task.fulfillmentLocationId) ?? "未命名仓库")
        : null,
      taskFulfillmentLocationIds: fulfillmentLocationIds,
      taskFulfillmentLocationNames: fulfillmentLocationNames,
    };
  });
}

export async function getWorkbenchQueueCounts(storeId?: string): Promise<QueueCounts> {
  const context = await requireUserContext({ storeId });
  storeId = context.activeStoreId;
  const [counts, pendingListingItems] = await Promise.all([
    getQueueCounts(storeId),
    getListingPendingItems(storeId),
  ]);
  const pendingListing = pendingListingItems.length;
  return {
    ...counts,
    total: counts.total - counts.pendingListing + pendingListing,
    pendingListing,
  };
}

export async function getWorkbenchWorkItems(
  storeId: string | undefined,
  queue?: WorkQueue,
  limit = 80
): Promise<WorkItem[]> {
  const context = await requireUserContext({ storeId });
  storeId = context.activeStoreId;
  const shouldIncludePendingListing = !queue || queue === "pendingListing";
  const [items, pendingListingItems] = await Promise.all([
    collectWorkItems(storeId, queue === "pendingListing" ? undefined : queue, limit),
    shouldIncludePendingListing ? getListingPendingItems(storeId) : Promise.resolve([]),
  ]);
  const mergedItems = shouldIncludePendingListing
    ? mergePendingListingWorkItems(items, pendingListingItems, queue, limit)
    : items;
  return attachTaskMetadata(storeId, mergedItems);
}

export async function getWorkbenchRecentActivity(
  storeId: string | undefined,
  limit = 20
): Promise<RecentActivityItem[]> {
  const context = await requireUserContext({ storeId });
  storeId = context.activeStoreId;
  return getRecentActivity(storeId, limit);
}

export async function getWorkbenchAssignableMembers(storeId: string | undefined) {
  const context = await requireUserContext({ storeId });
  const [members, fulfillers] = await Promise.all([
    prisma.user.findMany({
      where: {
        memberships: {
          some: {
            organizationId: context.organizationId,
            status: "ACTIVE",
          },
        },
        storeAccesses: { some: { storeId: context.activeStoreId } },
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    }),
    prisma.locationFulfiller.findMany({
      where: {
        organizationId: context.organizationId,
        status: "ACTIVE",
        userId: { not: null },
        location: { storeId: context.activeStoreId },
      },
      select: {
        userId: true,
        role: true,
        isDefault: true,
        locationId: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    }),
  ]);
  const memberLocationAccesses = members.length
    ? await prisma.locationAccess.findMany({
        where: {
          userId: { in: members.map((member) => member.id) },
          location: { storeId: context.activeStoreId },
        },
        select: { userId: true, locationId: true, role: true, permissions: true },
      })
    : [];

  type AssignableOption = {
    id: string;
    name: string | null;
    email: string;
    role: string;
    relationship: "MEMBER" | "WAREHOUSE_COLLABORATOR";
    locationIds: string[];
    defaultLocationIds: string[];
  };
  const shippingLocationIdsByUser = new Map<string, string[]>();
  for (const access of memberLocationAccesses) {
    if (!grantsLocationCapability(access, "ship")) continue;
    shippingLocationIdsByUser.set(access.userId, [
      ...(shippingLocationIdsByUser.get(access.userId) ?? []),
      access.locationId,
    ]);
  }
  const options = new Map<string, AssignableOption>(
    members.map((member) => [
      member.id,
      {
        ...member,
        relationship: "MEMBER" as const,
        locationIds: shippingLocationIdsByUser.get(member.id) ?? [],
        defaultLocationIds: [] as string[],
      },
    ])
  );
  for (const fulfiller of fulfillers) {
    if (!fulfiller.userId || !fulfiller.user) continue;
    const existing = options.get(fulfiller.userId);
    if (existing) {
      existing.locationIds.push(fulfiller.locationId);
      if (fulfiller.isDefault) existing.defaultLocationIds.push(fulfiller.locationId);
      continue;
    }
    options.set(fulfiller.userId, {
      id: fulfiller.userId,
      name: fulfiller.user.name,
      email: fulfiller.user.email,
      role: fulfiller.role,
      relationship: "WAREHOUSE_COLLABORATOR" as const,
      locationIds: [fulfiller.locationId],
      defaultLocationIds: fulfiller.isDefault ? [fulfiller.locationId] : [],
    });
  }
  return Array.from(options.values()).sort((a, b) =>
    (a.name || a.email).localeCompare(b.name || b.email, "zh-CN")
  );
}

export async function getWorkbenchWorkItemDetail(
  entityType: WorkItem["entityType"],
  entityId: string
): Promise<WorkItemDetail | null> {
  const context = await requireUserContext();
  const detail = await getWorkItemDetail(entityType, entityId);
  if (!detail || (entityType !== "sku" && entityType !== "itemUnit")) return detail;

  const pendingItems = await getListingPendingItems(context.activeStoreId);
  const pendingItem = pendingItems.find((item) =>
    entityType === "itemUnit"
      ? item.type === "ITEM_UNIT" && item.itemUnitId === entityId
      : item.type === "SKU" && item.skuId === entityId
  );
  return pendingItem ? applyPendingListingContext(detail, pendingItem) : detail;
}

export async function getWorkbenchProductTicket(
  entityType: WorkItem["entityType"],
  entityId: string
): Promise<ProductTicket | null> {
  await requireUserContext();
  return getProductTicketByEntity(entityType, entityId);
}

export async function bulkUpdatePurchaseOrderLogistics(
  purchaseOrderIds: string[],
  payload: {
    purchaseTrackingNo?: string;
    carrier?: string;
    etaDate?: string;
    destinationLocationId?: string;
    shippingCost?: string;
    shippingCurrency?: string;
    note?: string;
  }
) {
  const ids = Array.from(new Set(purchaseOrderIds)).filter(Boolean);
  if (ids.length === 0) return { success: 0, failed: 0 };

  const destinationLocationId = payload.destinationLocationId?.trim();
  if (!destinationLocationId) {
    throw new Error("请选择预计到货位置");
  }

  const etaDate = payload.etaDate?.trim() ? new Date(payload.etaDate) : undefined;

  let success = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      const order = await prisma.purchaseOrder.findUnique({
        where: { id },
        select: { storeId: true, currency: true },
      });
      if (!order) throw new Error("采购单不存在");
      const shippingCost = normalizeLogisticsCostInput(
        { amount: payload.shippingCost, currency: payload.shippingCurrency },
        order.currency,
      );
      const shippedAt = new Date();
      await markPurchaseAsShipped({
        purchaseOrderId: id,
        shippedAt,
        trackingNo: payload.purchaseTrackingNo?.trim() || undefined,
        carrier: payload.carrier?.trim() || undefined,
        etaDate: etaDate && !Number.isNaN(etaDate.getTime()) ? etaDate : undefined,
        destinationLocationId,
        shipmentNote: payload.note?.trim() || undefined,
        shipmentMode: "purchase_only",
      });
      if (shippingCost) {
        await saveLogisticsShippingCost(prisma, {
          storeId: order.storeId,
          sourceType: LOGISTICS_COST_SOURCE_TYPES.purchase,
          sourceId: id,
          amount: shippingCost.amount.toFixed(4),
          currency: shippingCost.currency,
          fallbackCurrency: order.currency,
          occurredAt: shippedAt,
          note: "批量登记采购卖家发货邮费",
        });
      }
      success += 1;
    } catch {
      failed += 1;
    }
  }

  revalidatePath("/workbench");
  return { success, failed };
}

export async function bulkConfirmArrivals(input: {
  shipmentIds?: string[];
  purchaseOrderIds?: string[];
}) {
  const shipmentIds = Array.from(new Set(input.shipmentIds ?? [])).filter(Boolean);
  const purchaseOrderIds = Array.from(new Set(input.purchaseOrderIds ?? [])).filter(Boolean);
  let success = 0;
  let failed = 0;

  if (shipmentIds.length > 0) {
    const result = await bulkConfirmInboundShipmentsDelivered(shipmentIds, new Date());
    success += result.success;
    failed += result.failed;
  }

  for (const id of purchaseOrderIds) {
    try {
      const order = await prisma.purchaseOrder.findUnique({
        where: { id },
        select: { id: true, destinationLocationId: true },
      });
      if (!order?.destinationLocationId) {
        failed += 1;
        continue;
      }
      await markPurchaseOrderArrived({
        purchaseOrderId: order.id,
        locationId: order.destinationLocationId,
        receivedAt: new Date(),
      });
      success += 1;
    } catch {
      failed += 1;
    }
  }

  revalidatePath("/workbench");
  return { success, failed };
}

export async function bulkInboundPurchases(input: {
  purchaseOrderIds: string[];
  locationId?: string;
}) {
  const ids = Array.from(new Set(input.purchaseOrderIds)).filter(Boolean);
  if (ids.length === 0) return { success: 0, failed: 0 };
  if (!input.locationId) throw new Error("请选择入库位置");

  let success = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      const order = await prisma.purchaseOrder.findUnique({
        where: { id },
        select: {
          id: true,
          storeId: true,
          status: true,
          receivedAt: true,
          lines: { select: { id: true } },
        },
      });
      if (!order || order.status !== "RECEIVED") {
        failed += 1;
        continue;
      }
      await receivePurchaseOrder({
        purchaseOrderId: order.id,
        locationId: input.locationId,
        receivedAt: order.receivedAt ?? new Date(),
      });
      if (order.lines.length > 0) {
        await prisma.inspectionEvent.createMany({
          data: order.lines.map((line) => ({
            storeId: order.storeId,
            refType: "PURCHASE_LINE",
            refId: line.id,
            locationId: input.locationId,
            result: "PASSED",
            inspectedAt: new Date(),
          })),
        });
      }
      success += 1;
    } catch {
      failed += 1;
    }
  }

  revalidatePath("/workbench");
  return { success, failed };
}

export async function bulkConsolidatePurchases(input: {
  purchaseOrderIds: string[];
  batchMode?: "existing" | "new";
  batchId?: string;
  fromLocationId?: string;
  toLocationId?: string;
  note?: string;
}) {
  const ids = Array.from(new Set(input.purchaseOrderIds)).filter(Boolean);
  if (ids.length === 0) return { success: 0, failed: 0 };

  if (input.batchMode === "new") {
    const context = await requireUserContext();
    const firstOrder = await prisma.purchaseOrder.findFirst({
      where: { id: { in: ids }, destinationLocationId: { not: null } },
      select: { destinationLocationId: true },
    });
    return createConsolidationForPurchaseOrders({
      storeId: context.activeStoreId,
      purchaseOrderIds: ids,
      fromLocationId: input.fromLocationId ?? firstOrder?.destinationLocationId ?? undefined,
      toLocationId: input.toLocationId,
      note: input.note,
    });
  }

  if (!input.batchId) throw new Error("请选择集运批次");
  return addPurchaseOrdersToConsolidation({
    batchId: input.batchId,
    purchaseOrderIds: ids,
  });
}

export async function bulkTransferPurchases(input: {
  purchaseOrderIds: string[];
  toLocationId?: string;
  trackingNo?: string;
  carrier?: string;
  etaDate?: string;
  shippingCost?: string;
  shippingCurrency?: string;
  note?: string;
}) {
  const ids = Array.from(new Set(input.purchaseOrderIds)).filter(Boolean);
  if (ids.length === 0) return { success: 0, failed: 0 };
  if (!input.toLocationId) throw new Error("请选择目标位置");

  let success = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      await dispatchPurchaseTransfer({
        purchaseOrderId: id,
        toLocationId: input.toLocationId,
        trackingNo: clean(input.trackingNo),
        carrier: clean(input.carrier),
        shippingCost: clean(input.shippingCost),
        shippingCurrency: clean(input.shippingCurrency),
        etaDate: optionalInputDate(input.etaDate),
        note: clean(input.note),
      });
      success += 1;
    } catch {
      failed += 1;
    }
  }

  revalidatePath("/workbench");
  return { success, failed };
}

export async function bulkReturnPurchases(input: {
  purchaseOrderIds: string[];
  reason?: string;
  trackingNo?: string;
  carrier?: string;
  note?: string;
}) {
  const ids = Array.from(new Set(input.purchaseOrderIds)).filter(Boolean);
  if (ids.length === 0) return { success: 0, failed: 0 };

  let success = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      const returnNote = [
        input.reason ? `退货原因:${input.reason}` : "批量退货终止",
        input.trackingNo ? `退货单号:${input.trackingNo}` : null,
        input.carrier ? `承运商:${input.carrier}` : null,
        input.note,
      ]
        .filter(Boolean)
        .join(" / ");
      await returnPurchaseOrder({
        purchaseOrderId: id,
        note: returnNote,
      });
      success += 1;
    } catch {
      failed += 1;
    }
  }

  revalidatePath("/workbench");
  revalidatePath("/procurement");
  return { success, failed };
}

export interface CommandSearchResult {
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export async function searchProductTickets(
  query: string,
  storeId?: string
): Promise<CommandSearchResult[]> {
  const context = await requireUserContext({ storeId });
  storeId = context.activeStoreId;
  const q = query.trim();
  if (!q) return [];

  const [skus, entries, purchaseOrders, customerOrders, shipments] = await Promise.all([
    prisma.sKU.findMany({
      where: {
        storeId,
        OR: [
          { code: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
          { brand: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
    }),
    prisma.quickEntry.findMany({
      where: {
        storeId,
        OR: [
          { rawProductName: { contains: q, mode: "insensitive" } },
          { rawBrand: { contains: q, mode: "insensitive" } },
          { purchaseTrackingNo: { contains: q, mode: "insensitive" } },
          { transitTrackingNo: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
    }),
    prisma.purchaseOrder.findMany({
      where: {
        storeId,
        OR: [
          { orderNo: { contains: q, mode: "insensitive" } },
          { trackingNo: { contains: q, mode: "insensitive" } },
          { supplierName: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
    }),
    prisma.customerOrder.findMany({
      where: {
        storeId,
        OR: [
          { orderNumber: { contains: q, mode: "insensitive" } },
          { trackingNo: { contains: q, mode: "insensitive" } },
          { customerName: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
    }),
    prisma.inboundShipment.findMany({
      where: {
        storeId,
        OR: [
          { trackingNo: { contains: q, mode: "insensitive" } },
          { carrier: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
    }),
  ]);

  return [
    ...skus.map((sku) => ({
      id: `sku-${sku.id}`,
      title: `${sku.code} · ${sku.name}`,
      subtitle: "SKU",
      href: `/inventory/skus/${sku.id}`,
    })),
    ...entries.map((entry) => ({
      id: `qe-${entry.id}`,
      title: entry.rawProductName,
      subtitle: `录入记录 · ${entry.processedStatus}`,
      href: "/workbench?action=quickEntry",
    })),
    ...purchaseOrders.map((order) => ({
      id: `po-${order.id}`,
      title: order.orderNo,
      subtitle: `采购单 · ${order.status}`,
      href: `/procurement/${order.id}`,
    })),
    ...customerOrders.map((order) => ({
      id: `co-${order.id}`,
      title: order.orderNumber,
      subtitle: `销售订单 · ${order.orderStatus}`,
      href: `/sales/${order.id}`,
    })),
    ...shipments.map((shipment) => ({
      id: `sh-${shipment.id}`,
      title: shipment.trackingNo ?? shipment.id.slice(0, 8),
      subtitle: `物流 · ${shipment.status}`,
      href: `/workbench?open=shipment:${shipment.id}`,
    })),
  ].slice(0, 12);
}
