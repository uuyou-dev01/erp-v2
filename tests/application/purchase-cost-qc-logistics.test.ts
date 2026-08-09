import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import {
  addPurchaseLineAction,
  allocatePurchaseOrderCostsAction,
  createPurchaseOrderAction,
  inspectPurchaseReceiptQuantitiesAction,
  markPurchaseAsShippedAction,
  receivePurchaseOrderAction,
} from "@/app/actions/purchase-orders";

const runId = `purchase_cost_${Date.now()}`;
const email = `${runId}@example.com`;
let organizationId = "";
let storeId = "";
let locationId = "";
let skuAId = "";
let skuBId = "";
const fxEffectiveDate = new Date("2026-08-01T00:00:00.000Z");
let previousFxRate: string | null = null;

describe("purchase batch cost, quantity inspection and logistics metadata", () => {
  beforeAll(async () => {
    process.env.ERP_DEV_USER_EMAIL = email;
    const organization = await prisma.organization.create({
      data: { code: `${runId}_org`, name: "Purchase cost test" },
    });
    organizationId = organization.id;
    const store = await prisma.store.create({
      data: { organizationId, code: `${runId}_store`, name: "Purchase store", currency: "CNY" },
    });
    storeId = store.id;
    const user = await prisma.user.create({
      data: { email, password: "test", role: "OWNER", storeId },
    });
    await prisma.membership.create({
      data: { organizationId, userId: user.id, role: "OWNER", status: "ACTIVE" },
    });
    await prisma.storeAccess.create({ data: { storeId, userId: user.id, role: "OWNER" } });
    const location = await prisma.location.create({
      data: { storeId, code: `${runId}_home`, name: "Home inspection point", type: "HOME" },
    });
    locationId = location.id;
    const [skuA, skuB] = await Promise.all([
      prisma.sKU.create({ data: { storeId, code: `${runId}_a`, name: "Plush A" } }),
      prisma.sKU.create({ data: { storeId, code: `${runId}_b`, name: "Plush B" } }),
    ]);
    skuAId = skuA.id;
    skuBId = skuB.id;
    const existingFxRate = await prisma.fxRate.findUnique({
      where: {
        fromCurrency_toCurrency_effectiveDate: {
          fromCurrency: "CNY",
          toCurrency: "JPY",
          effectiveDate: fxEffectiveDate,
        },
      },
    });
    previousFxRate = existingFxRate?.rate.toString() ?? null;
    await prisma.fxRate.upsert({
      where: {
        fromCurrency_toCurrency_effectiveDate: {
          fromCurrency: "CNY",
          toCurrency: "JPY",
          effectiveDate: fxEffectiveDate,
        },
      },
      update: { rate: "20" },
      create: {
        fromCurrency: "CNY",
        toCurrency: "JPY",
        rate: "20",
        effectiveDate: fxEffectiveDate,
      },
    });
  });

  afterAll(async () => {
    delete process.env.ERP_DEV_USER_EMAIL;
    if (previousFxRate === null) {
      await prisma.fxRate.deleteMany({
        where: { fromCurrency: "CNY", toCurrency: "JPY", effectiveDate: fxEffectiveDate },
      });
    } else {
      await prisma.fxRate.update({
        where: {
          fromCurrency_toCurrency_effectiveDate: {
            fromCurrency: "CNY",
            toCurrency: "JPY",
            effectiveDate: fxEffectiveDate,
          },
        },
        data: { rate: previousFxRate },
      });
    }
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  it("registers a known batch total, receives with pending cost, then capitalizes multi-currency fees", async () => {
    const created = await createPurchaseOrderAction({
      storeId,
      orderNo: `${runId}_batch`,
      supplierName: "Japan supplier A",
      currency: "JPY",
      declaredTotalAmount: "40000",
      costAllocationStatus: "PENDING",
      orderedAt: new Date("2026-08-03T00:00:00.000Z"),
      destinationLocationId: locationId,
    });
    expect(created.success).toBe(true);
    if (!created.success) return;
    const first = await addPurchaseLineAction({ purchaseOrderId: created.id, skuId: skuAId, quantity: "4" });
    const second = await addPurchaseLineAction({ purchaseOrderId: created.id, skuId: skuBId, quantity: "6" });
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    await prisma.purchaseOrder.update({ where: { id: created.id }, data: { status: "ORDERED" } });
    expect((await receivePurchaseOrderAction({ purchaseOrderId: created.id, locationId, receivedAt: new Date() })).success).toBe(true);

    const pendingLots = await prisma.inventoryLot.findMany({
      where: { sourceType: "PURCHASE", sourceId: { in: [first.success ? first.id : "", second.success ? second.id : ""] } },
    });
    expect(pendingLots).toHaveLength(2);
    expect(pendingLots.every((lot) => lot.costStatus === "PENDING" && lot.unitCost.eq(0))).toBe(true);

    const allocated = await allocatePurchaseOrderCostsAction({
      purchaseOrderId: created.id,
      totalProductCost: "40000",
      method: "BY_QUANTITY",
      fees: [
        { feeType: "SHIPPING_COST", amount: "2000", currency: "JPY" },
        { feeType: "TAX", amount: "100", currency: "CNY", preferredRate: "20" },
      ],
    });
    expect(allocated.success).toBe(true);
    if (!allocated.success) return;
    expect(allocated.totalAmount).toBe("44000.0000");

    const order = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: created.id },
      include: { lines: true },
    });
    expect(order.costAllocationStatus).toBe("ALLOCATED");
    expect(order.subtotal.toString()).toBe("40000");
    expect(order.totalAmount.toString()).toBe("44000");
    expect(order.lines.map((line) => line.allocatedFee.toString())).toEqual(["1600", "2400"]);
    const confirmedLots = await prisma.inventoryLot.findMany({
      where: { sourceType: "PURCHASE", sourceId: { in: order.lines.map((line) => line.id) } },
    });
    expect(confirmedLots.every((lot) => lot.costStatus === "CONFIRMED")).toBe(true);
    expect(confirmedLots.map((lot) => lot.unitCost.toString())).toEqual(["4400", "4400"]);
    expect(JSON.stringify(order.lines[0].costTrace)).toContain('"originalCurrency":"CNY"');
  });

  it("blocks cost confirmation when an extra fee has no usable exchange rate", async () => {
    const order = await prisma.purchaseOrder.findFirstOrThrow({ where: { orderNo: `${runId}_batch` } });
    const result = await allocatePurchaseOrderCostsAction({
      purchaseOrderId: order.id,
      totalProductCost: "40000",
      method: "BY_QUANTITY",
      fees: [{ feeType: "OTHER", amount: "10", currency: "ZZZ" }],
    });
    expect(result.success).toBe(false);
  });

  it("records hand carry as a real logistics leg", async () => {
    const created = await createPurchaseOrderAction({
      storeId,
      orderNo: `${runId}_carry`,
      currency: "JPY",
      destinationLocationId: locationId,
    });
    expect(created.success).toBe(true);
    if (!created.success) return;
    expect((await addPurchaseLineAction({ purchaseOrderId: created.id, skuId: skuAId, quantity: "1", unitPrice: "500" })).success).toBe(true);
    await prisma.purchaseOrder.update({ where: { id: created.id }, data: { status: "ORDERED" } });
    const shipped = await markPurchaseAsShippedAction({
      purchaseOrderId: created.id,
      shippedAt: new Date(),
      destinationLocationId: locationId,
      shipmentMode: "in_transit",
      transportMode: "HAND_CARRY",
      carriedBy: "Friend A",
      customsAmount: "500",
      customsCurrency: "JPY",
      taxAmount: "0",
      taxCurrency: "CNY",
    });
    expect(shipped.success).toBe(true);
    const leg = await prisma.inboundShipment.findFirstOrThrow({ where: { purchaseOrderId: created.id } });
    expect(leg.transportMode).toBe("HAND_CARRY");
    expect(leg.carriedBy).toBe("Friend A");
    const receivedAt = new Date("2026-08-03T12:00:00.000Z");
    expect((await receivePurchaseOrderAction({
      purchaseOrderId: created.id,
      locationId,
      receivedAt,
    })).success).toBe(true);
    const deliveredLeg = await prisma.inboundShipment.findFirstOrThrow({
      where: { purchaseOrderId: created.id },
    });
    expect(deliveredLeg.status).toBe("DELIVERED");
    expect(deliveredLeg.receivedAt?.toISOString()).toBe(receivedAt.toISOString());
  });

  it("creates one identity record per purchased item when the line is explicitly one-item-one-record", async () => {
    const created = await createPurchaseOrderAction({
      storeId,
      orderNo: `${runId}_item_units`,
      currency: "CNY",
      destinationLocationId: locationId,
    });
    expect(created.success).toBe(true);
    if (!created.success) return;
    const line = await addPurchaseLineAction({
      purchaseOrderId: created.id,
      skuId: skuAId,
      trackingMode: "ITEM_UNIT",
      quantity: "3",
      unitPrice: "100",
    });
    expect(line.success).toBe(true);
    if (!line.success) return;
    await prisma.purchaseOrder.update({ where: { id: created.id }, data: { status: "ORDERED" } });
    expect((await receivePurchaseOrderAction({
      purchaseOrderId: created.id,
      locationId,
      receivedAt: new Date(),
    })).success).toBe(true);

    const [lots, units] = await Promise.all([
      prisma.inventoryLot.findMany({ where: { sourceType: "PURCHASE", sourceId: line.id } }),
      prisma.itemUnit.findMany({
        where: { sourceType: "PURCHASE", sourceId: line.id },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    expect(lots).toHaveLength(0);
    expect(units).toHaveLength(3);
    expect(new Set(units.map((unit) => unit.unitCode)).size).toBe(3);
    expect(units.every((unit) => unit.status === "AVAILABLE" && unit.unitCost.eq(100))).toBe(true);
  });

  it("rejects fractional quantities for one-item-one-record purchasing", async () => {
    const created = await createPurchaseOrderAction({
      storeId,
      orderNo: `${runId}_fractional_item_units`,
      currency: "CNY",
    });
    expect(created.success).toBe(true);
    if (!created.success) return;
    const line = await addPurchaseLineAction({
      purchaseOrderId: created.id,
      skuId: skuAId,
      trackingMode: "ITEM_UNIT",
      quantity: "1.5",
      unitPrice: "100",
    });
    expect(line.success).toBe(false);
    if (!line.success) expect(line.error).toContain("必须是整数");
  });

  it("splits one received lot into passed, supplier-return and reinspection quantities", async () => {
    const created = await createPurchaseOrderAction({
      storeId,
      orderNo: `${runId}_inspection`,
      currency: "CNY",
      destinationLocationId: locationId,
    });
    expect(created.success).toBe(true);
    if (!created.success) return;
    const line = await addPurchaseLineAction({ purchaseOrderId: created.id, skuId: skuBId, quantity: "10", unitPrice: "100" });
    expect(line.success).toBe(true);
    if (!line.success) return;
    await prisma.purchaseOrder.update({ where: { id: created.id }, data: { status: "ORDERED" } });
    expect((await receivePurchaseOrderAction({ purchaseOrderId: created.id, locationId, receivedAt: new Date() })).success).toBe(true);
    const inspected = await inspectPurchaseReceiptQuantitiesAction({
      purchaseOrderId: created.id,
      lines: [{ purchaseLineId: line.id, passedQty: "6", failedQty: "2", pendingQty: "2" }],
      note: "2 damaged, 2 need recheck",
    });
    expect(inspected.success).toBe(true);
    const lots = await prisma.inventoryLot.findMany({
      where: { sourceType: "PURCHASE", sourceId: line.id, status: { not: "CONSUMED" } },
      orderBy: { batchLabel: "asc" },
    });
    expect(lots.map((lot) => lot.status).sort()).toEqual(["ACTIVE", "RETURN_CHECK", "RETURN_TO_SUPPLIER"]);
    const quantities = await prisma.stockLedger.groupBy({
      by: ["entityId"],
      where: { entityId: { in: lots.map((lot) => lot.id) } },
      _sum: { deltaQty: true },
    });
    expect(quantities.map((row) => row._sum.deltaQty?.toString()).sort()).toEqual(["2", "2", "6"]);
    const inspection = await prisma.inspectionEvent.findFirstOrThrow({
      where: { refType: "PURCHASE_LINE", refId: line.id, result: "PARTIAL" },
      orderBy: { createdAt: "desc" },
    });
    expect(inspection.passedQty?.toString()).toBe("6");
    expect(inspection.failedQty?.toString()).toBe("2");
    expect(inspection.pendingQty?.toString()).toBe("2");
  });
});
