import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import { updatePurchaseOrderBusinessDateAction } from "@/app/actions/purchase-orders";

const runId = `purchase_date_${Date.now()}`;
const email = `${runId}@example.com`;
let organizationId = "";
let storeId = "";
let orderId = "";
let quickEntryId = "";

describe("purchase business date correction", () => {
  beforeAll(async () => {
    process.env.ERP_DEV_USER_EMAIL = email;
    const organization = await prisma.organization.create({
      data: { code: `${runId}_org`, name: "Purchase date correction" },
    });
    organizationId = organization.id;
    const store = await prisma.store.create({
      data: { organizationId, code: `${runId}_store`, name: "Date store", currency: "CNY" },
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
      data: { storeId, code: `${runId}_home`, name: "Home", type: "HOME" },
    });
    const sku = await prisma.sKU.create({
      data: { storeId, code: `${runId}_sku`, name: "Date correction SKU" },
    });
    const originalDate = new Date("2026-08-20T00:00:00.000Z");
    const order = await prisma.purchaseOrder.create({
      data: {
        storeId,
        orderNo: `${runId}_order`,
        currency: "CNY",
        subtotal: "100",
        totalAmount: "100",
        status: "RECEIVED",
        orderedAt: originalDate,
        receivedAt: originalDate,
      },
    });
    orderId = order.id;
    const entry = await prisma.quickEntry.create({
      data: {
        storeId,
        rawProductName: "Date correction SKU",
        purchaseDate: originalDate,
        generatedPurchaseOrderId: order.id,
        generatedSkuId: sku.id,
        processedStatus: "COMPLETED",
      },
    });
    quickEntryId = entry.id;
    const lot = await prisma.inventoryLot.create({
      data: {
        storeId,
        skuId: sku.id,
        locationId: location.id,
        unitCost: "100",
        costCurrency: "CNY",
        sourceType: "QUICK_ENTRY",
        sourceId: entry.id,
        receivedAt: originalDate,
      },
    });
    await prisma.quickEntry.update({ where: { id: entry.id }, data: { generatedLotId: lot.id } });
    await prisma.stockLedger.create({
      data: {
        storeId,
        occurredAt: originalDate,
        entityType: "LOT",
        entityId: lot.id,
        locationId: location.id,
        deltaQty: "1",
        reason: "INBOUND_PURCHASE",
        refType: "QUICK_ENTRY",
        refId: entry.id,
      },
    });
  });

  afterAll(async () => {
    delete process.env.ERP_DEV_USER_EMAIL;
    await prisma.activityLog.deleteMany({ where: { organizationId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  it("syncs the corrected date without rewriting the immutable capture timestamp", async () => {
    const before = await prisma.quickEntry.findUniqueOrThrow({ where: { id: quickEntryId } });
    const result = await updatePurchaseOrderBusinessDateAction(orderId, "2026-08-18");
    expect(result.success).toBe(true);

    const [order, entry, lot, ledger, activity] = await Promise.all([
      prisma.purchaseOrder.findUniqueOrThrow({ where: { id: orderId } }),
      prisma.quickEntry.findUniqueOrThrow({ where: { id: quickEntryId } }),
      prisma.inventoryLot.findFirstOrThrow({ where: { sourceId: quickEntryId } }),
      prisma.stockLedger.findFirstOrThrow({ where: { refId: quickEntryId } }),
      prisma.activityLog.findFirstOrThrow({
        where: { refType: "PURCHASE_ORDER", refId: orderId },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    expect(order.orderedAt?.toISOString()).toBe("2026-08-18T00:00:00.000Z");
    expect(order.receivedAt?.toISOString()).toBe("2026-08-18T00:00:00.000Z");
    expect(entry.purchaseDate?.toISOString()).toBe("2026-08-18T00:00:00.000Z");
    expect(entry.createdAt.toISOString()).toBe(before.createdAt.toISOString());
    expect(lot.receivedAt.toISOString()).toBe("2026-08-18T00:00:00.000Z");
    expect(ledger.occurredAt.toISOString()).toBe("2026-08-18T00:00:00.000Z");
    expect(activity.action).toBe("PURCHASE_BUSINESS_DATE_CORRECTED");
  });

  it("rejects impossible calendar dates", async () => {
    const result = await updatePurchaseOrderBusinessDateAction(orderId, "2026-02-31");
    expect(result.success).toBe(false);
  });
});
