import { describe, expect, it } from "vitest";
import {
  deriveSalesOrderWorkbenchState,
  orderMatchesSalesWorkbenchView,
} from "@/lib/application/sales-order-workbench";

describe("sales order workbench", () => {
  it("keeps business mode separate from order lifecycle status", () => {
    const state = deriveSalesOrderWorkbenchState({
      id: "order_resale",
      orderStatus: "CONFIRMED",
      resaleListing: { fulfillmentMode: "SUPPLIER_SHIPS" },
      fulfillmentRequests: [{ id: "request_1", status: "REQUESTED", settlements: [] }],
    });

    expect(state.businessMode).toBe("RESALE");
    expect(state.fulfillmentMode).toBe("SUPPLIER_SHIPS");
    expect(state.fulfillmentStatus).toBe("REQUESTED");
    expect(state.isCollaboration).toBe(true);
    expect(state.isPendingShipment).toBe(false);
    expect(state.nextAction).toMatchObject({
      label: "查看协作",
      href: "/fulfillment/requests/request_1",
    });
  });

  it("marks direct confirmed orders as actionable shipments", () => {
    const order = {
      id: "order_direct",
      orderStatus: "CONFIRMED",
      resaleListing: null,
      fulfillmentRequests: [],
    };

    const state = deriveSalesOrderWorkbenchState(order);

    expect(state.businessMode).toBe("DIRECT");
    expect(state.isPendingShipment).toBe(true);
    expect(state.nextAction.label).toBe("确认发货");
    expect(orderMatchesSalesWorkbenchView(order, "shipment")).toBe(true);
  });

  it("routes rejected collaborative fulfillment to the exception view", () => {
    const order = {
      id: "order_exception",
      orderStatus: "CONFIRMED",
      resaleListing: { fulfillmentMode: "SUPPLIER_SHIPS" },
      fulfillmentRequests: [{ id: "request_error", status: "REJECTED", settlements: [] }],
    };

    const state = deriveSalesOrderWorkbenchState(order);

    expect(state.isException).toBe(true);
    expect(state.nextAction).toEqual({
      label: "处理异常",
      href: "/fulfillment/requests/request_error",
      emphasis: "primary",
    });
    expect(orderMatchesSalesWorkbenchView(order, "exception")).toBe(true);
  });

  it("does not treat a terminal cancelled order as unfinished exception work", () => {
    const state = deriveSalesOrderWorkbenchState({
      id: "order_cancelled",
      orderStatus: "CANCELLED",
      resaleListing: null,
      fulfillmentRequests: [],
      afterSalesCases: [],
    });

    expect(state.isException).toBe(false);
    expect(state.nextAction.label).toBe("查看订单");
  });

  it("surfaces an open after-sales case as the next action", () => {
    const state = deriveSalesOrderWorkbenchState({
      id: "order_return",
      orderStatus: "RETURNED",
      resaleListing: null,
      fulfillmentRequests: [],
      afterSalesCases: [{ id: "case_1", status: "INSPECTING" }],
    });

    expect(state.isException).toBe(true);
    expect(state.nextAction).toEqual({
      label: "处理售后",
      href: "/sales/after-sales",
      emphasis: "primary",
    });
  });

  it("uses the linked collaboration settlement as the financial status", () => {
    const state = deriveSalesOrderWorkbenchState({
      id: "order_settlement",
      orderStatus: "SHIPPED",
      resaleListing: { fulfillmentMode: "SUPPLIER_SHIPS" },
      fulfillmentRequests: [
        {
          id: "request_2",
          status: "SHIPPED",
          settlements: [{ id: "settlement_1", status: "CONFIRMED" }],
        },
      ],
    });

    expect(state.settlementStatus).toBe("CONFIRMED");
    expect(state.isPendingSettlement).toBe(false);
  });
});
