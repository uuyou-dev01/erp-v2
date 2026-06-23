import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  getBusinessOverview,
  getInventoryReport,
  getSalesReport,
} from "@/app/actions/reports";

const runId = `report_actions_${Date.now()}`;
const organizationCode = `org_${runId}`;
const storeId = `store_${runId}`;

describe("report action sales status filters", () => {
  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: {
        code: organizationCode,
        name: "Report Action Test Organization",
      },
    });

    await prisma.store.create({
      data: {
        id: storeId,
        organizationId: organization.id,
        code: `STORE_${runId}`,
        name: "Report Action Test Store",
        currency: "CNY",
      },
    });

    await prisma.customerOrder.createMany({
      data: [
        orderData("CONFIRMED", "100"),
        orderData("CANCELLED", "200"),
        orderData("RETURNED", "300"),
        {
          ...orderData("CONFIRMED", "80", "BACKDATED"),
          orderDate: new Date("2026-05-15T12:00:00.000Z"),
          createdAt: new Date("2026-06-22T12:00:00.000Z"),
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.organization.deleteMany({ where: { code: organizationCode } });
  });

  it("excludes cancelled and returned orders from business overview sales amount", async () => {
    const overview = await getBusinessOverview(storeId, {
      dateFrom: new Date("2026-06-01T00:00:00.000Z"),
      dateTo: new Date("2026-06-30T23:59:59.999Z"),
    });

    expect(overview.sales.totalAmount).toBe("100.00");
    expect(overview.sales.orderCount).toBe(3);
    expect(overview.sales.confirmedCount).toBe(1);
  });

  it("excludes cancelled and returned orders from sales report totals and keeps status counts", async () => {
    const report = await getSalesReport(storeId, {
      dateFrom: new Date("2026-06-01T00:00:00.000Z"),
      dateTo: new Date("2026-06-30T23:59:59.999Z"),
    });

    expect(report.totalOrders).toBe(3);
    expect(report.totalAmount).toBe(100);
    expect(report.byMonth).toEqual([{ month: "2026-06", amount: 100 }]);
    expect(report.byStatus).toMatchObject({
      confirmed: 1,
      cancelled: 1,
      returned: 1,
    });
  });

  it("groups sales report monthly totals by order date instead of record creation date", async () => {
    const report = await getSalesReport(storeId, {
      dateFrom: new Date("2026-05-01T00:00:00.000Z"),
      dateTo: new Date("2026-05-31T23:59:59.999Z"),
    });

    expect(report.totalOrders).toBe(1);
    expect(report.totalAmount).toBe(80);
    expect(report.byMonth).toEqual([{ month: "2026-05", amount: 80 }]);
  });

  it("values inventory lots by on-hand quantity in the location report", async () => {
    const sku = await prisma.sKU.create({
      data: {
        storeId,
        code: `SKU_${runId}_LOT_VALUE`,
        name: "Report Lot Value Product",
      },
    });
    const location = await prisma.location.create({
      data: {
        storeId,
        code: `WH_${runId}`,
        name: "Report Warehouse",
        type: "WAREHOUSE",
        region: "CN_SHANGHAI",
      },
    });
    const lot = await prisma.inventoryLot.create({
      data: {
        storeId,
        skuId: sku.id,
        locationId: location.id,
        unitCost: "100",
        costCurrency: "CNY",
        sourceType: "E2E",
        sourceId: `${runId}_LOT_VALUE`,
        receivedAt: new Date("2026-06-22T08:00:00.000Z"),
      },
    });
    await prisma.stockLedger.create({
      data: {
        storeId,
        entityType: "LOT",
        entityId: lot.id,
        locationId: location.id,
        deltaQty: "3",
        reason: "INBOUND_PURCHASE",
        refType: "E2E",
        refId: `${runId}_LOT_VALUE`,
      },
    });

    const report = await getInventoryReport(storeId, {
      dateFrom: new Date("2026-06-01T00:00:00.000Z"),
      dateTo: new Date("2026-06-30T23:59:59.999Z"),
    });

    expect(report.byLocation).toEqual([{ name: "Report Warehouse", value: 300 }]);
  });
});

function orderData(status: string, totalPaid: string, suffix = status) {
  return {
    storeId,
    orderNumber: `ORD_${runId}_${suffix}`,
    customerName: `${status} Buyer`,
    orderDate: new Date("2026-06-22T12:00:00.000Z"),
    currency: "CNY",
    subtotal: totalPaid,
    totalPaid,
    orderStatus: status,
  };
}
