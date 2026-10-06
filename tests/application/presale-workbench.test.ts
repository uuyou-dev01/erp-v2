import { describe, expect, it } from "vitest";
import { deriveCustomerOrderItem } from "@/lib/application/workflow-queries";
import {
  deriveSalesOrderWorkbenchState,
  orderMatchesSalesWorkbenchView,
} from "@/lib/application/sales-order-workbench";

const base = {
  id: "presale-order",
  orderNumber: "PRE-test",
  orderStatus: "DRAFT",
  isPresale: true,
  expectedShipDate: new Date("2099-10-10"),
  settledAt: null,
  trackingNo: null,
  customerName: "测试客户",
  platform: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lines: [
    {
      id: "line",
      quantity: "3",
      sku: { code: "sku", name: "商品" },
      allocations: [] as Array<{ quantity: string; status: string }>,
    },
  ],
};
describe("presale workbench continuity", () => {
  it("keeps normal waiting separate, exposes debt, and advances allocated orders", () => {
    expect(deriveCustomerOrderItem(base)).toMatchObject({
      queue: "presaleWaiting",
      primaryAction: "viewDetails",
      metadata: { pendingQuantity: 3 },
    });
    const reserved = {
      ...base,
      lines: [{ ...base.lines[0], allocations: [{ status: "ALLOCATED", quantity: "3" }] }],
    };
    expect(deriveCustomerOrderItem(reserved)).toMatchObject({
      queue: "pendingShipment",
      primaryAction: "confirmOrder",
    });
    expect(deriveCustomerOrderItem({ ...reserved, orderStatus: "CONFIRMED" })).toMatchObject({
      primaryAction: "shipOrder",
    });
  });
  it("keeps overdue promises actionable before and after stock allocation", () => {
    const overdue = { ...base, expectedShipDate: new Date("2000-01-01") };
    expect(deriveCustomerOrderItem(overdue)).toMatchObject({
      queue: "exception",
      priority: "critical",
    });
    expect(
      deriveCustomerOrderItem({
        ...overdue,
        orderStatus: "CONFIRMED",
        lines: [{ ...base.lines[0], allocations: [{ status: "ALLOCATED", quantity: "3" }] }],
      })
    ).toMatchObject({ queue: "exception", primaryAction: "shipOrder" });
    expect(deriveCustomerOrderItem({ ...base, orderStatus: "CANCELLED" })).toMatchObject({
      queue: "completed",
    });
    expect(deriveSalesOrderWorkbenchState(overdue).isException).toBe(true);
    expect(orderMatchesSalesWorkbenchView(base, "presale")).toBe(true);
    expect(orderMatchesSalesWorkbenchView({ ...base, orderStatus: "CANCELLED" }, "presale")).toBe(
      false
    );
  });
});
