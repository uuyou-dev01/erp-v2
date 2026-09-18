import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
  }),
}));

import {
  addPurchaseLineAction,
  addPurchaseLine,
  createPurchaseOrderAction,
  createPurchaseOrder,
  markPurchaseAsShippedAction,
  receivePurchaseOrderAction,
  receivePurchaseOrder,
  updatePurchaseOrderStatus,
} from "@/app/actions/purchase-orders";
import { createListing, quickSellListing } from "@/app/actions/listings";
import {
  addOrderLineAction,
  confirmOrderAction,
  createCustomerOrderAction,
  markOrderShipped,
  saveOrderShippingProof,
  settleCustomerOrderAction,
} from "@/app/actions/customer-orders";
import { getDashboardMonthlyMetrics } from "@/app/actions/reports";

const runId = `flow_${Date.now()}`;
const organizationCode = `org_${runId}`;
const storeId = `store_${runId}`;
const storeCode = `STORE_${runId}`;
const userEmail = `${runId}@example.com`;

let skuId = "";
let locationId = "";
let platformId = "";
let organizationId = "";

describe("purchase to profit business flow", () => {
  beforeAll(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T12:00:00.000Z"));
    process.env.ERP_DEV_USER_EMAIL = userEmail;

    const organization = await prisma.organization.create({
      data: {
        code: organizationCode,
        name: "Flow Test Organization",
      },
    });
    organizationId = organization.id;

    const store = await prisma.store.create({
      data: {
        id: storeId,
        organizationId: organization.id,
        code: storeCode,
        name: "Flow Test Store",
        currency: "CNY",
      },
    });

    const user = await prisma.user.create({
      data: {
        email: userEmail,
        name: "Flow Tester",
        password: "test",
        role: "OWNER",
        storeId: store.id,
      },
    });

    await prisma.membership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    await prisma.storeAccess.create({
      data: {
        storeId: store.id,
        userId: user.id,
        role: "OWNER",
      },
    });

    const location = await prisma.location.create({
      data: {
        storeId: store.id,
        code: `WH_${runId}`,
        name: "Flow Test Warehouse",
        type: "WAREHOUSE",
        region: "CN_SHANGHAI",
      },
    });
    locationId = location.id;

    const platform = await prisma.platform.create({
      data: {
        storeId: store.id,
        code: `PLAT_${runId}`,
        name: "Flow Test Platform",
        country: "CN",
        defaultCurrency: "CNY",
        defaultFeeRate: "0.1000",
      },
    });
    platformId = platform.id;

    const sku = await prisma.sKU.create({
      data: {
        storeId: store.id,
        code: `SKU_${runId}`,
        name: "Flow Test Product",
      },
    });
    skuId = sku.id;
  });

  afterAll(async () => {
    const organization = await prisma.organization.findUnique({
      where: { code: organizationCode },
      select: { id: true },
    });
    if (organization) {
      await prisma.notification.deleteMany({
        where: { organizationId: organization.id },
      });
      await prisma.activityLog.deleteMany({
        where: { organizationId: organization.id },
      });
      await prisma.task.deleteMany({
        where: { organizationId: organization.id },
      });
    }
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.organization.deleteMany({ where: { code: organizationCode } });
    delete process.env.ERP_DEV_USER_EMAIL;
    vi.useRealTimers();
  });

  it("receives purchased stock, sells it, ships it, and reports profit", async () => {
    const purchase = await createPurchaseOrder({
      storeId,
      orderNo: `PO_${runId}`,
      currency: "CNY",
      orderedAt: new Date("2026-06-22T01:00:00.000Z"),
    });

    await addPurchaseLine({
      purchaseOrderId: purchase.id,
      skuId,
      quantity: "2",
      unitPrice: "100",
    });

    await updatePurchaseOrderStatus(purchase.id, "ORDERED", new Date("2026-06-22T01:00:00.000Z"));

    await receivePurchaseOrder({
      purchaseOrderId: purchase.id,
      locationId,
      receivedAt: new Date("2026-06-22T02:00:00.000Z"),
    });

    const lot = await prisma.inventoryLot.findFirstOrThrow({
      where: { storeId, skuId, sourceType: "PURCHASE" },
    });
    await expectLotQuantity(lot.id, "2");

    const listing = await createListing({
      storeId,
      platformId,
      listingType: "SKU",
      skuId,
      listedPrice: "180",
      currency: "CNY",
      feeRateOverride: "0.1",
      shippingFeeOverride: "12",
    });
    expect(listing.success).toBe(true);
    if (!listing.success) throw new Error(listing.error);

    const sale = await quickSellListing({
      listingId: listing.id,
      quantity: "1",
      unitPrice: "180",
      platformFeeRate: "0.1",
      shippingFee: "12",
      shipFromLocationId: locationId,
      customerName: "Flow Buyer",
      externalOrderNo: `SO_${runId}`,
    });

    if (!sale.success) throw new Error(sale.error);
    expect(sale.success).toBe(true);

    await saveOrderShippingProof(
      sale.orderId,
      {},
      {
        recipient: {
          customerName: "Flow Buyer Draft",
          customerPhone: "090-0000-0000",
          shippingAddress: "Tokyo draft delivery note",
          externalOrderNo: `SO_DRAFT_${runId}`,
        },
      }
    );
    await expect(
      prisma.customerOrder.findUniqueOrThrow({ where: { id: sale.orderId } })
    ).resolves.toMatchObject({
      customerName: "Flow Buyer Draft",
      customerPhone: "090-0000-0000",
      shippingAddress: "Tokyo draft delivery note",
      externalOrderNo: `SO_DRAFT_${runId}`,
      orderStatus: "CONFIRMED",
    });

    await markOrderShipped(sale.orderId, {
      trackingNo: `TRK_${runId}`,
      recipient: {
        customerName: "Flow Buyer Updated",
        customerPhone: "090-1234-5678",
        shippingAddress: "Tokyo anonymous delivery note",
        externalOrderNo: `SO_UPDATED_${runId}`,
      },
    });

    await expectLotQuantity(lot.id, "1");

    const order = await prisma.customerOrder.findUniqueOrThrow({
      where: { id: sale.orderId },
      include: { lines: { include: { allocations: true } } },
    });
    expect(order.orderStatus).toBe("SHIPPED");
    expect(order.customerName).toBe("Flow Buyer Updated");
    expect(order.customerPhone).toBe("090-1234-5678");
    expect(order.shippingAddress).toBe("Tokyo anonymous delivery note");
    expect(order.externalOrderNo).toBe(`SO_UPDATED_${runId}`);
    expect(order.subtotal.toString()).toBe("180");
    expect(order.platformFee.toString()).toBe("18");
    expect(order.shippingFee.toString()).toBe("12");
    expect(order.netRevenue?.toString()).toBe("150");
    expect(order.lines[0].allocations[0].status).toBe("SHIPPED");
    expect(order.lines[0].allocations[0].costAmount.toString()).toBe("100");

    const shipmentTask = await prisma.task.findFirstOrThrow({
      where: {
        organizationId,
        storeId,
        type: "SHIP_ORDER",
        refType: "CUSTOMER_ORDER",
        refId: sale.orderId,
      },
      include: { dispatch: { include: { request: true } } },
    });
    expect(shipmentTask.status).toBe("DONE");
    expect(shipmentTask.dispatch?.status).toBe("COMPLETED");
    expect(shipmentTask.dispatch?.request.status).toBe("CLOSED");

    const outboundLedgerWhere = {
      refType: "ORDER_LINE",
      refId: order.lines[0].id,
      reason: "OUTBOUND_SALE",
    } as const;
    await expect(prisma.stockLedger.count({ where: outboundLedgerWhere })).resolves.toBe(1);
    await expect(
      markOrderShipped(sale.orderId, { trackingNo: `TRK_DUPLICATE_${runId}` })
    ).rejects.toThrow("只有已确认订单可以标记发货");
    await expect(prisma.stockLedger.count({ where: outboundLedgerWhere })).resolves.toBe(1);
    await expect(
      prisma.workRecord.count({
        where: { storeId, taskId: shipmentTask.id, workCode: "SHIP_ORDER" },
      })
    ).resolves.toBe(1);

    const workRecords = await prisma.workRecord.findMany({
      where: {
        storeId,
        workCode: { in: ["RECEIVE_PURCHASE", "SHIP_ORDER"] },
      },
      select: { workCode: true, quantity: true, unit: true },
      orderBy: { occurredAt: "asc" },
    });
    expect(
      workRecords.map((record) => ({
        workCode: record.workCode,
        quantity: record.quantity.toString(),
        unit: record.unit,
      }))
    ).toEqual([
      { workCode: "RECEIVE_PURCHASE", quantity: "2", unit: "件" },
      { workCode: "SHIP_ORDER", quantity: "1", unit: "件" },
    ]);

    const metrics = await getDashboardMonthlyMetrics(storeId, {
      dateFrom: new Date("2026-06-01T00:00:00.000Z"),
      dateTo: new Date("2026-06-30T23:59:59.999Z"),
    });

    expect(metrics.salesAmount).toBe("180.00");
    expect(metrics.platformFee).toBe("18.00");
    expect(metrics.shippingFee).toBe("12.00");
    expect(metrics.inventoryCost).toBe("100.00");
    expect(metrics.grossProfit).toBe("50.00");
    expect(metrics.profitRate).toBe("27.8");
  });

  it("returns a structured failure when updating a missing purchase order status", async () => {
    const result = await updatePurchaseOrderStatus(
      `missing_${runId}`,
      "ORDERED",
      new Date("2026-06-22T01:00:00.000Z")
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("采购单不存在");
    }
  });

  it("returns a structured failure when marking a missing purchase order as shipped", async () => {
    const result = await markPurchaseAsShippedAction({
      purchaseOrderId: `missing_ship_${runId}`,
      shippedAt: new Date("2026-06-22T01:00:00.000Z"),
      shipmentMode: "purchase_only",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("采购单不存在");
    }
  });

  it("returns a structured failure when creating a duplicate purchase order", async () => {
    const first = await createPurchaseOrderAction({
      storeId,
      orderNo: `PO_DUP_${runId}`,
      currency: "CNY",
    });
    expect(first.success).toBe(true);

    const duplicate = await createPurchaseOrderAction({
      storeId,
      orderNo: `PO_DUP_${runId}`,
      currency: "CNY",
    });

    expect(duplicate.success).toBe(false);
    if (!duplicate.success) {
      expect(duplicate.error).toContain("采购单号");
    }
  });

  it("returns a structured failure when adding a line to a missing purchase order", async () => {
    const result = await addPurchaseLineAction({
      purchaseOrderId: `missing_line_${runId}`,
      skuId,
      quantity: "1",
      unitPrice: "100",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("采购单不存在");
    }
  });

  it("returns a localized structured failure when receiving a missing purchase order", async () => {
    const result = await receivePurchaseOrderAction({
      purchaseOrderId: `missing_receive_${runId}`,
      locationId,
      receivedAt: new Date("2026-06-22T01:00:00.000Z"),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("采购单不存在");
    }
  });

  it("returns a structured failure when creating a customer order with an invalid platform", async () => {
    const result = await createCustomerOrderAction({
      storeId,
      orderNumber: `SO_BAD_PLATFORM_${runId}`,
      platformId: `missing_platform_${runId}`,
      customerName: "Flow Buyer",
      orderDate: new Date("2026-06-22T01:00:00.000Z"),
      currency: "CNY",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("平台不存在");
    }
  });

  it("returns a structured failure when adding a line to a missing customer order", async () => {
    const result = await addOrderLineAction({
      orderId: `missing_customer_order_${runId}`,
      skuId,
      quantity: "1",
      unitPrice: "100",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("订单不存在");
    }
  });

  it("rejects adding a catalog group directly to a customer order line", async () => {
    const group = await prisma.sKU.create({
      data: {
        storeId,
        code: `GROUP_${runId}_SALES`,
        name: "Sales Group Product",
        catalogRole: "GROUP",
      },
    });
    const orderResult = await createCustomerOrderAction({
      storeId,
      orderNumber: `SO_GROUP_${runId}`,
      platformId,
      customerName: "Group Buyer",
      orderDate: new Date("2026-06-22T01:00:00.000Z"),
      currency: "CNY",
    });
    expect(orderResult.success).toBe(true);
    if (!orderResult.success) throw new Error(orderResult.error);

    const result = await addOrderLineAction({
      orderId: orderResult.id,
      skuId: group.id,
      quantity: "1",
      unitPrice: "100",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("商品组只用于管理规格");
    }
  });

  it("returns a structured failure when confirming a missing customer order", async () => {
    const result = await confirmOrderAction({
      orderId: `missing_confirm_${runId}`,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("订单不存在");
    }
  });

  it("settles with an actual sale price and recalculates net revenue from it", async () => {
    const orderResult = await createCustomerOrderAction({
      storeId,
      orderNumber: `SO_SETTLE_PRICE_${runId}`,
      platformId,
      customerName: "Settlement Buyer",
      orderDate: new Date("2026-06-22T01:00:00.000Z"),
      currency: "CNY",
    });
    expect(orderResult.success).toBe(true);
    if (!orderResult.success) throw new Error(orderResult.error);

    const lineResult = await addOrderLineAction({
      orderId: orderResult.id,
      skuId,
      quantity: "1",
      unitPrice: "100",
    });
    expect(lineResult.success).toBe(true);

    const settleResult = await settleCustomerOrderAction(orderResult.id, {
      actualSalePrice: "120",
      platformFee: "12",
      shippingFee: "5",
    });
    expect(settleResult.success).toBe(true);

    const settled = await prisma.customerOrder.findUniqueOrThrow({
      where: { id: orderResult.id },
      include: { lines: true },
    });
    expect(settled.subtotal.toString()).toBe("120");
    expect(settled.totalPaid.toString()).toBe("120");
    expect(settled.platformFee.toString()).toBe("12");
    expect(settled.shippingFee.toString()).toBe("5");
    expect(settled.netRevenue?.toString()).toBe("103");
    expect(settled.settlementFxRate?.toString()).toBe("1");
    expect(settled.settlementBaseCurrency).toBe("CNY");
    expect(settled.settlementNetRevenueBase?.toString()).toBe("103");
    expect(settled.lines[0].lineAmount.toString()).toBe("120");
    expect(settled.lines[0].unitPrice?.toString()).toBe("120");
  });

  it("stores the exact foreign-currency rate used at settlement", async () => {
    const orderResult = await createCustomerOrderAction({
      storeId,
      orderNumber: `SO_SETTLE_FX_${runId}`,
      platformId,
      customerName: "FX Settlement Buyer",
      orderDate: new Date("2026-06-22T01:00:00.000Z"),
      currency: "JPY",
    });
    expect(orderResult.success).toBe(true);
    if (!orderResult.success) throw new Error(orderResult.error);

    const lineResult = await addOrderLineAction({
      orderId: orderResult.id,
      skuId,
      quantity: "1",
      unitPrice: "2400",
    });
    expect(lineResult.success).toBe(true);

    const result = await settleCustomerOrderAction(orderResult.id, {
      platformFee: "240",
      shippingFee: "520",
      fxRate: "0.048",
    });
    expect(result.success).toBe(true);

    const settled = await prisma.customerOrder.findUniqueOrThrow({
      where: { id: orderResult.id },
    });
    expect(settled.settlementFxRate?.toString()).toBe("0.048");
    expect(settled.settlementBaseCurrency).toBe("CNY");
    expect(settled.netRevenue?.toString()).toBe("1640");
    expect(settled.settlementNetRevenueBase?.toString()).toBe("78.72");
  });

  it("rejects a negative actual sale price without mutating settlement totals", async () => {
    const orderResult = await createCustomerOrderAction({
      storeId,
      orderNumber: `SO_NEG_SETTLE_${runId}`,
      platformId,
      customerName: "Negative Settlement Buyer",
      orderDate: new Date("2026-06-22T01:00:00.000Z"),
      currency: "CNY",
    });
    expect(orderResult.success).toBe(true);
    if (!orderResult.success) throw new Error(orderResult.error);

    const lineResult = await addOrderLineAction({
      orderId: orderResult.id,
      skuId,
      quantity: "1",
      unitPrice: "100",
    });
    expect(lineResult.success).toBe(true);

    const result = await settleCustomerOrderAction(orderResult.id, {
      actualSalePrice: "-1",
      platformFee: "0",
      shippingFee: "0",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("实际售价必须大于 0");
    }

    const unchanged = await prisma.customerOrder.findUniqueOrThrow({
      where: { id: orderResult.id },
      select: {
        subtotal: true,
        totalPaid: true,
        netRevenue: true,
        settledAt: true,
      },
    });
    expect(unchanged.subtotal.toString()).toBe("100");
    expect(unchanged.totalPaid.toString()).toBe("100");
    expect(unchanged.netRevenue).toBeNull();
    expect(unchanged.settledAt).toBeNull();
  });

  it("returns a localized structured failure for non-numeric settlement fees", async () => {
    const orderResult = await createCustomerOrderAction({
      storeId,
      orderNumber: `SO_BAD_FEE_${runId}`,
      platformId,
      customerName: "Bad Fee Buyer",
      orderDate: new Date("2026-06-22T01:00:00.000Z"),
      currency: "CNY",
    });
    expect(orderResult.success).toBe(true);
    if (!orderResult.success) throw new Error(orderResult.error);

    const lineResult = await addOrderLineAction({
      orderId: orderResult.id,
      skuId,
      quantity: "1",
      unitPrice: "100",
    });
    expect(lineResult.success).toBe(true);

    const result = await settleCustomerOrderAction(orderResult.id, {
      platformFee: "not-a-number",
      shippingFee: "0",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("平台手续费必须是有效数字");
    }

    const unchanged = await prisma.customerOrder.findUniqueOrThrow({
      where: { id: orderResult.id },
      select: { netRevenue: true, settledAt: true },
    });
    expect(unchanged.netRevenue).toBeNull();
    expect(unchanged.settledAt).toBeNull();
  });

  it("keeps multi-line settlement revenue equal to the sum of line amounts", async () => {
    const orderResult = await createCustomerOrderAction({
      storeId,
      orderNumber: `SO_MULTI_SETTLE_${runId}`,
      platformId,
      customerName: "Multi Line Settlement Buyer",
      orderDate: new Date("2026-06-22T01:00:00.000Z"),
      currency: "CNY",
    });
    expect(orderResult.success).toBe(true);
    if (!orderResult.success) throw new Error(orderResult.error);

    const firstLine = await addOrderLineAction({
      orderId: orderResult.id,
      skuId,
      quantity: "1",
      unitPrice: "10",
    });
    expect(firstLine.success).toBe(true);

    const secondLine = await addOrderLineAction({
      orderId: orderResult.id,
      skuId,
      quantity: "1",
      unitPrice: "20",
    });
    expect(secondLine.success).toBe(true);

    const result = await settleCustomerOrderAction(orderResult.id, {
      actualSalePrice: "100",
      platformFee: "10",
      shippingFee: "5",
    });
    expect(result.success).toBe(true);

    const settled = await prisma.customerOrder.findUniqueOrThrow({
      where: { id: orderResult.id },
      include: { lines: { orderBy: { lineAmount: "asc" } } },
    });
    const lineTotal = settled.lines.reduce(
      (sum, line) => sum.plus(new Decimal(line.lineAmount.toString())),
      new Decimal(0)
    );

    expect(settled.subtotal.toString()).toBe("100");
    expect(settled.totalPaid.toString()).toBe("100");
    expect(settled.netRevenue?.toString()).toBe("85");
    expect(lineTotal.toFixed(4)).toBe("100.0000");
    expect(settled.lines.map((line) => line.lineAmount.toString())).toEqual(["33.3333", "66.6667"]);
  });

  it("returns a structured failure when settling a missing customer order", async () => {
    const result = await settleCustomerOrderAction(`missing_settle_${runId}`, {
      shippingFee: "12",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("订单不存在");
    }
  });
});

async function expectLotQuantity(lotId: string, expected: string) {
  const ledgers = await prisma.stockLedger.findMany({
    where: { entityType: "LOT", entityId: lotId },
    select: { deltaQty: true },
  });
  const quantity = ledgers.reduce(
    (sum, ledger) => sum.plus(new Decimal(ledger.deltaQty.toString())),
    new Decimal(0)
  );
  expect(quantity.toString()).toBe(expected);
}
