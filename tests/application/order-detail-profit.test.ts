import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  computeOrderDetailProfit,
  resolveAllocationCostCurrency,
} from "@/lib/application/order-detail-profit";

const runId = `order_detail_profit_${Date.now()}`;
const organizationCode = `org_${runId}`;
const storeId = `store_${runId}`;
let fxRateId: string | null = null;

describe("order detail profit", () => {
  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: {
        code: organizationCode,
        name: "Order Detail Profit Test Organization",
      },
    });

    await prisma.store.create({
      data: {
        id: storeId,
        organizationId: organization.id,
        code: `STORE_${runId}`,
        name: "Order Detail Profit Test Store",
        currency: "CNY",
      },
    });

    const fxRate = await prisma.fxRate.create({
      data: {
        fromCurrency: "XCN",
        toCurrency: "JPY",
        rate: "20",
        effectiveDate: new Date("2026-06-01T00:00:00.000Z"),
      },
    });
    fxRateId = fxRate.id;
  });

  afterAll(async () => {
    if (fxRateId) await prisma.fxRate.deleteMany({ where: { id: fxRateId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.organization.deleteMany({ where: { code: organizationCode } });
  });

  it("converts allocated inventory costs into the order currency", async () => {
    const summary = await computeOrderDetailProfit({
      storeId,
      orderCurrency: "JPY",
      orderDate: new Date("2026-06-22T12:00:00.000Z"),
      totalPaid: "2000",
      subtotal: "2000",
      platformFee: "200",
      shippingFee: "100",
      lines: [
        {
          id: "line_1",
          lineAmount: "2000",
          allocations: [
            {
              costAmount: "50",
              costCurrency: "XCN",
              effectiveAt: new Date("2026-06-15T08:00:00.000Z"),
            },
          ],
        },
      ],
    });

    expect(summary.inventoryCost.toFixed(4)).toBe("1000.0000");
    expect(summary.netRevenue.toFixed(4)).toBe("1700.0000");
    expect(summary.grossProfit.toFixed(4)).toBe("700.0000");
  });

  it("prefers the inventory cost currency for allocation cost display", () => {
    expect(
      resolveAllocationCostCurrency({
        orderCurrency: "JPY",
        inventoryLot: { costCurrency: "CNY" },
      }),
    ).toBe("CNY");
    expect(
      resolveAllocationCostCurrency({
        orderCurrency: "JPY",
        itemUnit: { costCurrency: "USD" },
      }),
    ).toBe("USD");
    expect(resolveAllocationCostCurrency({ orderCurrency: "JPY" })).toBe("JPY");
  });
});
