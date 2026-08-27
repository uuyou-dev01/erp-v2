import type { QuickEntry } from "@prisma/client";
import { formatQuickEntryExceptionMessage } from "@/lib/quick-entry-utils";

export type WorkQueue =
  | "missingLogistics"
  | "inTransit"
  | "pendingArrival"
  | "pendingDisposition"
  | "inspectionException"
  | "inStock"
  | "pendingListing"
  | "listed"
  | "pendingShipment"
  | "shipped"
  | "pendingSettlement"
  | "returnInspection"
  | "completed"
  | "exception";

export type ProductLifecycleStage =
  | "PROCURING"
  | "IN_STOCK"
  | "SELLING"
  | "COMPLETED"
  | "EXCEPTION";

export type SubProcessType = "LOGISTICS" | "INSPECTION" | "LISTING" | "FULFILLMENT" | "SETTLEMENT";

export type PrimaryAction =
  | "fillLogistics"
  | "confirmArrival"
  | "disposition"
  | "inbound"
  | "createListing"
  | "shipOrder"
  | "confirmDelivery"
  | "registerReturn"
  | "cancelOrder"
  | "approveReturnInspection"
  | "settleOrder"
  | "resolveException"
  | "confirmOrder"
  | "receivePurchase"
  | "retryProcess"
  | "viewDetails";

export type EntityType =
  | "quickEntry"
  | "purchaseOrder"
  | "shipment"
  | "sku"
  | "inventoryLot"
  | "itemUnit"
  | "listing"
  | "customerOrder";

export interface WorkItem {
  id: string;
  entityType: EntityType;
  entityId: string;
  queue: WorkQueue;
  lifecycleStage?: ProductLifecycleStage;
  title: string;
  subtitle?: string;
  skuCode?: string;
  currentStatus: string;
  currentStatusLabel: string;
  primaryAction: PrimaryAction;
  primaryActionLabel: string;
  priority: "normal" | "warning" | "critical";
  waitingSince: string;
  assigneeId?: string;
  taskId?: string;
  taskStatus?: string;
  taskStatusLabel?: string;
  taskAssignedToId?: string | null;
  taskAssignedToName?: string | null;
  taskCreatedById?: string | null;
  taskCreatedByName?: string | null;
  taskDueAt?: string | null;
  taskFulfillmentLocationId?: string | null;
  taskFulfillmentLocationName?: string | null;
  taskFulfillmentLocationIds?: string[];
  taskFulfillmentLocationNames?: string[];
  exceptionType?: string;
  exceptionMessage?: string;
  detailHref?: string;
  metadata?: Record<string, string | number | boolean | null>;
  lineItems?: WorkItemLine[];
}

export function workItemMatchesSearch(item: WorkItem, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;
  return Boolean(
    item.title.toLocaleLowerCase().includes(normalizedQuery) ||
    item.subtitle?.toLocaleLowerCase().includes(normalizedQuery) ||
    item.skuCode?.toLocaleLowerCase().includes(normalizedQuery) ||
    item.lineItems?.some(
      (line) =>
        line.title.toLocaleLowerCase().includes(normalizedQuery) ||
        line.skuCode?.toLocaleLowerCase().includes(normalizedQuery)
    ) ||
    Object.values(item.metadata ?? {}).some(
      (value) => typeof value === "string" && value.toLocaleLowerCase().includes(normalizedQuery)
    )
  );
}

export interface WorkItemLine {
  id: string;
  title: string;
  skuCode?: string;
  quantity?: string;
  unitPrice?: string;
  lineAmount?: string;
  conditionType?: string | null;
}

export interface SubProcessState {
  type: SubProcessType;
  label: string;
  status: "idle" | "active" | "blocked" | "done";
  currentStep?: string;
}

export interface QueueCounts {
  missingLogistics: number;
  inTransit: number;
  pendingArrival: number;
  pendingDisposition: number;
  inspectionException: number;
  inStock: number;
  pendingListing: number;
  listed: number;
  pendingShipment: number;
  shipped: number;
  pendingSettlement: number;
  returnInspection: number;
  completed: number;
  exception: number;
  total: number;
}

export interface LifecycleEvent {
  id: string;
  stage: string;
  label: string;
  status: "completed" | "current" | "upcoming" | "failed";
  timestamp?: string;
  description?: string;
}

export interface ShipmentLeg {
  id: string;
  legIndex: number;
  trackingNo?: string | null;
  carrier?: string | null;
  status: string;
  statusLabel: string;
  fromLocation?: string | null;
  toLocation?: string | null;
  shippedAt?: string | null;
  etaDate?: string | null;
  receivedAt?: string | null;
}

export const QUEUE_LABELS: Record<WorkQueue, string> = {
  missingLogistics: "待补物流",
  inTransit: "运输中",
  pendingArrival: "待确认收货",
  pendingDisposition: "待分流",
  inspectionException: "检查异常",
  inStock: "库存中",
  pendingListing: "待上架检查",
  listed: "已有上架记录",
  pendingShipment: "待发货",
  shipped: "已发货",
  pendingSettlement: "待结算",
  returnInspection: "待检查 / 补资料",
  completed: "已完成",
  exception: "异常商品",
};

export const LIFECYCLE_LABELS: Record<ProductLifecycleStage, string> = {
  PROCURING: "采购中",
  IN_STOCK: "库存中",
  SELLING: "销售中",
  COMPLETED: "已完成",
  EXCEPTION: "异常",
};

export function deriveLifecycleStageFromQueue(
  queue: WorkQueue,
  priority: WorkItem["priority"] = "normal"
): ProductLifecycleStage {
  if (queue === "exception" || queue === "inspectionException" || priority === "critical") {
    return "EXCEPTION";
  }
  if (
    queue === "missingLogistics" ||
    queue === "inTransit" ||
    queue === "pendingArrival" ||
    queue === "pendingDisposition"
  ) {
    return "PROCURING";
  }
  if (
    queue === "pendingListing" ||
    queue === "listed" ||
    queue === "inStock" ||
    queue === "returnInspection"
  ) {
    return "IN_STOCK";
  }
  if (queue === "pendingShipment" || queue === "shipped" || queue === "pendingSettlement") {
    return "SELLING";
  }
  return "COMPLETED";
}

export function deriveSubProcesses(queue: WorkQueue): SubProcessState[] {
  const active = (type: SubProcessType, currentStep: string, blocked = false): SubProcessState => ({
    type,
    label: {
      LOGISTICS: "物流流程",
      INSPECTION: "质检流程",
      LISTING: "上架流程",
      FULFILLMENT: "发货流程",
      SETTLEMENT: "结算流程",
    }[type],
    status: blocked ? "blocked" : "active",
    currentStep,
  });

  if (queue === "missingLogistics") return [active("LOGISTICS", "待补物流")];
  if (queue === "inTransit" || queue === "pendingArrival")
    return [active("LOGISTICS", QUEUE_LABELS[queue])];
  if (queue === "pendingDisposition") return [active("LOGISTICS", "待分流")];
  if (queue === "inspectionException") {
    return [active("INSPECTION", QUEUE_LABELS[queue], true)];
  }
  if (queue === "pendingListing" || queue === "listed")
    return [active("LISTING", QUEUE_LABELS[queue])];
  if (queue === "returnInspection") return [active("INSPECTION", QUEUE_LABELS[queue])];
  if (queue === "pendingShipment" || queue === "shipped")
    return [active("FULFILLMENT", QUEUE_LABELS[queue])];
  if (queue === "pendingSettlement") return [active("SETTLEMENT", QUEUE_LABELS[queue])];
  if (queue === "exception") return [active("LOGISTICS", "异常处理", true)];
  return [];
}

export const ACTION_LABELS: Record<PrimaryAction, string> = {
  fillLogistics: "填写物流",
  confirmArrival: "确认到货",
  disposition: "分流处理",
  inbound: "确认入库",
  createListing: "添加上架记录",
  shipOrder: "确认发货",
  confirmDelivery: "确认妥投",
  registerReturn: "登记退货",
  cancelOrder: "取消订单",
  approveReturnInspection: "检查并放行",
  settleOrder: "录入结算",
  resolveException: "处理异常",
  confirmOrder: "确认订单",
  receivePurchase: "确认收货",
  retryProcess: "重新处理",
  viewDetails: "查看详情",
};

export const WORKFLOW_STAGES: Array<{ key: WorkQueue; label: string }> = [
  { key: "missingLogistics", label: "待补物流" },
  { key: "inTransit", label: "运输中" },
  { key: "pendingArrival", label: "待确认收货" },
  { key: "pendingDisposition", label: "待分流" },
  { key: "inspectionException", label: "检查异常" },
  { key: "pendingListing", label: "待上架检查" },
  { key: "pendingShipment", label: "待发货" },
  { key: "shipped", label: "已发货" },
  { key: "pendingSettlement", label: "待结算" },
  { key: "returnInspection", label: "待检查 / 补资料" },
  { key: "completed", label: "已完成" },
  { key: "exception", label: "异常商品" },
];

export function getVisibleWorkflowStages(
  counts: QueueCounts,
  _selectedQueue: WorkQueue | "all" = "all"
) {
  return WORKFLOW_STAGES.filter((stage) => counts[stage.key] > 0);
}

function isoDate(value?: Date | string | null) {
  if (!value) return new Date().toISOString();
  return value instanceof Date ? value.toISOString() : value;
}

function productTitle(entry: Pick<QuickEntry, "rawBrand" | "rawProductName" | "rawVariant">) {
  return [entry.rawBrand, entry.rawProductName, entry.rawVariant].filter(Boolean).join(" · ");
}

export function deriveQuickEntryWorkItem(entry: QuickEntry): WorkItem | null {
  const waitingSince = entry.updatedAt ?? entry.createdAt;
  const title = productTitle(entry);
  const hasOperationalObject = Boolean(
    entry.generatedPurchaseOrderId ||
    entry.generatedLotId ||
    entry.generatedItemUnitIds ||
    entry.generatedListingIds ||
    entry.generatedCustomerOrderId
  );
  const base = {
    entityType: "quickEntry" as const,
    entityId: entry.id,
    title,
    subtitle: entry.batchNote ?? entry.purchasePlatformText ?? undefined,
    waitingSince: isoDate(waitingSince),
    detailHref: "/workbench",
    metadata: {
      conditionType: entry.conditionType,
      workflowStage: entry.workflowStage,
      processedStatus: entry.processedStatus,
      incompleteReasonCodes: entry.errorMessage,
    },
  };

  if (entry.processedStatus === "FAILED") {
    return {
      ...base,
      id: `qe-${entry.id}-exception`,
      queue: "exception",
      currentStatus: entry.processedStatus,
      currentStatusLabel: "处理失败",
      primaryAction: "resolveException",
      primaryActionLabel: ACTION_LABELS.resolveException,
      priority: "critical",
      exceptionType: "process_failed",
      exceptionMessage: formatQuickEntryExceptionMessage(entry.errorMessage ?? "结构化处理失败"),
    };
  }

  if (hasOperationalObject) return null;

  if (entry.processedStatus === "PARTIAL") {
    return {
      ...base,
      id: `qe-${entry.id}-partial`,
      queue: "exception",
      currentStatus: entry.processedStatus,
      currentStatusLabel: "录入待补全",
      primaryAction: "resolveException",
      primaryActionLabel: ACTION_LABELS.resolveException,
      priority: "warning",
      exceptionMessage: formatQuickEntryExceptionMessage(entry.errorMessage ?? "字段待补全"),
    };
  }

  return null;
}

export function emptyQueueCounts(): QueueCounts {
  return {
    missingLogistics: 0,
    inTransit: 0,
    pendingArrival: 0,
    pendingDisposition: 0,
    inspectionException: 0,
    inStock: 0,
    pendingListing: 0,
    listed: 0,
    pendingShipment: 0,
    shipped: 0,
    pendingSettlement: 0,
    returnInspection: 0,
    completed: 0,
    exception: 0,
    total: 0,
  };
}

export function countWorkItems(items: WorkItem[]): QueueCounts {
  const counts = emptyQueueCounts();
  for (const item of items) {
    counts[item.queue] += 1;
    counts.total += 1;
  }
  return counts;
}

export function buildLifecycleEvents(input: {
  purchasedAt?: string | null;
  shippedAt?: string | null;
  arrivedAt?: string | null;
  inspectedAt?: string | null;
  listedAt?: string | null;
  soldAt?: string | null;
  orderShippedAt?: string | null;
  settledAt?: string | null;
  currentQueue?: WorkQueue;
}): LifecycleEvent[] {
  const stages: Array<Omit<LifecycleEvent, "status">> = [
    {
      id: "purchase",
      stage: "purchase",
      label: "采购录入",
      timestamp: input.purchasedAt ?? undefined,
      description: "商品进入采购流程",
    },
    {
      id: "logistics",
      stage: "logistics",
      label: "物流运输",
      timestamp: input.shippedAt ?? undefined,
      description: "补齐物流后等待到货",
    },
    {
      id: "arrival",
      stage: "arrival",
      label: "确认到货",
      timestamp: input.arrivedAt ?? undefined,
      description: "确认到货位置和后续处理方式",
    },
    {
      id: "disposition",
      stage: "disposition",
      label: "待分流",
      timestamp: undefined,
      description: "决定入库、集运、换仓或其他后续处理",
    },
    {
      id: "inspection",
      stage: "inspection",
      label: "到货检查",
      timestamp: input.inspectedAt ?? undefined,
      description: "记录新品或中古质检结果",
    },
    {
      id: "stock",
      stage: "stock",
      label: "入库可售",
      timestamp: input.arrivedAt ?? undefined,
      description: "商品成为可运营库存",
    },
    {
      id: "listing",
      stage: "listing",
      label: "上架记录",
      timestamp: input.listedAt ?? undefined,
      description: "添加上架记录或同步库存",
    },
    {
      id: "sold",
      stage: "sold",
      label: "售出",
      timestamp: input.soldAt ?? undefined,
      description: "商品已产生销售订单",
    },
    {
      id: "fulfillment",
      stage: "fulfillment",
      label: "发货履约",
      timestamp: input.orderShippedAt ?? undefined,
      description: "确认发货并扣减库存",
    },
    {
      id: "settlement",
      stage: "settlement",
      label: "结算记账",
      timestamp: input.settledAt ?? undefined,
      description: "录入费用并确认利润",
    },
  ];

  const currentIndexMap: Partial<Record<WorkQueue, number>> = {
    missingLogistics: 1,
    inTransit: 1,
    pendingArrival: 2,
    pendingDisposition: 3,
    inspectionException: 4,
    inStock: 5,
    pendingListing: 6,
    listed: 6,
    returnInspection: 5,
    pendingShipment: 8,
    shipped: 8,
    pendingSettlement: 9,
    completed: 9,
    exception: 4,
  };

  const currentIndex = input.currentQueue ? (currentIndexMap[input.currentQueue] ?? 0) : 0;

  return stages.map((stage, index) => {
    let status: LifecycleEvent["status"] = "upcoming";
    if (stage.timestamp) status = "completed";
    else if (index === currentIndex) status = "current";
    else if (input.currentQueue === "inspectionException" && index === 3) status = "failed";
    return { ...stage, status };
  });
}

export function shipmentStatusLabel(status: string) {
  const map: Record<string, string> = {
    PENDING: "待发出",
    IN_TRANSIT: "运输中",
    DELIVERED: "已到达",
    EXCEPTION: "异常",
  };
  return map[status] ?? status;
}
