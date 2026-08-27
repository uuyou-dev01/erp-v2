import { describe, expect, it } from "vitest";
import { workItemMatchesSearch } from "@/lib/application/next-actions";
import { derivePurchaseOrderItem } from "@/lib/application/workflow-queries";

function purchaseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "po-1",
    orderNo: "QE-RESTORED-001",
    status: "SHIPPED",
    trackingNo: null,
    supplierName: "千岛",
    currency: "CNY",
    totalAmount: { toString: () => "1375" },
    updatedAt: new Date("2026-08-27T09:22:36.000Z"),
    createdAt: new Date("2026-08-27T09:21:53.000Z"),
    lines: [
      {
        id: "line-1",
        quantity: { toString: () => "1" },
        unitPrice: { toString: () => "1375" },
        lineAmount: { toString: () => "1375" },
        sku: { code: "skullpanda-bjd", name: "SKULLPANDA小松奈奈BJD手办" },
      },
    ],
    inboundShipments: [],
    destinationLocation: { name: "上海转运仓库", isSellableDefault: false },
    ...overrides,
  };
}

describe("workbench shipped purchase fallback", () => {
  it("restores shipped orders without tracking to pending arrival", () => {
    const item = derivePurchaseOrderItem(purchaseOrder());

    expect(item).not.toBeNull();
    expect(item?.queue).toBe("pendingArrival");
    expect(item?.currentStatusLabel).toBe("运输中 · 运单待补");
    expect(item?.priority).toBe("warning");
    expect(item?.subtitle).toContain("QE-RESTORED-001");
    expect(item?.subtitle).toContain("上海转运仓库");
  });

  it("finds a purchase task by product detail, order number, or destination", () => {
    const item = derivePurchaseOrderItem(purchaseOrder());
    expect(item).not.toBeNull();
    if (!item) return;

    expect(workItemMatchesSearch(item, "小松奈奈")).toBe(true);
    expect(workItemMatchesSearch(item, "QE-RESTORED-001")).toBe(true);
    expect(workItemMatchesSearch(item, "上海转运仓库")).toBe(true);
    expect(workItemMatchesSearch(item, "不存在的商品")).toBe(false);
  });

  it("does not duplicate an order when an active transport leg already owns the task", () => {
    const item = derivePurchaseOrderItem(
      purchaseOrder({ inboundShipments: [{ status: "IN_TRANSIT", receivedAt: null }] })
    );

    expect(item).toBeNull();
  });
});
