import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/user-context", () => ({ requireUserContext: vi.fn().mockResolvedValue({}) }));

import { removeInventoryFromConsolidationBatchAction } from "@/app/actions/consolidations";

const run = `purchase_undo_${Date.now()}`;
let organizationId: string;
let storeId: string;
let locationId: string;
let skuId: string;

async function makeBatch(quantity: string, kind: "LOT" | "ITEM_UNIT" = "LOT") {
  const order = await prisma.purchaseOrder.create({
    data: {
      storeId,
      orderNo: `${run}_${Math.random()}`,
      currency: "JPY",
      subtotal: "3000",
      totalAmount: "3000",
      status: "RECEIVED",
      destinationLocationId: locationId,
      lines: {
        create: { skuId, trackingMode: kind, quantity, unitPrice: "1000", lineAmount: "3000" },
      },
    },
    include: { lines: true },
  });
  const sourceId = order.lines[0].id;
  let entityId: string;
  if (kind === "LOT") {
    const lot = await prisma.inventoryLot.create({
      data: {
        storeId,
        skuId,
        locationId,
        unitCost: "1000",
        costCurrency: "JPY",
        sourceType: "PURCHASE",
        sourceId,
        receivedAt: new Date(),
        status: "CONSOLIDATING",
      },
    });
    entityId = lot.id;
    await prisma.stockLedger.create({
      data: {
        storeId,
        entityType: "LOT",
        entityId,
        locationId,
        deltaQty: quantity,
        reason: "INBOUND_PURCHASE",
        refType: "PURCHASE_LINE",
        refId: sourceId,
      },
    });
  } else {
    const unit = await prisma.itemUnit.create({
      data: {
        storeId,
        skuId,
        locationId,
        unitCost: "1000",
        costCurrency: "JPY",
        sourceType: "PURCHASE",
        sourceId,
        status: "CONSOLIDATING",
      },
    });
    entityId = unit.id;
  }
  const batch = await prisma.consolidationBatch.create({
    data: {
      storeId,
      fromLocationId: locationId,
      status: "OPEN",
      lines: { create: { sourceType: "PURCHASE_LINE", sourceId, quantity } },
    },
    include: { lines: true },
  });
  return { batchId: batch.id, lineId: batch.lines[0].id, entityId };
}

describe("reversing purchase lines added to consolidation", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { code: run, name: run } });
    organizationId = org.id;
    const store = await prisma.store.create({
      data: { organizationId, code: run, name: run, currency: "CNY" },
    });
    storeId = store.id;
    const location = await prisma.location.create({
      data: { storeId, code: run, name: run, type: "FORWARDER" },
    });
    locationId = location.id;
    const sku = await prisma.sKU.create({ data: { storeId, code: run, name: "测试商品" } });
    skuId = sku.id;
  });

  afterAll(async () => {
    if (storeId) await prisma.store.delete({ where: { id: storeId } });
    if (organizationId) await prisma.organization.delete({ where: { id: organizationId } });
  });

  it("releases the whole lot and removes its batch line together", async () => {
    const { batchId, lineId, entityId } = await makeBatch("3");
    expect((await removeInventoryFromConsolidationBatchAction({ batchId, lineId })).success).toBe(
      true
    );
    expect(await prisma.consolidationBatchLine.findUnique({ where: { id: lineId } })).toBeNull();
    expect((await prisma.inventoryLot.findUniqueOrThrow({ where: { id: entityId } })).status).toBe(
      "ACTIVE"
    );
  });

  it("releases individual stock and removes its batch line together", async () => {
    const { batchId, lineId, entityId } = await makeBatch("1", "ITEM_UNIT");
    expect((await removeInventoryFromConsolidationBatchAction({ batchId, lineId })).success).toBe(
      true
    );
    expect(await prisma.consolidationBatchLine.findUnique({ where: { id: lineId } })).toBeNull();
    expect((await prisma.itemUnit.findUniqueOrThrow({ where: { id: entityId } })).status).toBe(
      "AVAILABLE"
    );
  });

  it("refuses an altered stock quantity without releasing anything", async () => {
    const { batchId, lineId, entityId } = await makeBatch("3");
    await prisma.stockLedger.create({
      data: { storeId, entityType: "LOT", entityId, locationId, deltaQty: "-1", reason: "ADJUST" },
    });
    const result = await removeInventoryFromConsolidationBatchAction({ batchId, lineId });
    expect(result.success).toBe(false);
    expect(
      await prisma.consolidationBatchLine.findUnique({ where: { id: lineId } })
    ).not.toBeNull();
    expect((await prisma.inventoryLot.findUniqueOrThrow({ where: { id: entityId } })).status).toBe(
      "CONSOLIDATING"
    );
  });

  it("refuses a sealed batch without changing stock", async () => {
    const { batchId, lineId, entityId } = await makeBatch("2");
    await prisma.consolidationBatch.update({ where: { id: batchId }, data: { status: "SEALED" } });
    expect((await removeInventoryFromConsolidationBatchAction({ batchId, lineId })).success).toBe(
      false
    );
    expect(
      await prisma.consolidationBatchLine.findUnique({ where: { id: lineId } })
    ).not.toBeNull();
    expect((await prisma.inventoryLot.findUniqueOrThrow({ where: { id: entityId } })).status).toBe(
      "CONSOLIDATING"
    );
  });
});
