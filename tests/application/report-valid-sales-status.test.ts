import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  getFeeDetails,
  getMonthlyPnL,
  getPlatformBreakdown,
} from "@/app/actions/reports";

const runId = `report_valid_sales_${Date.now()}`;
const organizationCode = `org_${runId}`;
const storeId = `store_${runId}`;
let platformId = "";

describe("report valid sales status filters", () => {
  beforeAll(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T12:00:00.000Z"));

    const organization = await prisma.organization.create({
      data: {
        code: organizationCode,
        name: "Report Valid Sales Test Organization",
      },
    });

    await prisma.store.create({
      data: {
        id: storeId,
        organizationId: organization.id,
        code: `STORE_${runId}`,
        name: "Report Valid Sales Test Store",
        currency: "CNY",
      },
    });

    const platform = await prisma.platform.create({
      data: {
        storeId,
        code: `PLAT_${runId}`,
        name: "Report Valid Sales Platform",
        country: "CN",
        defaultCurrency: "CNY",
      },
    });
    platformId = platform.id;

    await prisma.customerOrder.createMany({
      data: [
        orderData("DRAFT", "90", "9", "4"),
        orderData("PAID", "80", "8", "3"),
        orderData("CONFIRMED", "100", "10", "5"),
        orderData("CANCELLED", "200", "20", "10"),
        orderData("RETURNED", "300", "30", "15"),
      ],
    });
    await prisma.logisticsCost.createMany({
      data: [
        {
          storeId,
          sourceType: "PURCHASE_ORDER",
          sourceId: `${runId}_purchase`,
          amount: "2",
          currency: "CNY",
          occurredAt: new Date("2026-06-20T12:00:00.000Z"),
        },
        {
          storeId,
          sourceType: "INBOUND_SHIPMENT",
          sourceId: `${runId}_transfer`,
          amount: "3",
          currency: "CNY",
          occurredAt: new Date("2026-06-21T12:00:00.000Z"),
        },
        {
          storeId,
          sourceType: "CONSOLIDATION_BATCH",
          sourceId: `${runId}_consolidation`,
          amount: "4",
          currency: "CNY",
          occurredAt: new Date("2026-06-22T12:00:00.000Z"),
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.organization.deleteMany({ where: { code: organizationCode } });
    vi.useRealTimers();
  });

  it("uses only confirmed, shipped, and delivered orders in monthly P&L", async () => {
    const pnl = await getMonthlyPnL(storeId, 1);

    expect(pnl).toEqual([
      {
        month: "2026-06",
        revenue: 100,
        platformFee: 10,
        shippingFee: 5,
        logisticsFee: 9,
        purchaseCost: 0,
        profit: 76,
        unfinalizedShippingFeeOrderCount: 1,
      },
    ]);
  });

  it("uses only valid sales orders in platform and fee breakdowns", async () => {
    const range = {
      dateFrom: new Date("2026-06-01T00:00:00.000Z"),
      dateTo: new Date("2026-06-30T23:59:59.999Z"),
    };

    await expect(getPlatformBreakdown(storeId, range)).resolves.toEqual([
      {
        name: "Report Valid Sales Platform",
        totalSales: 100,
        orderCount: 1,
        totalPlatformFee: 10,
      },
    ]);
    await expect(getFeeDetails(storeId, range)).resolves.toEqual({
      platformFee: "10.00",
      shippingFee: "5.00",
      purchaseShippingFee: "2.00",
      transferShippingFee: "3.00",
      consolidationShippingFee: "4.00",
      agentFee: "0.00",
      unfinalizedShippingFeeOrderCount: 1,
    });
  });
});

function orderData(
  orderStatus: string,
  totalPaid: string,
  platformFee: string,
  shippingFee: string,
) {
  return {
    storeId,
    platformId,
    orderNumber: `ORD_${runId}_${orderStatus}`,
    customerName: `${orderStatus} Buyer`,
    orderDate: new Date("2026-06-22T12:00:00.000Z"),
    currency: "CNY",
    subtotal: totalPaid,
    totalPaid,
    platformFee,
    shippingFee,
    orderStatus,
  };
}
