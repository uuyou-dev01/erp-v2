import { prisma } from "@/lib/prisma";
import {
  ACTION_LABELS,
  buildLifecycleEvents,
  countWorkItems,
  deriveLifecycleStageFromQueue,
  deriveQuickEntryWorkItem,
  deriveSubProcesses,
  emptyQueueCounts,
  LIFECYCLE_LABELS,
  shipmentStatusLabel,
  type LifecycleEvent,
  type ProductLifecycleStage,
  type QueueCounts,
  type ShipmentLeg,
  type SubProcessState,
  type WorkItem,
  type WorkItemLine,
  type WorkQueue,
} from "@/lib/application/next-actions";

const ACTIVE_QUEUES: WorkQueue[] = [
  "missingLogistics",
  "inTransit",
  "pendingArrival",
  "pendingDisposition",
  "inspectionException",
  "pendingShipment",
  "shipped",
  "pendingSettlement",
  "returnInspection",
  "exception",
];

function iso(value?: Date | null) {
  return value ? value.toISOString() : undefined;
}

function derivePurchaseOrderItem(order: {
  id: string;
  orderNo: string;
  status: string;
  trackingNo: string | null;
  supplierName: string | null;
  currency: string;
  totalAmount: { toString(): string };
  updatedAt: Date;
  createdAt: Date;
  lines: Array<{
    id: string;
    quantity: { toString(): string };
    unitPrice: { toString(): string };
    lineAmount: { toString(): string };
    sku: { code: string; name: string };
    hasInboundInventory?: boolean;
    hasRoutedToConsolidation?: boolean;
    consolidation?: ConsolidationSignal;
  }>;
  inboundShipments?: Array<{ status: string; receivedAt?: Date | null }>;
}): WorkItem | null {
  const waitingSince = order.updatedAt ?? order.createdAt;
  const totalQty = order.lines.reduce(
    (sum, line) => sum + Number(line.quantity.toString()),
    0
  );
  const itemCount = order.lines.length;
  const lineItems: WorkItemLine[] = order.lines.map((line) => ({
    id: line.id,
    title: line.sku.name,
    skuCode: line.sku.code,
    quantity: line.quantity.toString(),
    unitPrice: line.unitPrice.toString(),
    lineAmount: line.lineAmount.toString(),
  }));
  const base = {
    entityType: "purchaseOrder" as const,
    entityId: order.id,
    title: `${order.supplierName ?? order.orderNo} · ${itemCount} 个商品 · ${totalQty} 件`,
    subtitle: `${order.orderNo} · ${order.currency} ${order.totalAmount.toString()}`,
    waitingSince: waitingSince.toISOString(),
    detailHref: `/procurement/${order.id}`,
    lineItems,
    metadata: {
      orderNo: order.orderNo,
      supplierName: order.supplierName,
      itemCount,
      totalQty,
      currency: order.currency,
      totalAmount: order.totalAmount.toString(),
    },
  };

  if (order.status === "ORDERED" && !order.trackingNo?.trim()) {
    return {
      ...base,
      id: `po-${order.id}-logistics`,
      queue: "missingLogistics",
      currentStatus: order.status,
      currentStatusLabel: "待补物流",
      primaryAction: "fillLogistics",
      primaryActionLabel: ACTION_LABELS.fillLogistics,
      priority: "warning",
    };
  }

  const hasShipmentTask = order.inboundShipments?.some((shipment) =>
    shipment.status === "PENDING" ||
    shipment.status === "IN_TRANSIT" ||
    shipment.status === "EXCEPTION" ||
    (shipment.status === "DELIVERED" && !shipment.receivedAt)
  );

  if (
    (order.status === "ORDERED" || order.status === "SHIPPED") &&
    order.trackingNo?.trim() &&
    order.lines.length > 0 &&
    !hasShipmentTask
  ) {
    return {
      ...base,
      id: `po-${order.id}-receive`,
      queue: "pendingArrival",
      currentStatus: order.status,
      currentStatusLabel: "待确认收货",
      primaryAction: "receivePurchase",
      primaryActionLabel: ACTION_LABELS.receivePurchase,
      priority: "normal",
      metadata: { ...base.metadata, trackingNo: order.trackingNo },
    };
  }

  if (
    order.status === "RECEIVED" &&
    !hasShipmentTask &&
    order.lines.some((line) => !line.hasInboundInventory && !line.hasRoutedToConsolidation)
  ) {
    return {
      ...base,
      id: `po-${order.id}-disposition`,
      queue: "pendingDisposition",
      currentStatus: order.status,
      currentStatusLabel: "待分流",
      primaryAction: "disposition",
      primaryActionLabel: ACTION_LABELS.disposition,
      priority: "normal",
    };
  }

  const activeConsolidation = order.lines.find(
    (line) => !line.hasInboundInventory && line.hasRoutedToConsolidation && line.consolidation
  )?.consolidation;
  if (order.status === "RECEIVED" && !hasShipmentTask && activeConsolidation) {
    const statusLabel: Record<string, string> = {
      OPEN: "已加入集运",
      SEALED: "集运待发",
      SHIPPED: "集运运输中",
    };
    return {
      ...base,
      id: `po-${order.id}-consolidation`,
      queue: "inTransit",
      currentStatus: activeConsolidation.status,
      currentStatusLabel: statusLabel[activeConsolidation.status] ?? "集运处理中",
      primaryAction: "viewDetails",
      primaryActionLabel: `查看集运：${activeConsolidation.label}`,
      priority: "normal",
      waitingSince: activeConsolidation.updatedAt.toISOString(),
      detailHref: `/logistics/consolidations/${activeConsolidation.batchId}`,
      metadata: {
        ...base.metadata,
        consolidationBatchId: activeConsolidation.batchId,
        consolidationBatchLabel: activeConsolidation.label,
      },
    };
  }

  return null;
}

interface InspectionSignal {
  result: string;
  failureReason: string | null;
  inspectedAt: Date;
}

interface ConsolidationSignal {
  batchId: string;
  status: string;
  label: string;
  updatedAt: Date;
}

function deriveCustomerOrderItem(order: {
  id: string;
  orderNumber: string;
  orderStatus: string;
  settledAt: Date | null;
  trackingNo: string | null;
  customerName: string;
  updatedAt: Date;
  createdAt: Date;
  platform: { name: string } | null;
  lines: Array<{ sku: { code: string; name: string }; allocations: unknown[] }>;
}): WorkItem | null {
  const sku = order.lines[0]?.sku;
  const waitingSince = order.updatedAt ?? order.createdAt;
  const base = {
    entityType: "customerOrder" as const,
    entityId: order.id,
    title: sku ? `${sku.code} · ${sku.name}` : order.orderNumber,
    subtitle: `${order.platform?.name ?? "直售"} · ${order.customerName}`,
    skuCode: sku?.code,
    waitingSince: waitingSince.toISOString(),
    detailHref: `/sales/${order.id}`,
  };

  if (order.orderStatus === "DRAFT" && order.lines.every((l) => l.allocations.length > 0)) {
    return {
      ...base,
      id: `co-${order.id}-confirm`,
      queue: "pendingShipment",
      currentStatus: order.orderStatus,
      currentStatusLabel: "待确认",
      primaryAction: "confirmOrder",
      primaryActionLabel: ACTION_LABELS.confirmOrder,
      priority: "normal",
    };
  }

  if (order.orderStatus === "CONFIRMED") {
    return {
      ...base,
      id: `co-${order.id}-ship`,
      queue: "pendingShipment",
      currentStatus: order.orderStatus,
      currentStatusLabel: "待发货",
      primaryAction: "shipOrder",
      primaryActionLabel: ACTION_LABELS.shipOrder,
      priority: "warning",
      metadata: { trackingNo: order.trackingNo },
    };
  }

  if (order.orderStatus === "SHIPPED" && !order.settledAt) {
    return {
      ...base,
      id: `co-${order.id}-shipped`,
      queue: "shipped",
      currentStatus: order.orderStatus,
      currentStatusLabel: "已发货",
      primaryAction: "confirmDelivery",
      primaryActionLabel: ACTION_LABELS.confirmDelivery,
      priority: "normal",
      metadata: { trackingNo: order.trackingNo },
    };
  }

  if (order.orderStatus === "DELIVERED" && !order.settledAt) {
    return {
      ...base,
      id: `co-${order.id}-settle`,
      queue: "pendingSettlement",
      currentStatus: order.orderStatus,
      currentStatusLabel: "待结算",
      primaryAction: "settleOrder",
      primaryActionLabel: ACTION_LABELS.settleOrder,
      priority: "normal",
    };
  }

  if (
    (order.orderStatus === "DELIVERED" || order.orderStatus === "SHIPPED") &&
    order.settledAt
  ) {
    return {
      ...base,
      id: `co-${order.id}-done`,
      queue: "completed",
      currentStatus: "SETTLED",
      currentStatusLabel: "已完成",
      primaryAction: "settleOrder",
      primaryActionLabel: "查看详情",
      priority: "normal",
    };
  }

  if (order.orderStatus === "RETURNED") {
    return {
      ...base,
      id: `co-${order.id}-returned`,
      queue: "completed",
      currentStatus: order.orderStatus,
      currentStatusLabel: "已退货",
      primaryAction: "viewDetails",
      primaryActionLabel: ACTION_LABELS.viewDetails,
      priority: "normal",
    };
  }

  if (order.orderStatus === "CANCELLED") {
    return {
      ...base,
      id: `co-${order.id}-cancelled`,
      queue: "completed",
      currentStatus: order.orderStatus,
      currentStatusLabel: "已取消",
      primaryAction: "viewDetails",
      primaryActionLabel: ACTION_LABELS.viewDetails,
      priority: "normal",
    };
  }

  return null;
}

function deriveShipmentItem(shipment: {
  id: string;
  legIndex: number;
  status: string;
  trackingNo: string | null;
  receivedAt?: Date | null;
  updatedAt: Date;
  createdAt: Date;
  purchaseOrder: { orderNo: string; status?: string } | null;
  fromLocation: { name: string } | null;
  toLocation: { name: string } | null;
}): WorkItem | null {
  const waitingSince = shipment.updatedAt ?? shipment.createdAt;
  const legLabel = shipment.legIndex <= 1 ? "购买地在途" : "集运在途";
  const isPurchaseLeg = shipment.legIndex <= 1;
  if (isPurchaseLeg && shipment.purchaseOrder?.status === "RECEIVED") return null;
  if (shipment.status === "DELIVERED" && shipment.receivedAt) return null;
  const routeLabel = [shipment.fromLocation?.name, shipment.toLocation?.name].filter(Boolean).join(" → ");
  const base = {
    entityType: "shipment" as const,
    entityId: shipment.id,
    title: shipment.trackingNo ?? shipment.purchaseOrder?.orderNo ?? "物流段",
    subtitle: [legLabel, routeLabel].filter(Boolean).join(" · "),
    waitingSince: waitingSince.toISOString(),
  };

  if (shipment.status === "IN_TRANSIT") {
    return {
      ...base,
      id: `sh-${shipment.id}`,
      queue: isPurchaseLeg ? "pendingArrival" : "inTransit",
      currentStatus: shipment.status,
      currentStatusLabel: legLabel,
      primaryAction: "confirmArrival",
      primaryActionLabel: ACTION_LABELS.confirmArrival,
      priority: "normal",
    };
  }

  if (shipment.status === "DELIVERED") {
    return {
      ...base,
      id: `sh-${shipment.id}-arrival`,
      queue: "pendingArrival",
      currentStatus: shipment.status,
      currentStatusLabel: "已到达待处理",
      primaryAction: "confirmArrival",
      primaryActionLabel: ACTION_LABELS.confirmArrival,
      priority: "warning",
    };
  }

  if (shipment.status === "EXCEPTION") {
    return {
      ...base,
      id: `sh-${shipment.id}-ex`,
      queue: "exception",
      currentStatus: shipment.status,
      currentStatusLabel: "物流异常",
      primaryAction: "resolveException",
      primaryActionLabel: ACTION_LABELS.resolveException,
      priority: "critical",
      exceptionType: "shipment_exception",
    };
  }

  return null;
}

function deriveItemUnitListingItem(item: {
  id: string;
  status: string;
  updatedAt: Date;
  createdAt: Date;
  conditionGrade: string | null;
  sku: { code: string; name: string };
  location: { name: string; isSellableDefault: boolean };
  inspection?: InspectionSignal | null;
  hasActiveListing?: boolean;
}): WorkItem | null {
  if (item.status !== "AVAILABLE" || !item.location.isSellableDefault) return null;
  if (item.hasActiveListing) return null;
  const base = {
    entityType: "itemUnit" as const,
    entityId: item.id,
    title: `${item.sku.code} · ${item.sku.name}`,
    subtitle: `${item.conditionGrade ?? "单品"} · ${item.location.name}`,
    skuCode: item.sku.code,
    waitingSince: (item.updatedAt ?? item.createdAt).toISOString(),
    detailHref: `/inventory/items/${item.id}`,
    metadata: { conditionGrade: item.conditionGrade },
  };

  if (!item.inspection) return null;

  if (item.inspection.result === "FAILED") {
    return {
      ...base,
      id: `iu-${item.id}-inspection-exception`,
      queue: "inspectionException",
      currentStatus: item.inspection.result,
      currentStatusLabel: "检查异常",
      primaryAction: "resolveException",
      primaryActionLabel: ACTION_LABELS.resolveException,
      priority: "critical",
      exceptionType: "inspection_failed",
      exceptionMessage: item.inspection.failureReason ?? "质检未通过",
    };
  }

  if (item.inspection.result !== "PASSED") return null;

  return {
    id: `iu-${item.id}`,
    ...base,
    queue: "pendingListing",
    currentStatus: item.status,
    currentStatusLabel: "待上架",
    primaryAction: "createListing",
    primaryActionLabel: ACTION_LABELS.createListing,
    priority: "normal",
  };
}

function deriveReturnInspectionItem(item: {
  id: string;
  status: string;
  updatedAt: Date;
  createdAt: Date;
  conditionGrade: string | null;
  notes: string | null;
  sku: { code: string; name: string };
  location: { name: string };
}): WorkItem | null {
  if (item.status !== "RETURN_CHECK") return null;

  return {
    id: `iu-${item.id}-return-check`,
    entityType: "itemUnit",
    entityId: item.id,
    queue: "returnInspection",
    title: `${item.sku.code} · ${item.sku.name}`,
    subtitle: `${item.conditionGrade ?? "单品"} · ${item.location.name}`,
    skuCode: item.sku.code,
    currentStatus: item.status,
    currentStatusLabel: "退货待检",
    primaryAction: "approveReturnInspection",
    primaryActionLabel: ACTION_LABELS.approveReturnInspection,
    priority: "warning",
    waitingSince: (item.updatedAt ?? item.createdAt).toISOString(),
    detailHref: `/inventory/items/${item.id}`,
    metadata: { conditionGrade: item.conditionGrade },
  };
}

function deriveInventoryLotItem(lot: {
  id: string;
  status: string;
  sourceType: string;
  sourceId: string;
  unitCost: { toString(): string };
  costCurrency: string;
  receivedAt: Date;
  updatedAt: Date;
  createdAt: Date;
  sku: { code: string; name: string };
  location: { name: string; isSellableDefault: boolean };
  inspection?: InspectionSignal | null;
  hasActiveListing: boolean;
}): WorkItem | null {
  if (lot.status !== "ACTIVE") return null;
  const base = {
    entityType: "inventoryLot" as const,
    entityId: lot.id,
    title: `${lot.sku.code} · ${lot.sku.name}`,
    subtitle: `${lot.location.name} · ${lot.costCurrency} ${lot.unitCost.toString()}`,
    skuCode: lot.sku.code,
    waitingSince: (lot.updatedAt ?? lot.createdAt).toISOString(),
    detailHref: "/inventory/lots",
    metadata: {
      location: lot.location.name,
      sourceType: lot.sourceType,
      unitCost: lot.unitCost.toString(),
    },
  };

  if (!lot.inspection) return null;

  if (lot.inspection.result === "FAILED") {
    return {
      ...base,
      id: `lot-${lot.id}-inspection-exception`,
      queue: "inspectionException",
      currentStatus: lot.inspection.result,
      currentStatusLabel: "检查异常",
      primaryAction: "resolveException",
      primaryActionLabel: ACTION_LABELS.resolveException,
      priority: "critical",
      exceptionType: "inspection_failed",
      exceptionMessage: lot.inspection.failureReason ?? "质检未通过",
    };
  }

  if (lot.inspection.result === "PASSED" && lot.location.isSellableDefault && !lot.hasActiveListing) {
    return {
      ...base,
      id: `lot-${lot.id}-listing`,
      queue: "pendingListing",
      currentStatus: lot.status,
      currentStatusLabel: "待上架检查",
      primaryAction: "createListing",
      primaryActionLabel: ACTION_LABELS.createListing,
      priority: "normal",
    };
  }

  return null;
}

function sourceInspectionRef(sourceType: string, sourceId: string) {
  return {
    refType:
      sourceType === "PURCHASE"
        ? "PURCHASE_LINE"
        : sourceType === "QUICK_ENTRY"
          ? "QUICK_ENTRY"
          : sourceType,
    refId: sourceId,
  };
}

async function getInspectionSignalForEntity(
  storeId: string,
  entity: { id: string; refType: "INVENTORY_LOT" | "ITEM_UNIT"; sourceType: string; sourceId: string }
): Promise<InspectionSignal | null> {
  const sourceRef = sourceInspectionRef(entity.sourceType, entity.sourceId);
  const inspection = await prisma.inspectionEvent.findFirst({
    where: {
      storeId,
      OR: [
        { refType: entity.refType, refId: entity.id },
        { refType: sourceRef.refType, refId: sourceRef.refId },
      ],
    },
    orderBy: { inspectedAt: "desc" },
  });
  return inspection
    ? {
        result: inspection.result,
        failureReason: inspection.failureReason,
        inspectedAt: inspection.inspectedAt,
      }
    : null;
}

function daysWaiting(item: WorkItem) {
  return (Date.now() - new Date(item.waitingSince).getTime()) / (1000 * 60 * 60 * 24);
}

function withRiskSignals(item: WorkItem): WorkItem {
  const days = daysWaiting(item);
  const riskByQueue: Partial<Record<WorkQueue, { days: number; message: string }>> = {
    missingLogistics: { days: 3, message: "物流超时" },
    inTransit: { days: 14, message: "运输超时" },
    pendingArrival: { days: 2, message: "到货未处理" },
    pendingDisposition: { days: 2, message: "收货后待分流" },
    pendingListing: { days: 7, message: "长期未上架" },
    pendingShipment: { days: 1, message: "已售未发" },
    returnInspection: { days: 2, message: "退货待检超时" },
    pendingSettlement: { days: 7, message: "待结算超时" },
    inStock: { days: 30, message: "长期库存" },
  };
  const risk = riskByQueue[item.queue];
  if (!risk || days < risk.days || item.priority === "critical") {
    return {
      ...item,
      lifecycleStage: deriveLifecycleStageFromQueue(item.queue, item.priority),
    };
  }
  const priority = days >= risk.days * 2 ? "critical" : "warning";
  return {
    ...item,
    priority,
    lifecycleStage: deriveLifecycleStageFromQueue(item.queue, priority),
    exceptionMessage: item.exceptionMessage ?? `${risk.message} · ${Math.floor(days)} 天`,
  };
}

export async function collectWorkItems(storeId: string, queue?: WorkQueue, limit = 100): Promise<WorkItem[]> {
  const [
    quickEntries,
    purchaseOrders,
    customerOrders,
    shipments,
    inventoryLots,
    pendingListingUnits,
    returnInspectionUnits,
  ] = await Promise.all([
    prisma.quickEntry.findMany({
      where: {
        storeId,
        processedStatus: { not: "COMPLETED" },
        workflowStage: { notIn: ["SETTLED", "CLOSED"] },
      },
      orderBy: { updatedAt: "asc" },
      take: 80,
    }),
    prisma.purchaseOrder.findMany({
      where: { storeId, status: { in: ["ORDERED", "SHIPPED", "RECEIVED"] } },
      include: {
        lines: { include: { sku: true }, orderBy: { createdAt: "asc" } },
        inboundShipments: { select: { status: true, receivedAt: true } },
      },
      orderBy: { updatedAt: "asc" },
      take: 40,
    }),
    prisma.customerOrder.findMany({
      where: {
        storeId,
        OR: [
          { orderStatus: "CONFIRMED" },
          { orderStatus: "DRAFT" },
          { orderStatus: "SHIPPED", settledAt: null },
          { orderStatus: "DELIVERED", settledAt: null },
        ],
      },
      include: {
        platform: true,
        lines: { include: { sku: true, allocations: true } },
      },
      orderBy: { updatedAt: "asc" },
      take: 40,
    }),
    prisma.inboundShipment.findMany({
      where: { storeId, status: { in: ["IN_TRANSIT", "DELIVERED", "EXCEPTION"] } },
      include: {
        purchaseOrder: { select: { orderNo: true, status: true } },
        fromLocation: { select: { name: true } },
        toLocation: { select: { name: true } },
      },
      orderBy: { updatedAt: "asc" },
      take: 40,
    }),
    prisma.inventoryLot.findMany({
      where: { storeId, status: "ACTIVE" },
      include: {
        sku: { select: { code: true, name: true } },
        location: { select: { name: true, isSellableDefault: true } },
      },
      orderBy: { updatedAt: "asc" },
      take: 80,
    }),
    prisma.itemUnit.findMany({
      where: {
        storeId,
        status: "AVAILABLE",
        location: { isSellableDefault: true },
        listings: { none: { status: "ACTIVE" } },
      },
      include: {
        sku: { select: { code: true, name: true } },
        location: { select: { name: true, isSellableDefault: true } },
      },
      orderBy: { updatedAt: "asc" },
      take: 30,
    }),
    prisma.itemUnit.findMany({
      where: { storeId, status: "RETURN_CHECK" },
      include: {
        sku: { select: { code: true, name: true } },
        location: { select: { name: true } },
      },
      orderBy: { updatedAt: "asc" },
      take: 40,
    }),
  ]);

  const purchaseLineIds = purchaseOrders.flatMap((order) => order.lines.map((line) => line.id));
  const [inboundLotRefs, inboundUnitRefs, consolidationLineRefs] = purchaseLineIds.length
    ? await Promise.all([
        prisma.inventoryLot.findMany({
          where: { storeId, sourceType: "PURCHASE", sourceId: { in: purchaseLineIds } },
          select: { sourceId: true },
        }),
        prisma.itemUnit.findMany({
          where: { storeId, sourceType: "PURCHASE", sourceId: { in: purchaseLineIds } },
          select: { sourceId: true },
        }),
        prisma.consolidationBatchLine.findMany({
          where: {
            sourceType: "PURCHASE_LINE",
            sourceId: { in: purchaseLineIds },
            batch: { storeId, status: { in: ["OPEN", "SEALED", "SHIPPED"] } },
          },
          select: {
            sourceId: true,
            batch: {
              select: {
                id: true,
                status: true,
                updatedAt: true,
                fromLocation: { select: { name: true } },
                toLocation: { select: { name: true } },
              },
            },
          },
        }),
      ])
    : [[], [], []];
  const inboundPurchaseLineIds = new Set([
    ...inboundLotRefs.map((lot) => lot.sourceId),
    ...inboundUnitRefs.map((unit) => unit.sourceId),
  ]);
  const consolidatedPurchaseLineIds = new Set(
    consolidationLineRefs.map((line) => line.sourceId)
  );
  const consolidationByLineId = new Map<string, ConsolidationSignal>();
  for (const line of consolidationLineRefs) {
    if (consolidationByLineId.has(line.sourceId)) continue;
    const routeLabel = [
      line.batch.fromLocation?.name,
      line.batch.toLocation?.name,
    ].filter(Boolean).join(" → ");
    consolidationByLineId.set(line.sourceId, {
      batchId: line.batch.id,
      status: line.batch.status,
      label: routeLabel || line.batch.id.slice(-6),
      updatedAt: line.batch.updatedAt,
    });
  }

  const items: WorkItem[] = [];
  const inspectableRefs = [
    ...inventoryLots.flatMap((lot) => [
      { refType: "INVENTORY_LOT", refId: lot.id },
      {
        refType:
          lot.sourceType === "PURCHASE"
            ? "PURCHASE_LINE"
            : lot.sourceType === "QUICK_ENTRY"
              ? "QUICK_ENTRY"
              : lot.sourceType,
        refId: lot.sourceId,
      },
    ]),
    ...pendingListingUnits.flatMap((unit) => [
      { refType: "ITEM_UNIT", refId: unit.id },
      {
        refType:
          unit.sourceType === "PURCHASE"
            ? "PURCHASE_LINE"
            : unit.sourceType === "QUICK_ENTRY"
              ? "QUICK_ENTRY"
              : unit.sourceType,
        refId: unit.sourceId,
      },
    ]),
  ];
  const inspections = inspectableRefs.length
    ? await prisma.inspectionEvent.findMany({
        where: {
          storeId,
          OR: inspectableRefs.map((ref) => ({
            refType: ref.refType,
            refId: ref.refId,
          })),
        },
        orderBy: { inspectedAt: "desc" },
      })
    : [];
  const inspectionByRef = new Map<string, InspectionSignal>();
  for (const inspection of inspections) {
    const key = `${inspection.refType}:${inspection.refId}`;
    if (!inspectionByRef.has(key)) {
      inspectionByRef.set(key, {
        result: inspection.result,
        failureReason: inspection.failureReason,
        inspectedAt: inspection.inspectedAt,
      });
    }
  }

  const inventorySkuIds = inventoryLots.map((lot) => lot.skuId);
  const activeListingSkuIds = new Set(
    inventorySkuIds.length > 0
      ? (
          await prisma.listing.findMany({
            where: { storeId, skuId: { in: inventorySkuIds }, status: "ACTIVE" },
            select: { skuId: true },
          })
        )
          .map((listing) => listing.skuId)
          .filter((id): id is string => Boolean(id))
      : []
  );

  const resolveInspection = (entity: {
    id: string;
    sourceType: string;
    sourceId: string;
  }) => {
    const sourceRefType =
      entity.sourceType === "PURCHASE"
        ? "PURCHASE_LINE"
        : entity.sourceType === "QUICK_ENTRY"
          ? "QUICK_ENTRY"
          : entity.sourceType;
    return (
      inspectionByRef.get(`INVENTORY_LOT:${entity.id}`) ??
      inspectionByRef.get(`ITEM_UNIT:${entity.id}`) ??
      inspectionByRef.get(`${sourceRefType}:${entity.sourceId}`) ??
      null
    );
  };

  for (const entry of quickEntries) {
    const item = deriveQuickEntryWorkItem(entry);
    if (!item) continue;
    items.push(withRiskSignals(item));
  }
  for (const order of purchaseOrders) {
    const item = derivePurchaseOrderItem({
      ...order,
      lines: order.lines.map((line) => ({
        ...line,
        hasInboundInventory: inboundPurchaseLineIds.has(line.id),
        hasRoutedToConsolidation: consolidatedPurchaseLineIds.has(line.id),
        consolidation: consolidationByLineId.get(line.id),
      })),
    });
    if (item) items.push(withRiskSignals(item));
  }
  for (const order of customerOrders) {
    const item = deriveCustomerOrderItem(order);
    if (item) items.push(withRiskSignals(item));
  }
  for (const shipment of shipments) {
    const item = deriveShipmentItem(shipment);
    if (item) items.push(withRiskSignals(item));
  }
  for (const lot of inventoryLots) {
    const item = deriveInventoryLotItem({
      ...lot,
      inspection: resolveInspection(lot),
      hasActiveListing: activeListingSkuIds.has(lot.skuId),
    });
    if (item) items.push(withRiskSignals(item));
  }
  for (const unit of pendingListingUnits) {
    const item = deriveItemUnitListingItem({
      ...unit,
      inspection: resolveInspection(unit),
    });
    if (item) items.push(withRiskSignals(item));
  }
  for (const unit of returnInspectionUnits) {
    const item = deriveReturnInspectionItem(unit);
    if (item) items.push(withRiskSignals(item));
  }

  const filtered = queue ? items.filter((i) => i.queue === queue) : items.filter((i) => ACTIVE_QUEUES.includes(i.queue));

  filtered.sort((a, b) => {
    const priorityWeight = { critical: 0, warning: 1, normal: 2 };
    const diff = priorityWeight[a.priority] - priorityWeight[b.priority];
    if (diff !== 0) return diff;
    return new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime();
  });

  return filtered.slice(0, limit);
}

export async function getQueueCounts(storeId: string): Promise<QueueCounts> {
  const items = await collectWorkItems(storeId, undefined, 500);
  return countWorkItems(items);
}

export interface RecentActivityItem {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  href?: string;
}

export async function getRecentActivity(storeId: string, limit = 20): Promise<RecentActivityItem[]> {
  const [entries, orders, sales] = await Promise.all([
    prisma.quickEntry.findMany({
      where: { storeId },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        rawProductName: true,
        workflowStage: true,
        processedStatus: true,
        updatedAt: true,
      },
    }),
    prisma.purchaseOrder.findMany({
      where: { storeId },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: { id: true, orderNo: true, status: true, updatedAt: true },
    }),
    prisma.customerOrder.findMany({
      where: { storeId },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: { id: true, orderNumber: true, orderStatus: true, updatedAt: true },
    }),
  ]);

  const merged: RecentActivityItem[] = [
    ...entries.map((e) => ({
      id: `qe-act-${e.id}`,
      title: e.rawProductName,
      description: `快速录入 · ${e.workflowStage} · ${e.processedStatus}`,
      timestamp: e.updatedAt.toISOString(),
      href: "/workbench",
    })),
    ...orders.map((o) => ({
      id: `po-act-${o.id}`,
      title: o.orderNo,
      description: `采购单 · ${o.status}`,
      timestamp: o.updatedAt.toISOString(),
      href: `/procurement/${o.id}`,
    })),
    ...sales.map((s) => ({
      id: `co-act-${s.id}`,
      title: s.orderNumber,
      description: `销售订单 · ${s.orderStatus}`,
      timestamp: s.updatedAt.toISOString(),
      href: `/sales/${s.id}`,
    })),
  ];

  return merged
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

export interface WorkItemDetail extends WorkItem {
  lifecycle: LifecycleEvent[];
  shipments: ShipmentLeg[];
  actionContext: Record<string, string | null>;
}

export interface ProductTicketActivity {
  id: string;
  label: string;
  description: string;
  timestamp: string;
}

export interface ProductTicket {
  id: string;
  entityType: WorkItem["entityType"];
  entityId: string;
  title: string;
  subtitle?: string;
  skuCode?: string;
  imageUrl?: string | null;
  currentStatusLabel: string;
  lifecycleStage: ProductLifecycleStage;
  lifecycleStageLabel: string;
  primaryActionLabel: string;
  priority: WorkItem["priority"];
  queue: WorkQueue;
  locationText?: string | null;
  platformText?: string | null;
  inventoryStatus?: string | null;
  profitStatus?: string | null;
  assigneeName?: string | null;
  exceptionMessage?: string | null;
  detailHref?: string;
  lifecycle: LifecycleEvent[];
  shipments: ShipmentLeg[];
  subProcesses: SubProcessState[];
  actionContext: Record<string, string | null>;
  workItemDetail: WorkItemDetail;
  activity: ProductTicketActivity[];
}

export async function getWorkItemDetail(
  entityType: WorkItem["entityType"],
  entityId: string
): Promise<WorkItemDetail | null> {
  if (entityType === "quickEntry") {
    const entry = await prisma.quickEntry.findUnique({ where: { id: entityId } });
    if (!entry) return null;
    const item = deriveQuickEntryWorkItem(entry);
    if (!item) return null;

    const shipments = entry.generatedPurchaseOrderId
      ? await prisma.inboundShipment.findMany({
          where: { purchaseOrderId: entry.generatedPurchaseOrderId },
          include: { fromLocation: true, toLocation: true },
          orderBy: { legIndex: "asc" },
        })
      : [];

    return {
      ...item,
      lifecycle: buildLifecycleEvents({
        purchasedAt: iso(entry.purchaseDate),
        shippedAt: iso(entry.updatedAt),
        inspectedAt: iso(entry.inspectedAt),
        listedAt: entry.generatedListingIds ? iso(entry.updatedAt) : null,
        soldAt: entry.saleDate ? iso(entry.saleDate) : null,
        currentQueue: item.queue,
      }),
      shipments: shipments.map((s) => ({
        id: s.id,
        legIndex: s.legIndex,
        trackingNo: s.trackingNo,
        carrier: s.carrier,
        status: s.status,
        statusLabel: shipmentStatusLabel(s.status),
        fromLocation: s.fromLocation?.name,
        toLocation: s.toLocation?.name,
        shippedAt: iso(s.shippedAt),
        etaDate: iso(s.etaDate),
        receivedAt: iso(s.receivedAt),
      })),
      actionContext: {
        purchaseTrackingNo: entry.purchaseTrackingNo,
        transitTrackingNo: entry.transitTrackingNo,
        currentLocationText: entry.currentLocationText,
        listingPlatformsText: entry.listingPlatformsText,
        customerOrderId: entry.generatedCustomerOrderId,
        errorMessage: entry.errorMessage,
      },
    };
  }

  if (entityType === "customerOrder") {
    const order = await prisma.customerOrder.findUnique({
      where: { id: entityId },
      include: { platform: true, lines: { include: { sku: true, allocations: true } } },
    });
    if (!order) return null;
    const item = deriveCustomerOrderItem(order);
    if (!item) return null;
    return {
      ...item,
      lifecycle: buildLifecycleEvents({
        soldAt: iso(order.orderDate),
        orderShippedAt: iso(order.shippedAt),
        settledAt: iso(order.settledAt),
        currentQueue: item.queue,
      }),
      shipments: [],
      actionContext: {
        trackingNo: order.trackingNo,
        currency: order.currency,
        platformFee: order.platformFee.toString(),
        shippingFee: order.shippingFee.toString(),
        shippedAt: order.shippedAt?.toISOString() ?? null,
        shippingProofJson: order.shippingProof
          ? JSON.stringify(order.shippingProof)
          : null,
      },
    };
  }

  if (entityType === "purchaseOrder") {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: entityId },
      include: {
        lines: { include: { sku: true }, orderBy: { createdAt: "asc" } },
        inboundShipments: { include: { fromLocation: true, toLocation: true }, orderBy: { legIndex: "asc" } },
        destinationLocation: true,
      },
    });
    if (!order) return null;
    const lineIds = order.lines.map((line) => line.id);
    const [inboundLots, inboundUnits, consolidationLines] = lineIds.length
      ? await Promise.all([
          prisma.inventoryLot.findMany({
            where: { storeId: order.storeId, sourceType: "PURCHASE", sourceId: { in: lineIds } },
            select: { sourceId: true },
          }),
          prisma.itemUnit.findMany({
            where: { storeId: order.storeId, sourceType: "PURCHASE", sourceId: { in: lineIds } },
            select: { sourceId: true },
          }),
          prisma.consolidationBatchLine.findMany({
            where: {
              sourceType: "PURCHASE_LINE",
              sourceId: { in: lineIds },
              batch: { storeId: order.storeId, status: { in: ["OPEN", "SEALED", "SHIPPED"] } },
            },
            select: {
              sourceId: true,
              batch: {
                select: {
                  id: true,
                  status: true,
                  updatedAt: true,
                  fromLocation: { select: { name: true } },
                  toLocation: { select: { name: true } },
                },
              },
            },
          }),
        ])
      : [[], [], []];
    const inboundLineIds = new Set([
      ...inboundLots.map((lot) => lot.sourceId),
      ...inboundUnits.map((unit) => unit.sourceId),
    ]);
    const consolidatedLineIds = new Set(consolidationLines.map((line) => line.sourceId));
    const consolidationByLineId = new Map<string, ConsolidationSignal>();
    for (const line of consolidationLines) {
      if (consolidationByLineId.has(line.sourceId)) continue;
      const routeLabel = [
        line.batch.fromLocation?.name,
        line.batch.toLocation?.name,
      ].filter(Boolean).join(" → ");
      consolidationByLineId.set(line.sourceId, {
        batchId: line.batch.id,
        status: line.batch.status,
        label: routeLabel || line.batch.id.slice(-6),
        updatedAt: line.batch.updatedAt,
      });
    }
    const item = derivePurchaseOrderItem({
      ...order,
      lines: order.lines.map((line) => ({
        ...line,
        hasInboundInventory: inboundLineIds.has(line.id),
        hasRoutedToConsolidation: consolidatedLineIds.has(line.id),
        consolidation: consolidationByLineId.get(line.id),
      })),
    });
    if (!item) return null;
    const quickEntries = await prisma.quickEntry.findMany({
      where: { generatedPurchaseLineId: { in: order.lines.map((line) => line.id) } },
      select: { generatedPurchaseLineId: true, conditionType: true },
    });
    const conditionByLineId = new Map(
      quickEntries
        .filter((entry) => entry.generatedPurchaseLineId)
        .map((entry) => [entry.generatedPurchaseLineId!, entry.conditionType])
    );
    return {
      ...item,
      lineItems: item.lineItems?.map((line) => ({
        ...line,
        conditionType: conditionByLineId.get(line.id) ?? line.conditionType,
      })),
      lifecycle: buildLifecycleEvents({
        purchasedAt: iso(order.orderedAt),
        shippedAt: iso(order.shippedAt),
        arrivedAt: iso(order.receivedAt),
        currentQueue: item.queue,
      }),
      shipments: order.inboundShipments.map((s) => ({
        id: s.id,
        legIndex: s.legIndex,
        trackingNo: s.trackingNo,
        carrier: s.carrier,
        status: s.status,
        statusLabel: shipmentStatusLabel(s.status),
        fromLocation: s.fromLocation?.name,
        toLocation: s.toLocation?.name,
        shippedAt: iso(s.shippedAt),
        etaDate: iso(s.etaDate),
        receivedAt: iso(s.receivedAt),
      })),
      actionContext: {
        trackingNo: order.trackingNo,
        carrier: order.carrier,
        etaDate: iso(order.etaDate) ?? null,
        currentLocationText: order.destinationLocation?.name ?? null,
      },
    };
  }

  if (entityType === "shipment") {
    const shipment = await prisma.inboundShipment.findUnique({
      where: { id: entityId },
      include: {
        purchaseOrder: {
          include: { lines: { include: { sku: true }, take: 1 } },
        },
        fromLocation: true,
        toLocation: true,
      },
    });
    if (!shipment) return null;
    const item = deriveShipmentItem({
      id: shipment.id,
      legIndex: shipment.legIndex,
      status: shipment.status,
      trackingNo: shipment.trackingNo,
      receivedAt: shipment.receivedAt,
      updatedAt: shipment.updatedAt,
      createdAt: shipment.createdAt,
      purchaseOrder: shipment.purchaseOrder
        ? { orderNo: shipment.purchaseOrder.orderNo, status: shipment.purchaseOrder.status }
        : null,
      fromLocation: shipment.fromLocation ? { name: shipment.fromLocation.name } : null,
      toLocation: shipment.toLocation ? { name: shipment.toLocation.name } : null,
    });
    if (!item) return null;
    const sku = shipment.purchaseOrder?.lines[0]?.sku;
    return {
      ...item,
      title: sku ? `${sku.code} · ${sku.name}` : item.title,
      skuCode: sku?.code,
      detailHref: shipment.purchaseOrderId ? `/procurement/${shipment.purchaseOrderId}` : undefined,
      lifecycle: buildLifecycleEvents({
        shippedAt: iso(shipment.shippedAt),
        arrivedAt: iso(shipment.receivedAt),
        currentQueue: item.queue,
      }),
      shipments: [{
        id: shipment.id,
        legIndex: shipment.legIndex,
        trackingNo: shipment.trackingNo,
        carrier: shipment.carrier,
        status: shipment.status,
        statusLabel: shipmentStatusLabel(shipment.status),
        fromLocation: shipment.fromLocation?.name,
        toLocation: shipment.toLocation?.name,
        shippedAt: iso(shipment.shippedAt),
        etaDate: iso(shipment.etaDate),
        receivedAt: iso(shipment.receivedAt),
      }],
      actionContext: {
        trackingNo: shipment.trackingNo,
        carrier: shipment.carrier,
        purchaseOrderId: shipment.purchaseOrderId,
      },
    };
  }

  if (entityType === "inventoryLot") {
    const lot = await prisma.inventoryLot.findUnique({
      where: { id: entityId },
      include: {
        sku: true,
        location: true,
        allocations: { include: { orderLine: { include: { order: true } } } },
      },
    });
    if (!lot) return null;
    const activeListing = await prisma.listing.findFirst({
      where: { storeId: lot.storeId, skuId: lot.skuId, status: "ACTIVE" },
      select: { id: true, platform: { select: { name: true } }, listedAt: true },
      orderBy: { listedAt: "desc" },
    });
    const inspection = await getInspectionSignalForEntity(lot.storeId, {
      id: lot.id,
      refType: "INVENTORY_LOT",
      sourceType: lot.sourceType,
      sourceId: lot.sourceId,
    });
    const item = deriveInventoryLotItem({
      id: lot.id,
      status: lot.status,
      sourceType: lot.sourceType,
      sourceId: lot.sourceId,
      unitCost: lot.unitCost,
      costCurrency: lot.costCurrency,
      receivedAt: lot.receivedAt,
      updatedAt: lot.updatedAt,
      createdAt: lot.createdAt,
      sku: { code: lot.sku.code, name: lot.sku.name },
      location: { name: lot.location.name, isSellableDefault: lot.location.isSellableDefault },
      inspection,
      hasActiveListing: Boolean(activeListing),
    }) ?? {
      id: `lot-${lot.id}-detail`,
      entityType: "inventoryLot" as const,
      entityId: lot.id,
      queue: "inStock" as const,
      title: `${lot.sku.code} · ${lot.sku.name}`,
      subtitle: `${lot.location.name} · ${lot.costCurrency} ${lot.unitCost.toString()}`,
      skuCode: lot.sku.code,
      currentStatus: lot.status,
      currentStatusLabel: "库存中",
      primaryAction: "createListing" as const,
      primaryActionLabel: "查看详情",
      priority: "normal" as const,
      waitingSince: lot.updatedAt.toISOString(),
      detailHref: "/inventory/lots",
      metadata: { location: lot.location.name },
    };
    return {
      ...item,
      lifecycle: buildLifecycleEvents({
        arrivedAt: iso(lot.receivedAt),
        inspectedAt: iso(inspection?.inspectedAt),
        listedAt: activeListing ? iso(activeListing.listedAt) : null,
        currentQueue: item.queue,
      }),
      shipments: [],
      actionContext: {
        location: lot.location.name,
        platform: activeListing?.platform.name ?? null,
        status: lot.status,
        skuId: lot.skuId,
      },
    };
  }

  if (entityType === "itemUnit") {
    const unit = await prisma.itemUnit.findUnique({
      where: { id: entityId },
      include: {
        sku: true,
        location: true,
        listings: { include: { platform: true } },
        allocations: { include: { orderLine: { include: { order: true } } } },
      },
    });
    if (!unit) return null;
    const inspection = await getInspectionSignalForEntity(unit.storeId, {
      id: unit.id,
      refType: "ITEM_UNIT",
      sourceType: unit.sourceType,
      sourceId: unit.sourceId,
    });
    const returnInspectionItem = deriveReturnInspectionItem({
      id: unit.id,
      status: unit.status,
      updatedAt: unit.updatedAt,
      createdAt: unit.createdAt,
      conditionGrade: unit.conditionGrade,
      notes: unit.notes,
      sku: unit.sku,
      location: unit.location,
    });
    if (returnInspectionItem) {
      return {
        ...returnInspectionItem,
        lifecycle: buildLifecycleEvents({
          arrivedAt: iso(unit.createdAt),
          currentQueue: returnInspectionItem.queue,
        }),
        shipments: [],
        actionContext: {
          location: unit.location.name,
          status: unit.status,
          conditionGrade: unit.conditionGrade,
          notes: unit.notes,
        },
      };
    }
    const hasActiveListing = unit.listings.some((listing) => listing.status === "ACTIVE");
    const item = deriveItemUnitListingItem({
      id: unit.id,
      status: unit.status,
      updatedAt: unit.updatedAt,
      createdAt: unit.createdAt,
      conditionGrade: unit.conditionGrade,
      sku: { code: unit.sku.code, name: unit.sku.name },
      location: { name: unit.location.name, isSellableDefault: unit.location.isSellableDefault },
      inspection,
      hasActiveListing,
    }) ?? {
      id: `iu-${unit.id}-detail`,
      entityType: "itemUnit" as const,
      entityId: unit.id,
      queue: unit.status === "CONSUMED" ? "completed" as const : "inStock" as const,
      title: `${unit.sku.code} · ${unit.sku.name}`,
      subtitle: `${unit.conditionGrade ?? "单品"} · ${unit.location.name}`,
      skuCode: unit.sku.code,
      currentStatus: unit.status,
      currentStatusLabel: unit.status === "CONSUMED" ? "已售出" : hasActiveListing ? "已上架" : "库存中",
      primaryAction: hasActiveListing ? ("viewDetails" as const) : ("createListing" as const),
      primaryActionLabel: hasActiveListing
        ? ACTION_LABELS.viewDetails
        : unit.status === "AVAILABLE"
          ? ACTION_LABELS.createListing
          : "查看详情",
      priority: "normal" as const,
      waitingSince: unit.updatedAt.toISOString(),
      detailHref: hasActiveListing ? `/inventory/skus/${unit.skuId}` : `/inventory/items/${unit.id}`,
      metadata: { conditionGrade: unit.conditionGrade },
    };
    const soldAt = unit.allocations[0]?.orderLine.order.orderDate;
    const shippedAt = unit.allocations[0]?.orderLine.order.shippedAt;
    const settledAt = unit.allocations[0]?.orderLine.order.settledAt;
    return {
      ...item,
      lifecycle: buildLifecycleEvents({
        arrivedAt: iso(unit.createdAt),
        inspectedAt: iso(inspection?.inspectedAt),
        listedAt: unit.listings.length > 0 ? iso(unit.listings[0].listedAt) : null,
        soldAt: iso(soldAt),
        orderShippedAt: iso(shippedAt),
        settledAt: iso(settledAt),
        currentQueue: item.queue,
      }),
      shipments: [],
      actionContext: {
        location: unit.location.name,
        platform: unit.listings.map((l) => l.platform.name).join(", "),
        status: unit.status,
      },
    };
  }

  return null;
}

function activityFromDetail(detail: WorkItemDetail): ProductTicketActivity[] {
  return detail.lifecycle
    .filter((event) => event.timestamp)
    .map((event) => ({
      id: `${detail.id}-${event.id}`,
      label: event.label,
      description: event.description ?? detail.title,
      timestamp: event.timestamp!,
    }))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export async function getProductTicketByEntity(
  entityType: WorkItem["entityType"],
  entityId: string
): Promise<ProductTicket | null> {
  const detail = await getWorkItemDetail(entityType, entityId);
  if (!detail) return null;

  const locationText =
    detail.actionContext.currentLocationText ??
    detail.actionContext.location ??
    detail.shipments[0]?.toLocation ??
    null;
  const platformText =
    detail.actionContext.listingPlatformsText ??
    detail.actionContext.platform ??
    null;
  const lifecycleStage = deriveLifecycleStageFromQueue(detail.queue, detail.priority);

  return {
    id: detail.id,
    entityType: detail.entityType,
    entityId: detail.entityId,
    title: detail.title,
    subtitle: detail.subtitle,
    skuCode: detail.skuCode,
    currentStatusLabel: detail.currentStatusLabel,
    lifecycleStage,
    lifecycleStageLabel: LIFECYCLE_LABELS[lifecycleStage],
    primaryActionLabel: detail.primaryActionLabel,
    priority: detail.priority,
    queue: detail.queue,
    locationText,
    platformText,
    inventoryStatus: detail.currentStatusLabel,
    profitStatus: detail.actionContext.netRevenue ? `净收入 ${detail.actionContext.netRevenue}` : "待结算",
    assigneeName: detail.assigneeId ?? "未分配",
    exceptionMessage: detail.exceptionMessage,
    detailHref: detail.detailHref,
    lifecycle: detail.lifecycle,
    shipments: detail.shipments,
    subProcesses: deriveSubProcesses(detail.queue),
    actionContext: detail.actionContext,
    workItemDetail: detail,
    activity: activityFromDetail(detail),
  };
}

export async function syncQuickEntryFromOrder(orderId: string, stage: "SHIPPED" | "SETTLED") {
  await prisma.quickEntry.updateMany({
    where: { generatedCustomerOrderId: orderId },
    data: {
      workflowStage: stage,
      ...(stage === "SETTLED" ? { processedStatus: "COMPLETED", processedAt: new Date() } : {}),
    },
  });
}

export { emptyQueueCounts };
