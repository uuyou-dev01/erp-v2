export type SalesWorkbenchView =
  | "all"
  | "todo"
  | "shipment"
  | "collaboration"
  | "exception"
  | "settlement";

export type SalesBusinessMode = "DIRECT" | "RESALE";

type RelatedStatus = {
  id: string;
  status: string;
};

export type SalesWorkbenchOrder = {
  id: string;
  orderStatus: string;
  settledAt?: Date | string | null;
  resaleListing?: {
    fulfillmentMode?: string | null;
  } | null;
  fulfillmentRequests?: Array<
    RelatedStatus & {
      settlements?: RelatedStatus[];
    }
  >;
  afterSalesCases?: RelatedStatus[];
};

export type SalesOrderWorkbenchState = {
  businessMode: SalesBusinessMode;
  fulfillmentMode: string;
  fulfillmentStatus: string | null;
  settlementStatus: string;
  isTodo: boolean;
  isPendingShipment: boolean;
  isCollaboration: boolean;
  isException: boolean;
  isPendingSettlement: boolean;
  nextAction: {
    label: string;
    href: string;
    emphasis: "primary" | "secondary";
  };
};

const OPEN_COLLABORATION_STATUSES = new Set(["REQUESTED", "ACCEPTED", "SHIPPED", "EXCEPTION"]);
const EXCEPTION_FULFILLMENT_STATUSES = new Set(["REJECTED", "CANCELLED", "EXCEPTION"]);
const CLOSED_AFTER_SALES_STATUSES = new Set(["RESOLVED", "CLOSED", "REJECTED"]);
const PRE_CONFIRMATION_STATUSES = new Set(["DRAFT", "PLACED", "PAID"]);
const SETTLEMENT_READY_STATUSES = new Set(["SHIPPED", "DELIVERED"]);

function activeSettlementStatus(order: SalesWorkbenchOrder) {
  const settlement = order.fulfillmentRequests
    ?.flatMap((request) => request.settlements ?? [])
    .find((item) => item.status !== "VOID");
  if (settlement) return settlement.status;
  if (order.settledAt) return "PAID";
  return SETTLEMENT_READY_STATUSES.has(order.orderStatus) ? "PENDING" : "NOT_READY";
}

export function deriveSalesOrderWorkbenchState(
  order: SalesWorkbenchOrder
): SalesOrderWorkbenchState {
  const businessMode: SalesBusinessMode = order.resaleListing ? "RESALE" : "DIRECT";
  const fulfillmentRequest = order.fulfillmentRequests?.[0];
  const fulfillmentStatus = fulfillmentRequest?.status ?? null;
  const settlementStatus = activeSettlementStatus(order);
  const hasOpenAfterSales = Boolean(
    order.afterSalesCases?.some(
      (afterSalesCase) => !CLOSED_AFTER_SALES_STATUSES.has(afterSalesCase.status)
    )
  );
  const isException =
    hasOpenAfterSales ||
    Boolean(fulfillmentStatus && EXCEPTION_FULFILLMENT_STATUSES.has(fulfillmentStatus));
  const isCollaboration =
    businessMode === "RESALE" &&
    Boolean(fulfillmentStatus && OPEN_COLLABORATION_STATUSES.has(fulfillmentStatus));
  const isTodo = PRE_CONFIRMATION_STATUSES.has(order.orderStatus);
  const isPendingShipment =
    order.orderStatus === "CONFIRMED" &&
    (businessMode === "DIRECT" || fulfillmentStatus === "ACCEPTED");
  const isPendingSettlement = settlementStatus === "PENDING";

  let nextAction: SalesOrderWorkbenchState["nextAction"] = {
    label: "查看订单",
    href: `/sales/${order.id}`,
    emphasis: "secondary",
  };

  if (isException) {
    nextAction = hasOpenAfterSales
      ? { label: "处理售后", href: "/sales/after-sales", emphasis: "primary" }
      : fulfillmentRequest
        ? {
            label: "处理异常",
            href: `/fulfillment/requests/${fulfillmentRequest.id}`,
            emphasis: "primary",
          }
        : { label: "查看异常", href: `/sales/${order.id}`, emphasis: "primary" };
  } else if (businessMode === "RESALE" && fulfillmentRequest) {
    nextAction = {
      label:
        fulfillmentStatus === "REQUESTED"
          ? "查看协作"
          : fulfillmentStatus === "ACCEPTED"
            ? "跟进发货"
            : isPendingSettlement
              ? "查看结算"
              : "查看履约",
      href: isPendingSettlement
        ? `/finance/settlements`
        : `/fulfillment/requests/${fulfillmentRequest.id}`,
      emphasis: fulfillmentStatus === "ACCEPTED" || isPendingSettlement ? "primary" : "secondary",
    };
  } else if (isTodo) {
    nextAction = { label: "继续处理", href: `/sales/${order.id}`, emphasis: "primary" };
  } else if (isPendingShipment) {
    nextAction = {
      label: "去发货",
      href: `/workbench?open=customerOrder:${order.id}`,
      emphasis: "primary",
    };
  } else if (isPendingSettlement) {
    nextAction = { label: "登记结算", href: `/sales/${order.id}`, emphasis: "primary" };
  }

  return {
    businessMode,
    fulfillmentMode:
      order.resaleListing?.fulfillmentMode ??
      (businessMode === "DIRECT" ? "SELF_SHIPS" : "UNKNOWN"),
    fulfillmentStatus,
    settlementStatus,
    isTodo,
    isPendingShipment,
    isCollaboration,
    isException,
    isPendingSettlement,
    nextAction,
  };
}

export function orderMatchesSalesWorkbenchView(
  order: SalesWorkbenchOrder,
  view: SalesWorkbenchView
) {
  if (view === "all") return true;
  const state = deriveSalesOrderWorkbenchState(order);
  if (view === "todo") return state.isTodo;
  if (view === "shipment") return state.isPendingShipment;
  if (view === "collaboration") return state.isCollaboration;
  if (view === "exception") return state.isException;
  return state.isPendingSettlement;
}

export function parseSalesWorkbenchView(value?: string): SalesWorkbenchView {
  return ["todo", "shipment", "collaboration", "exception", "settlement"].includes(value ?? "")
    ? (value as SalesWorkbenchView)
    : "all";
}
