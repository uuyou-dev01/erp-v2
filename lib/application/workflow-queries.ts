import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";
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
import { RESERVING_ALLOCATION_STATUSES } from "@/lib/application/order-allocation";
import { formatItemUnitCondition } from "@/lib/inventory/item-unit-display";
import { deriveItemUnitOperationalState } from "@/lib/application/item-unit-operational-state";
import { getLatestFxRate } from "@/lib/fx";

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

export function derivePurchaseOrderItem(order: {
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
  destinationLocation?: { name: string; isSellableDefault: boolean } | null;
}): WorkItem | null {
  const waitingSince = order.updatedAt ?? order.createdAt;
  const totalQty = order.lines.reduce((sum, line) => sum + Number(line.quantity.toString()), 0);
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
    subtitle: [
      `${order.orderNo} · ${order.currency} ${order.totalAmount.toString()}`,
      order.destinationLocation?.name ? `→ ${order.destinationLocation.name}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
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
      trackingNo: order.trackingNo,
      destinationLocationName: order.destinationLocation?.name ?? null,
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

  const hasShipmentTask = order.inboundShipments?.some(
    (shipment) =>
      shipment.status === "PENDING" ||
      shipment.status === "IN_TRANSIT" ||
      shipment.status === "EXCEPTION" ||
      (shipment.status === "DELIVERED" && !shipment.receivedAt)
  );

  const isShippedWithoutTracking = order.status === "SHIPPED" && !order.trackingNo?.trim();
  if (
    (order.status === "ORDERED" || order.status === "SHIPPED") &&
    (order.trackingNo?.trim() || isShippedWithoutTracking) &&
    order.lines.length > 0 &&
    !hasShipmentTask
  ) {
    return {
      ...base,
      id: `po-${order.id}-receive`,
      queue: "pendingArrival",
      currentStatus: order.status,
      currentStatusLabel: isShippedWithoutTracking ? "运输中 · 运单待补" : "待确认收货",
      primaryAction: "receivePurchase",
      primaryActionLabel: ACTION_LABELS.receivePurchase,
      priority: isShippedWithoutTracking ? "warning" : "normal",
      metadata: { ...base.metadata, trackingNo: order.trackingNo },
    };
  }

  const activeConsolidation = order.lines.find(
    (line) => line.hasRoutedToConsolidation && line.consolidation
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
        outboundTrackingNo: activeConsolidation.outboundTrackingNo,
      },
    };
  }

  const hasUnroutedPurchaseInventory = order.lines.some(
    (line) => !line.hasInboundInventory && !line.hasRoutedToConsolidation
  );
  const arrivedAtTransitNode = order.destinationLocation?.isSellableDefault === false;
  if (
    order.status === "RECEIVED" &&
    !hasShipmentTask &&
    (hasUnroutedPurchaseInventory || arrivedAtTransitNode)
  ) {
    return {
      ...base,
      id: `po-${order.id}-disposition`,
      queue: "pendingDisposition",
      currentStatus: order.status,
      currentStatusLabel: arrivedAtTransitNode ? "转运仓待分流" : "待分流",
      primaryAction: "disposition",
      primaryActionLabel: ACTION_LABELS.disposition,
      priority: "normal",
      metadata: {
        ...base.metadata,
        currentLocation: order.destinationLocation?.name ?? null,
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
  outboundTrackingNo: string | null;
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
  lines: Array<{
    id: string;
    quantity: { toString(): string };
    sku: { code: string; name: string; imageUrl?: string | null };
    allocations: Array<{
      quantity: { toString(): string };
      status: string;
    }>;
  }>;
}): WorkItem | null {
  const sku = order.lines[0]?.sku;
  const lineItems: WorkItemLine[] = order.lines.map((line) => ({
    id: line.id,
    title: line.sku.name,
    skuCode: line.sku.code,
    imageUrl: line.sku.imageUrl ?? null,
    quantity: line.quantity.toString(),
  }));
  const waitingSince = order.updatedAt ?? order.createdAt;
  const hasCompleteReservations =
    order.lines.length > 0 &&
    order.lines.every((line) => {
      const reservedQuantity = line.allocations
        .filter((allocation) =>
          RESERVING_ALLOCATION_STATUSES.includes(
            allocation.status as (typeof RESERVING_ALLOCATION_STATUSES)[number]
          )
        )
        .reduce(
          (sum, allocation) => sum.plus(new Decimal(allocation.quantity.toString())),
          new Decimal(0)
        );
      return reservedQuantity.eq(new Decimal(line.quantity.toString()));
    });
  const base = {
    entityType: "customerOrder" as const,
    entityId: order.id,
    title: sku ? `${sku.code} · ${sku.name}` : order.orderNumber,
    subtitle: `${order.platform?.name ?? "直售"} · ${order.customerName}`,
    skuCode: sku?.code,
    imageUrl: sku?.imageUrl ?? null,
    lineItems,
    waitingSince: waitingSince.toISOString(),
    detailHref: `/sales/${order.id}`,
  };

  if (order.orderStatus === "DRAFT" && hasCompleteReservations) {
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

  if (order.orderStatus === "CONFIRMED" && hasCompleteReservations) {
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

  if ((order.orderStatus === "DELIVERED" || order.orderStatus === "SHIPPED") && order.settledAt) {
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
  purchaseOrder: {
    orderNo: string;
    status?: string;
    lines?: Array<{ quantity: { toString(): string } }>;
  } | null;
  fromLocation: { name: string } | null;
  toLocation: { name: string } | null;
}): WorkItem | null {
  const waitingSince = shipment.updatedAt ?? shipment.createdAt;
  const legLabel = shipment.legIndex <= 1 ? "购买地在途" : "转运在途";
  const isPurchaseLeg = shipment.legIndex <= 1;
  if (isPurchaseLeg && shipment.purchaseOrder?.status === "RECEIVED") return null;
  if (shipment.status === "DELIVERED" && shipment.receivedAt) return null;
  const routeLabel = [shipment.fromLocation?.name, shipment.toLocation?.name]
    .filter(Boolean)
    .join(" → ");
  const base = {
    entityType: "shipment" as const,
    entityId: shipment.id,
    title: shipment.trackingNo ?? shipment.purchaseOrder?.orderNo ?? "物流段",
    subtitle: [legLabel, routeLabel].filter(Boolean).join(" · "),
    waitingSince: waitingSince.toISOString(),
    metadata: {
      trackingNo: shipment.trackingNo,
      totalQty:
        shipment.purchaseOrder?.lines?.reduce(
          (sum, line) => sum + Number(line.quantity.toString()),
          0
        ) ?? 0,
    },
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
    subtitle: `${formatItemUnitCondition(item.conditionGrade)} · ${item.location.name}`,
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
  sourceType: string;
  conditionType: string;
  conditionGrade: string | null;
  functionStatus: string;
  photos: unknown;
  notes: string | null;
  sku: { code: string; name: string };
  location: { name: string; isSellableDefault?: boolean };
  inspection?: InspectionSignal | null;
  hasAfterSalesReceipt?: boolean;
}): WorkItem | null {
  if (item.status !== "RETURN_CHECK") return null;

  const operationalState = deriveItemUnitOperationalState({
    status: item.status,
    sourceType: item.sourceType,
    conditionType: item.conditionType,
    conditionGrade: item.conditionGrade,
    functionStatus: item.functionStatus,
    notes: item.notes,
    photoCount: Array.isArray(item.photos) ? item.photos.length : 0,
    locationName: item.location.name,
    locationSellable: item.location.isSellableDefault,
    latestInspectionResult: item.inspection?.result,
    latestInspectionFailureReason: item.inspection?.failureReason,
    hasAfterSalesReceipt: item.hasAfterSalesReceipt,
  });
  const failedInspection = operationalState.workflowReason === "INSPECTION_FAILED";
  const canReleaseDirectly =
    operationalState.canReleaseToSale &&
    ["CUSTOMER_RETURN_QC", "PURCHASE_QC", "INVENTORY_QC"].includes(operationalState.workflowReason);

  return {
    id: `iu-${item.id}-return-check`,
    entityType: "itemUnit",
    entityId: item.id,
    queue: failedInspection ? "inspectionException" : "returnInspection",
    title: `${item.sku.code} · ${item.sku.name}`,
    subtitle: `${formatItemUnitCondition(item.conditionGrade)} · ${operationalState.physicalLabel}`,
    skuCode: item.sku.code,
    currentStatus: item.status,
    currentStatusLabel: operationalState.statusLabel,
    primaryAction: failedInspection
      ? "resolveException"
      : canReleaseDirectly
        ? "approveReturnInspection"
        : "viewDetails",
    primaryActionLabel: failedInspection
      ? ACTION_LABELS.resolveException
      : canReleaseDirectly
        ? "检验并放行"
        : (operationalState.nextActionLabel ?? ACTION_LABELS.viewDetails),
    priority: failedInspection ? "critical" : "warning",
    waitingSince: (item.updatedAt ?? item.createdAt).toISOString(),
    detailHref: `/inventory/items/${item.id}`,
    exceptionType: failedInspection ? "inspection_failed" : undefined,
    exceptionMessage: failedInspection ? operationalState.explanation : undefined,
    metadata: {
      conditionGrade: item.conditionGrade,
      physicalState: operationalState.physicalState,
      physicalStateLabel: operationalState.physicalLabel,
      availabilityState: operationalState.availabilityState,
      availabilityStateLabel: operationalState.availabilityLabel,
      qualityState: operationalState.qualityState,
      qualityStateLabel: operationalState.qualityLabel,
      workflowReason: operationalState.workflowReason,
      statusExplanation: operationalState.explanation,
    },
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

  if (
    lot.inspection.result === "PASSED" &&
    lot.location.isSellableDefault &&
    !lot.hasActiveListing
  ) {
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
  entity: {
    id: string;
    refType: "INVENTORY_LOT" | "ITEM_UNIT";
    sourceType: string;
    sourceId: string;
  }
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
    returnInspection: { days: 2, message: "待检查或补资料超时" },
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

export async function collectWorkItems(
  storeId: string,
  queue?: WorkQueue,
  limit = 100
): Promise<WorkItem[]> {
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
        destinationLocation: { select: { name: true, isSellableDefault: true } },
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
        purchaseOrder: {
          select: {
            orderNo: true,
            status: true,
            lines: { select: { quantity: true } },
          },
        },
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
        location: { select: { name: true, isSellableDefault: true } },
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
                outboundTrackingNo: true,
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
  const consolidatedPurchaseLineIds = new Set(consolidationLineRefs.map((line) => line.sourceId));
  const consolidationByLineId = new Map<string, ConsolidationSignal>();
  for (const line of consolidationLineRefs) {
    if (consolidationByLineId.has(line.sourceId)) continue;
    const routeLabel = [line.batch.fromLocation?.name, line.batch.toLocation?.name]
      .filter(Boolean)
      .join(" → ");
    consolidationByLineId.set(line.sourceId, {
      batchId: line.batch.id,
      status: line.batch.status,
      label: routeLabel || line.batch.id.slice(-6),
      outboundTrackingNo: line.batch.outboundTrackingNo,
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
    ...returnInspectionUnits.flatMap((unit) => [
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
  const afterSalesReceiptItemIds = new Set(
    returnInspectionUnits.length > 0
      ? (
          await prisma.afterSalesReceipt.findMany({
            where: { itemUnitId: { in: returnInspectionUnits.map((unit) => unit.id) } },
            select: { itemUnitId: true },
          })
        )
          .map((receipt) => receipt.itemUnitId)
          .filter((id): id is string => Boolean(id))
      : []
  );

  const resolveInspection = (entity: { id: string; sourceType: string; sourceId: string }) => {
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
    const item = deriveReturnInspectionItem({
      ...unit,
      inspection: resolveInspection(unit),
      hasAfterSalesReceipt: afterSalesReceiptItemIds.has(unit.id),
    });
    if (item) items.push(withRiskSignals(item));
  }

  const filtered = queue
    ? items.filter((i) => i.queue === queue)
    : items.filter((i) => ACTIVE_QUEUES.includes(i.queue));

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

export async function getRecentActivity(
  storeId: string,
  limit = 20
): Promise<RecentActivityItem[]> {
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
  fulfillmentContext?: ShipmentFulfillmentContext;
}

export interface ShipmentFulfillmentAllocation {
  id: string;
  allocationType: "LOT" | "ITEM_UNIT";
  inventoryId: string;
  inventoryReference: string;
  skuCode: string;
  skuName: string;
  imageUrl: string | null;
  quantity: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  remainingAfterShipment: string | null;
}

export interface ShipmentFulfillmentLocation {
  id: string;
  code: string;
  name: string;
  quantity: string;
}

export interface ShipmentFulfillmentContext {
  allocations: ShipmentFulfillmentAllocation[];
  locations: ShipmentFulfillmentLocation[];
  totalQuantity: string;
  isMultiLocation: boolean;
  isComplete: boolean;
}

type ShipmentAllocationSource = {
  id: string;
  allocationType: string;
  quantity: { toString(): string };
  status: string;
  orderLine: { sku: { code: string; name: string; imageUrl?: string | null } };
  inventoryLot: {
    id: string;
    batchLabel: string | null;
    location: { id: string; code: string; name: string };
  } | null;
  itemUnit: {
    id: string;
    unitCode: string | null;
    labelCode: string | null;
    location: { id: string; code: string; name: string };
  } | null;
};

type ShipmentLedgerSource = {
  entityType: string;
  entityId: string;
  deltaQty: { toString(): string };
};

function compactQuantity(value: Decimal) {
  return value.toDecimalPlaces(4).toString();
}

export function buildShipmentFulfillmentContext(
  sourceAllocations: ShipmentAllocationSource[],
  ledgers: ShipmentLedgerSource[]
): ShipmentFulfillmentContext {
  const activeAllocations = sourceAllocations.filter((allocation) =>
    RESERVING_ALLOCATION_STATUSES.includes(
      allocation.status as (typeof RESERVING_ALLOCATION_STATUSES)[number]
    )
  );
  const ledgerBalanceByInventory = new Map<string, Decimal>();
  for (const ledger of ledgers) {
    const key = `${ledger.entityType}:${ledger.entityId}`;
    ledgerBalanceByInventory.set(
      key,
      (ledgerBalanceByInventory.get(key) ?? new Decimal(0)).plus(ledger.deltaQty.toString())
    );
  }

  let mappedAllocationCount = 0;
  const grouped = new Map<
    string,
    Omit<ShipmentFulfillmentAllocation, "id" | "quantity" | "remainingAfterShipment"> & {
      ids: string[];
      quantity: Decimal;
    }
  >();
  for (const allocation of activeAllocations) {
    const inventory = allocation.inventoryLot ?? allocation.itemUnit;
    if (!inventory) continue;
    mappedAllocationCount += 1;
    const isLot = Boolean(allocation.inventoryLot);
    const key = `${isLot ? "LOT" : "ITEM_UNIT"}:${inventory.id}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.ids.push(allocation.id);
      existing.quantity = existing.quantity.plus(allocation.quantity.toString());
      continue;
    }
    grouped.set(key, {
      ids: [allocation.id],
      allocationType: isLot ? "LOT" : "ITEM_UNIT",
      inventoryId: inventory.id,
      inventoryReference: isLot
        ? allocation.inventoryLot?.batchLabel || `批次 ${inventory.id.slice(-8)}`
        : allocation.itemUnit?.unitCode ||
          allocation.itemUnit?.labelCode ||
          `单件 ${inventory.id.slice(-8)}`,
      skuCode: allocation.orderLine.sku.code,
      skuName: allocation.orderLine.sku.name,
      imageUrl: allocation.orderLine.sku.imageUrl ?? null,
      quantity: new Decimal(allocation.quantity.toString()),
      locationId: inventory.location.id,
      locationCode: inventory.location.code,
      locationName: inventory.location.name,
    });
  }

  const allocations = Array.from(grouped.entries()).map(([key, allocation]) => {
    const balance = ledgerBalanceByInventory.get(key);
    return {
      id: allocation.ids.join(","),
      allocationType: allocation.allocationType,
      inventoryId: allocation.inventoryId,
      inventoryReference: allocation.inventoryReference,
      skuCode: allocation.skuCode,
      skuName: allocation.skuName,
      imageUrl: allocation.imageUrl,
      quantity: compactQuantity(allocation.quantity),
      locationId: allocation.locationId,
      locationCode: allocation.locationCode,
      locationName: allocation.locationName,
      remainingAfterShipment: balance
        ? compactQuantity(Decimal.max(balance.minus(allocation.quantity), 0))
        : null,
    } satisfies ShipmentFulfillmentAllocation;
  });

  const locationMap = new Map<string, ShipmentFulfillmentLocation & { amount: Decimal }>();
  for (const allocation of allocations) {
    const existing = locationMap.get(allocation.locationId);
    if (existing) {
      existing.amount = existing.amount.plus(allocation.quantity);
      existing.quantity = compactQuantity(existing.amount);
      continue;
    }
    const amount = new Decimal(allocation.quantity);
    locationMap.set(allocation.locationId, {
      id: allocation.locationId,
      code: allocation.locationCode,
      name: allocation.locationName,
      quantity: compactQuantity(amount),
      amount,
    });
  }
  const locations = Array.from(locationMap.values()).map(
    ({ amount: _amount, ...location }) => location
  );
  const totalQuantity = allocations.reduce(
    (sum, allocation) => sum.plus(allocation.quantity),
    new Decimal(0)
  );

  return {
    allocations,
    locations,
    totalQuantity: compactQuantity(totalQuantity),
    isMultiLocation: locations.length > 1,
    isComplete: activeAllocations.length > 0 && mappedAllocationCount === activeAllocations.length,
  };
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
        purchasePrice: entry.purchasePrice?.toString() ?? null,
        purchaseCurrency: entry.purchaseCurrency,
        salePrice: entry.salePrice?.toString() ?? null,
        saleCurrency: entry.saleCurrency,
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
      include: {
        platform: true,
        lines: {
          include: {
            sku: true,
            allocations: {
              include: {
                inventoryLot: { include: { location: true } },
                itemUnit: { include: { location: true } },
              },
            },
          },
        },
      },
    });
    if (!order) return null;
    const item = deriveCustomerOrderItem(order);
    if (!item) return null;
    const allocationSources = order.lines.flatMap((line) =>
      line.allocations.map((allocation) => ({
        ...allocation,
        orderLine: { sku: line.sku },
      }))
    );
    const lotIds = allocationSources
      .map((allocation) => allocation.inventoryLot?.id)
      .filter((id): id is string => Boolean(id));
    const itemUnitIds = allocationSources
      .map((allocation) => allocation.itemUnit?.id)
      .filter((id): id is string => Boolean(id));
    const inventoryLedgers =
      lotIds.length || itemUnitIds.length
        ? await prisma.stockLedger.findMany({
            where: {
              OR: [
                ...(lotIds.length ? [{ entityType: "LOT", entityId: { in: lotIds } }] : []),
                ...(itemUnitIds.length
                  ? [{ entityType: "ITEM_UNIT", entityId: { in: itemUnitIds } }]
                  : []),
              ],
            },
            select: { entityType: true, entityId: true, deltaQty: true },
          })
        : [];
    const fulfillmentContext = buildShipmentFulfillmentContext(allocationSources, inventoryLedgers);
    const baseCurrency = "CNY";
    const orderCurrency = order.currency.trim().toUpperCase();
    const suggestedSettlementFxRate =
      order.settlementFxRate ??
      (orderCurrency === baseCurrency
        ? new Decimal(1)
        : await getLatestFxRate(orderCurrency, baseCurrency, new Date()));
    return {
      ...item,
      lifecycle: buildLifecycleEvents({
        soldAt: iso(order.orderDate),
        orderShippedAt: iso(order.shippedAt),
        settledAt: iso(order.settledAt),
        currentQueue: item.queue,
      }),
      shipments: [],
      fulfillmentContext,
      actionContext: {
        trackingNo: order.trackingNo,
        orderNumber: order.orderNumber,
        shippingCountry: order.shippingCountry,
        currency: order.currency,
        subtotal: order.subtotal.toString(),
        totalPaid: order.totalPaid.toString(),
        platformFee: order.platformFee.toString(),
        shippingFee: order.shippingFee.toString(),
        shippingFeeStatus: order.shippingFeeStatus,
        netRevenue: order.netRevenue?.toString() ?? null,
        settlementFxRate: order.settlementFxRate?.toString() ?? null,
        settlementBaseCurrency: order.settlementBaseCurrency ?? baseCurrency,
        settlementNetRevenueBase: order.settlementNetRevenueBase?.toString() ?? null,
        suggestedSettlementFxRate: suggestedSettlementFxRate?.toString() ?? null,
        shippedAt: order.shippedAt?.toISOString() ?? null,
        shippingProofJson: order.shippingProof ? JSON.stringify(order.shippingProof) : null,
      },
    };
  }

  if (entityType === "purchaseOrder") {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: entityId },
      include: {
        lines: { include: { sku: true }, orderBy: { createdAt: "asc" } },
        inboundShipments: {
          include: { fromLocation: true, toLocation: true },
          orderBy: { legIndex: "asc" },
        },
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
                  outboundTrackingNo: true,
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
      const routeLabel = [line.batch.fromLocation?.name, line.batch.toLocation?.name]
        .filter(Boolean)
        .join(" → ");
      consolidationByLineId.set(line.sourceId, {
        batchId: line.batch.id,
        status: line.batch.status,
        label: routeLabel || line.batch.id.slice(-6),
        outboundTrackingNo: line.batch.outboundTrackingNo,
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
        currency: order.currency,
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
      shipments: [
        {
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
        },
      ],
      actionContext: {
        trackingNo: shipment.trackingNo,
        carrier: shipment.carrier,
        purchaseOrderId: shipment.purchaseOrderId,
        currentLocationText: shipment.toLocation?.name ?? null,
        location: shipment.toLocation?.name ?? null,
      },
    };
  }

  if (entityType === "sku") {
    const sku = await prisma.sKU.findUnique({
      where: { id: entityId },
      include: {
        listings: {
          where: { status: "ACTIVE" },
          include: { platform: true },
          orderBy: { listedAt: "desc" },
        },
      },
    });
    if (!sku) return null;

    return {
      id: `sku-${sku.id}-listing`,
      entityType: "sku",
      entityId: sku.id,
      queue: "pendingListing",
      lifecycleStage: "IN_STOCK",
      title: `${sku.code} · ${sku.name}`,
      subtitle: `${sku.listings.length} 个平台已有上架记录`,
      skuCode: sku.code,
      currentStatus: "PENDING_LISTING",
      currentStatusLabel: "待上架检查",
      primaryAction: "createListing",
      primaryActionLabel: ACTION_LABELS.createListing,
      priority: "normal",
      waitingSince: sku.updatedAt.toISOString(),
      detailHref: `/inventory/skus/${sku.id}`,
      lifecycle: buildLifecycleEvents({ currentQueue: "pendingListing" }),
      shipments: [],
      actionContext: {
        skuId: sku.id,
        platform: sku.listings.map((listing) => listing.platform.name).join(", ") || null,
        status: "PENDING_LISTING",
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
    const [inspection, afterSalesReceipt] = await Promise.all([
      getInspectionSignalForEntity(unit.storeId, {
        id: unit.id,
        refType: "ITEM_UNIT",
        sourceType: unit.sourceType,
        sourceId: unit.sourceId,
      }),
      prisma.afterSalesReceipt.findFirst({
        where: { itemUnitId: unit.id },
        select: { id: true },
      }),
    ]);
    const returnInspectionItem = deriveReturnInspectionItem({
      id: unit.id,
      status: unit.status,
      updatedAt: unit.updatedAt,
      createdAt: unit.createdAt,
      sourceType: unit.sourceType,
      conditionType: unit.conditionType,
      conditionGrade: unit.conditionGrade,
      functionStatus: unit.functionStatus,
      photos: unit.photos,
      notes: unit.notes,
      sku: unit.sku,
      location: unit.location,
      inspection,
      hasAfterSalesReceipt: Boolean(afterSalesReceipt),
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
      queue: unit.status === "CONSUMED" ? ("completed" as const) : ("inStock" as const),
      title: `${unit.sku.code} · ${unit.sku.name}`,
      subtitle: `${formatItemUnitCondition(unit.conditionGrade)} · ${unit.location.name}`,
      skuCode: unit.sku.code,
      currentStatus: unit.status,
      currentStatusLabel:
        unit.status === "CONSUMED" ? "已售出" : hasActiveListing ? "已上架" : "库存中",
      primaryAction: hasActiveListing ? ("viewDetails" as const) : ("createListing" as const),
      primaryActionLabel: hasActiveListing
        ? ACTION_LABELS.viewDetails
        : unit.status === "AVAILABLE"
          ? ACTION_LABELS.createListing
          : "查看详情",
      priority: "normal" as const,
      waitingSince: unit.updatedAt.toISOString(),
      detailHref: hasActiveListing
        ? `/inventory/skus/${unit.skuId}`
        : `/inventory/items/${unit.id}`,
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
    detail.actionContext.listingPlatformsText ?? detail.actionContext.platform ?? null;
  const lifecycleStage = deriveLifecycleStageFromQueue(detail.queue, detail.priority);

  return {
    id: detail.id,
    entityType: detail.entityType,
    entityId: detail.entityId,
    title: detail.title,
    subtitle: detail.subtitle,
    skuCode: detail.skuCode,
    imageUrl: detail.imageUrl,
    currentStatusLabel: detail.currentStatusLabel,
    lifecycleStage,
    lifecycleStageLabel:
      typeof detail.metadata?.physicalStateLabel === "string"
        ? detail.metadata.physicalStateLabel
        : LIFECYCLE_LABELS[lifecycleStage],
    primaryActionLabel: detail.primaryActionLabel,
    priority: detail.priority,
    queue: detail.queue,
    locationText,
    platformText,
    inventoryStatus: detail.currentStatusLabel,
    profitStatus: detail.actionContext.netRevenue
      ? `净收入 ${detail.actionContext.netRevenue}`
      : "待结算",
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
