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
import { bulkConfirmInboundShipmentsDelivered } from "@/app/actions/logistics";
import {
  markPurchaseAsShipped,
  markPurchaseOrderArrived,
  receivePurchaseOrder,
} from "@/app/actions/purchase-orders";
import {
  addPurchaseOrdersToConsolidation,
  createConsolidationForPurchaseOrders,
} from "@/app/actions/consolidations";
import { getListingPendingItems } from "@/lib/application/listing-pending";
import { requireUserContext } from "@/lib/auth/user-context";
import { INCOMPLETE_TASK_STATUSES } from "@/lib/application/tasks";

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
  if (item.entityType === "itemUnit") {
    return { refType: "ITEM_UNIT", refId: item.entityId };
  }
  if (item.entityType === "inventoryLot") {
    return { refType: "INVENTORY_LOT", refId: item.entityId };
  }
  return { refType: "QUICK_ENTRY", refId: item.entityId };
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

  const userIds = Array.from(
    new Set(
      tasks
        .flatMap((task) => [task.assignedToId, task.createdById])
        .filter(Boolean) as string[]
    )
  );
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const userNameById = new Map(
    users.map((user) => [user.id, user.name || user.email])
  );

  const taskByRef = new Map<string, (typeof tasks)[number]>();
  for (const task of tasks) {
    const key = `${task.refType}:${task.refId}`;
    if (!taskByRef.has(key)) taskByRef.set(key, task);
  }

  return items.map((item) => {
    const ref = workItemRef(item);
    const task = taskByRef.get(`${ref.refType}:${ref.refId}`);
    if (!task) return item;
    return {
      ...item,
      taskId: task.id,
      taskStatus: task.status,
      taskStatusLabel: TASK_STATUS_LABELS[task.status] ?? task.status,
      taskAssignedToId: task.assignedToId,
      taskAssignedToName: task.assignedToId
        ? userNameById.get(task.assignedToId) ?? "未命名成员"
        : null,
      taskCreatedById: task.createdById,
      taskCreatedByName: userNameById.get(task.createdById) ?? "系统",
      taskDueAt: task.dueAt?.toISOString() ?? null,
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
  const items = await collectWorkItems(storeId, queue, limit);
  return attachTaskMetadata(storeId, items);
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
  return prisma.user.findMany({
    where: {
      memberships: {
        some: {
          organizationId: context.organizationId,
          status: "ACTIVE",
        },
      },
      storeAccesses: {
        some: {
          storeId: context.activeStoreId,
        },
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
}

export async function getWorkbenchWorkItemDetail(
  entityType: WorkItem["entityType"],
  entityId: string
): Promise<WorkItemDetail | null> {
  await requireUserContext();
  return getWorkItemDetail(entityType, entityId);
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
    note?: string;
  }
) {
  const ids = Array.from(new Set(purchaseOrderIds)).filter(Boolean);
  if (ids.length === 0) return { success: 0, failed: 0 };

  const destinationLocationId = payload.destinationLocationId?.trim();
  if (!destinationLocationId) {
    throw new Error("请选择预计到货位置");
  }

  const etaDate = payload.etaDate?.trim()
    ? new Date(payload.etaDate)
    : undefined;

  let success = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      await markPurchaseAsShipped({
        purchaseOrderId: id,
        shippedAt: new Date(),
        trackingNo: payload.purchaseTrackingNo?.trim() || undefined,
        carrier: payload.carrier?.trim() || undefined,
        etaDate: etaDate && !Number.isNaN(etaDate.getTime()) ? etaDate : undefined,
        destinationLocationId,
        shipmentNote: payload.note?.trim() || undefined,
        shipmentMode: "purchase_only",
      });
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
      await receivePurchaseOrder({
        purchaseOrderId: order.id,
        locationId: input.locationId,
        receivedAt: order.receivedAt ?? new Date(),
      });
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
  note?: string;
}) {
  const ids = Array.from(new Set(input.purchaseOrderIds)).filter(Boolean);
  if (ids.length === 0) return { success: 0, failed: 0 };
  if (!input.toLocationId) throw new Error("请选择目标位置");

  let success = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      const order = await prisma.purchaseOrder.findUnique({
        where: { id },
        include: { inboundShipments: { select: { legIndex: true } } },
      });
      if (!order || order.status !== "RECEIVED") {
        failed += 1;
        continue;
      }
      const location = await prisma.location.findFirst({
        where: { id: input.toLocationId, storeId: order.storeId },
        select: { id: true },
      });
      if (!location) {
        failed += 1;
        continue;
      }
      const maxLegIndex = order.inboundShipments.reduce(
        (max, shipment) => Math.max(max, shipment.legIndex),
        1
      );
      await prisma.inboundShipment.create({
        data: {
          storeId: order.storeId,
          purchaseOrderId: order.id,
          legIndex: maxLegIndex + 1,
          fromLocationId: order.destinationLocationId,
          toLocationId: location.id,
          trackingNo: clean(input.trackingNo) ?? null,
          carrier: clean(input.carrier) ?? null,
          etaDate: optionalInputDate(input.etaDate),
          shippedAt: new Date(),
          status: "IN_TRANSIT",
          shipmentNote: clean(input.note) ?? null,
        },
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
      const order = await prisma.purchaseOrder.findUnique({
        where: { id },
        select: { id: true, status: true, shipmentNote: true },
      });
      if (!order || order.status !== "RECEIVED") {
        failed += 1;
        continue;
      }
      const returnNote = [
        input.reason ? `退货原因:${input.reason}` : "批量退货终止",
        input.trackingNo ? `退货单号:${input.trackingNo}` : null,
        input.carrier ? `承运商:${input.carrier}` : null,
        input.note,
      ].filter(Boolean).join(" / ");

      await prisma.purchaseOrder.update({
        where: { id: order.id },
        data: {
          status: "RETURNED",
          shipmentNote: [order.shipmentNote, returnNote].filter(Boolean).join("\n"),
        },
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
