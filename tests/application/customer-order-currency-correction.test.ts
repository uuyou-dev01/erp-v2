import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const identity = vi.hoisted(() => ({
  organizationId: "",
  activeStoreId: "",
  userId: "test-actor",
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/user-context", async (original) => ({
  ...(await original<typeof import("@/lib/auth/user-context")>()),
  requireUserContext: async () => identity,
}));

import { correctCustomerOrderCurrencyAction } from "@/app/actions/customer-orders";

const run = `currency_correction_${Date.now()}`;
let organizationId: string;
let storeId: string;
let skuId: string;

async function createOrder(suffix: string, orderStatus = "SHIPPED") {
  return prisma.customerOrder.create({
    data: {
      storeId,
      orderNumber: `${run}_${suffix}`,
      customerName: "测试客户",
      orderDate: new Date("2026-09-13T08:06:18Z"),
      currency: "CNY",
      subtotal: "3280",
      totalPaid: "3280",
      platformFee: "328",
      shippingFee: "520",
      shippingFeeStatus: "ESTIMATED",
      netRevenue: "2432",
      orderStatus,
      lines: { create: { skuId, quantity: "1", unitPrice: "3280", lineAmount: "3280" } },
    },
    include: { lines: true },
  });
}

describe("customer order original-currency correction", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { code: run, name: run } });
    organizationId = org.id;
    const store = await prisma.store.create({
      data: { organizationId, code: run, name: run, currency: "CNY" },
    });
    storeId = store.id;
    identity.organizationId = organizationId;
    identity.activeStoreId = storeId;
    const sku = await prisma.sKU.create({ data: { storeId, code: run, name: "测试商品" } });
    skuId = sku.id;
  });

  afterAll(async () => {
    if (storeId) await prisma.store.delete({ where: { id: storeId } });
    if (organizationId) await prisma.organization.delete({ where: { id: organizationId } });
  });

  it("changes only the original-currency label, synchronizes quick entry, and records an audit event", async () => {
    const order = await createOrder("ordinary", "CONFIRMED");
    await prisma.quickEntry.create({
      data: {
        storeId,
        rawProductName: "测试商品",
        generatedCustomerOrderId: order.id,
        saleCurrency: "CNY",
        salePrice: "3280",
        saleShippingFee: "520",
      },
    });

    const result = await correctCustomerOrderCurrencyAction({
      orderId: order.id,
      expectedCurrency: "CNY",
      expectedTotalPaid: "3280",
      newCurrency: "JPY",
      confirmedSameCurrencyFees: true,
    });
    expect(result).toMatchObject({ success: true, currency: "JPY" });
    const corrected = await prisma.customerOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(corrected.currency).toBe("JPY");
    expect(corrected.totalPaid.toString()).toBe("3280");
    expect(corrected.platformFee.toString()).toBe("328");
    expect(corrected.shippingFee.toString()).toBe("520");
    expect(corrected.netRevenue?.toString()).toBe("2432");
    expect(
      (
        await prisma.orderLine.findUniqueOrThrow({ where: { id: order.lines[0].id } })
      ).lineAmount.toString()
    ).toBe("3280");
    expect(
      (await prisma.quickEntry.findFirstOrThrow({ where: { generatedCustomerOrderId: order.id } }))
        .saleCurrency
    ).toBe("JPY");
    const audit = await prisma.activityLog.findFirstOrThrow({
      where: {
        refType: "CUSTOMER_ORDER",
        refId: order.id,
        action: "CUSTOMER_ORDER_CURRENCY_CORRECTED",
      },
    });
    expect(audit.before).toMatchObject({ currency: "CNY", totalPaid: "3280" });
    expect(audit.after).toMatchObject({ currency: "JPY", totalPaid: "3280" });
  });

  it("refuses to change an order that already has a linked settlement", async () => {
    const order = await createOrder("settled_link");
    await prisma.settlement.create({
      data: {
        storeId,
        customerOrderId: order.id,
        settlementNo: `${run}_settlement`,
        currency: "CNY",
      },
    });
    const result = await correctCustomerOrderCurrencyAction({
      orderId: order.id,
      expectedCurrency: "CNY",
      expectedTotalPaid: "3280",
      newCurrency: "JPY",
      confirmedSameCurrencyFees: true,
    });
    expect(result.success).toBe(false);
    expect(
      (await prisma.customerOrder.findUniqueOrThrow({ where: { id: order.id } })).currency
    ).toBe("CNY");
    expect(
      await prisma.activityLog.count({
        where: { refId: order.id, action: "CUSTOMER_ORDER_CURRENCY_CORRECTED" },
      })
    ).toBe(0);
  });

  it("refuses to leave a line-level fee in the old currency", async () => {
    const order = await createOrder("line_fee");
    await prisma.fee.create({
      data: {
        refType: "ORDER_LINE",
        refId: order.lines[0].id,
        feeType: "PLATFORM_FEE",
        amount: "328",
        currency: "CNY",
      },
    });
    const result = await correctCustomerOrderCurrencyAction({
      orderId: order.id,
      expectedCurrency: "CNY",
      expectedTotalPaid: "3280",
      newCurrency: "JPY",
      confirmedSameCurrencyFees: true,
    });
    expect(result.success).toBe(false);
    expect(
      (await prisma.customerOrder.findUniqueOrThrow({ where: { id: order.id } })).currency
    ).toBe("CNY");
  });

  it("rejects stale amounts and requires explicit same-currency confirmation", async () => {
    const order = await createOrder("stale");
    const base = {
      orderId: order.id,
      expectedCurrency: "CNY",
      expectedTotalPaid: "3280",
      newCurrency: "JPY",
    };
    expect(
      (
        await correctCustomerOrderCurrencyAction({
          ...base,
          expectedTotalPaid: "3200",
          confirmedSameCurrencyFees: true,
        })
      ).success
    ).toBe(false);
    expect(
      (await correctCustomerOrderCurrencyAction({ ...base, confirmedSameCurrencyFees: false }))
        .success
    ).toBe(false);
    expect(
      (await prisma.customerOrder.findUniqueOrThrow({ where: { id: order.id } })).currency
    ).toBe("CNY");
  });
});
