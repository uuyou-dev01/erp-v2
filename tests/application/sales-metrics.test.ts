import { describe, expect, it } from "vitest";
import { summarizeSalesOrders } from "@/lib/application/sales-metrics";

describe("sales page metrics", () => {
  it("counts revenue only for valid sales statuses", () => {
    const orders = [
      order("DRAFT", "90", "platform_a"),
      order("PLACED", "80", "platform_a"),
      order("PAID", "70", "platform_a"),
      order("CONFIRMED", "100", "platform_a"),
      order("SHIPPED", "120", "platform_a"),
      order("DELIVERED", "140", "platform_b"),
      order("CANCELLED", "200", "platform_a"),
      order("RETURNED", "300", "platform_b"),
    ];

    const summary = summarizeSalesOrders(orders);

    expect(summary.totalRevenue.toFixed(2)).toBe("360.00");
    expect(summary.platformSales).toEqual([
      { platformId: "platform_a", total: "220.00" },
      { platformId: "platform_b", total: "140.00" },
    ]);
  });
});

function order(orderStatus: string, totalPaid: string, platformId: string) {
  return { orderStatus, totalPaid, platformId };
}
