import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getMonthlyPnL } from "@/app/actions/reports";

const runId = `monthly_pnl_cogs_${Date.now()}`;
const organizationCode = `org_${runId}`;
const storeId = `store_${runId}`;

describe("monthly P&L inventory cost", () => {
  beforeAll(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T12:00:00.000Z"));

    const organization = await prisma.organization.create({
      data: {
        code: organizationCode,
        name: "Monthly PnL COGS Test Organization",
      },
    });

    await prisma.store.create({
      data: {
        id: storeId,
        organizationId: organization.id,
        code: `STORE_${runId}`,
        name: "Monthly PnL COGS Test Store",
        currency: "CNY",
      },
    });
  });

  afterAll(async () => {
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.organization.deleteMany({ where: { code: organizationCode } });
    vi.useRealTimers();
  });

  it("uses allocated sold inventory cost instead of received purchase order total", async () => {
    const sku = await prisma.sKU.create({
      data: {
        storeId,
        code: `SKU_${runId}`,
        name: "Monthly PnL COGS Product",
      },
    });
    const location = await prisma.location.create({
      data: {
        storeId,
        code: `WH_${runId}`,
        name: "Monthly PnL COGS Warehouse",
        type: "WAREHOUSE",
        region: "CN_SHANGHAI",
      },
    });
    const lot = await prisma.inventoryLot.create({
      data: {
        storeId,
        skuId: sku.id,
        locationId: location.id,
        unitCost: "40",
        costCurrency: "CNY",
        sourceType: "E2E",
        sourceId: `${runId}_lot`,
        receivedAt: new Date("2026-06-15T08:00:00.000Z"),
      },
    });

    await prisma.purchaseOrder.create({
      data: {
        storeId,
        orderNo: `PO_${runId}`,
        supplierName: "Unrelated Supplier",
        currency: "CNY",
        subtotal: "999",
        totalAmount: "999",
        status: "RECEIVED",
        orderedAt: new Date("2026-06-01T08:00:00.000Z"),
        receivedAt: new Date("2026-06-18T08:00:00.000Z"),
      },
    });

    const order = await prisma.customerOrder.create({
      data: {
        storeId,
        orderNumber: `ORD_${runId}`,
        customerName: "Monthly PnL Buyer",
        orderDate: new Date("2026-06-22T12:00:00.000Z"),
        currency: "CNY",
        subtotal: "100",
        totalPaid: "100",
        platformFee: "10",
        shippingFee: "5",
        orderStatus: "CONFIRMED",
      },
    });
    const line = await prisma.orderLine.create({
      data: {
        orderId: order.id,
        skuId: sku.id,
        quantity: "1",
        unitPrice: "100",
        lineAmount: "100",
      },
    });
    await prisma.orderAllocation.create({
      data: {
        orderLineId: line.id,
        allocationType: "LOT",
        lotId: lot.id,
        quantity: "1",
        unitCost: "40",
        costAmount: "40",
        status: "ALLOCATED",
      },
    });

    const pnl = await getMonthlyPnL(storeId, 1);

    expect(pnl).toEqual([
      {
        month: "2026-06",
        revenue: 100,
        platformFee: 10,
        shippingFee: 5,
        logisticsFee: 0,
        purchaseCost: 40,
        profit: 45,
      },
    ]);
  });

  it("uses ItemUnit allocation cost while keeping revenue on the child SKU order line", async () => {
    const parentSku = await prisma.sKU.create({
      data: {
        storeId,
        code: `PARENT_${runId}`,
        name: "Monthly PnL Parent Product",
      },
    });
    const childSku = await prisma.sKU.create({
      data: {
        storeId,
        parentSkuId: parentSku.id,
        code: `CHILD_${runId}`,
        name: "Monthly PnL Child Product",
      },
    });
    const location = await prisma.location.create({
      data: {
        storeId,
        code: `ITEM_WH_${runId}`,
        name: "Monthly PnL ItemUnit Warehouse",
        type: "WAREHOUSE",
        region: "CN_SHANGHAI",
      },
    });
    const itemUnit = await prisma.itemUnit.create({
      data: {
        storeId,
        skuId: childSku.id,
        locationId: location.id,
        unitCost: "80",
        costCurrency: "CNY",
        sourceType: "TEST",
        sourceId: `${runId}_item_unit`,
        status: "AVAILABLE",
      },
    });
    const order = await prisma.customerOrder.create({
      data: {
        storeId,
        orderNumber: `ITEM_ORD_${runId}`,
        customerName: "Monthly PnL ItemUnit Buyer",
        orderDate: new Date("2026-05-22T12:00:00.000Z"),
        currency: "CNY",
        subtotal: "200",
        totalPaid: "200",
        platformFee: "20",
        shippingFee: "10",
        orderStatus: "CONFIRMED",
      },
    });
    const line = await prisma.orderLine.create({
      data: {
        orderId: order.id,
        skuId: childSku.id,
        quantity: "1",
        unitPrice: "200",
        lineAmount: "200",
      },
    });
    await prisma.orderAllocation.create({
      data: {
        orderLineId: line.id,
        allocationType: "ITEM_UNIT",
        itemUnitId: itemUnit.id,
        quantity: "1",
        unitCost: "80",
        costAmount: "80",
        status: "ALLOCATED",
      },
    });

    const pnl = await getMonthlyPnL(storeId, 2);
    const may = pnl.find((row) => row.month === "2026-05");

    expect(may).toEqual({
      month: "2026-05",
      revenue: 200,
      platformFee: 20,
      shippingFee: 10,
      logisticsFee: 0,
      purchaseCost: 80,
      profit: 90,
    });
  });
});
