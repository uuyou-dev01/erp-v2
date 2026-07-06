import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  convertLotToItemUnitAction,
  createInventoryLotAction,
  getInventoryLots,
} from "@/app/actions/inventory-lots";
import { createInboundItemUnit } from "@/lib/application/inventory";

const runId = `inventory_lots_${Date.now()}`;
const organizationCode = `org_${runId}`;
const storeId = `store_${runId}`;

describe("inventory lot action values", () => {
  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: {
        code: organizationCode,
        name: "Inventory Lots Action Test Organization",
      },
    });

    await prisma.store.create({
      data: {
        id: storeId,
        organizationId: organization.id,
        code: `STORE_${runId}`,
        name: "Inventory Lots Action Test Store",
        currency: "CNY",
      },
    });
  });

  afterAll(async () => {
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.organization.deleteMany({ where: { code: organizationCode } });
  });

  it("returns on-hand quantity and inventory value from stock ledger quantity", async () => {
    const sku = await prisma.sKU.create({
      data: {
        storeId,
        code: `SKU_${runId}_LOT_VALUE`,
        name: "Inventory Lot Value Product",
      },
    });
    const location = await prisma.location.create({
      data: {
        storeId,
        code: `WH_${runId}`,
        name: "Inventory Lot Warehouse",
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
    await prisma.stockLedger.createMany({
      data: [
        {
          storeId,
          entityType: "LOT",
          entityId: lot.id,
          locationId: location.id,
          deltaQty: "5",
          reason: "INBOUND_PURCHASE",
          refType: "E2E",
          refId: `${runId}_LOT_VALUE_IN`,
        },
        {
          storeId,
          entityType: "LOT",
          entityId: lot.id,
          locationId: location.id,
          deltaQty: "-2",
          reason: "OUTBOUND_SALE",
          refType: "E2E",
          refId: `${runId}_LOT_VALUE_OUT`,
        },
      ],
    });

    const lots = await getInventoryLots(storeId);

    expect(lots).toHaveLength(1);
    expect(lots[0].onHandQuantity).toBe("3");
    expect(lots[0].inventoryValue).toBe("300.00");
  });

  it("returns a structured failure when creating a lot with invalid quantity", async () => {
    const sku = await prisma.sKU.create({
      data: {
        storeId,
        code: `SKU_${runId}_INVALID_LOT`,
        name: "Invalid Inventory Lot Product",
      },
    });
    const location = await prisma.location.create({
      data: {
        storeId,
        code: `WH_${runId}_INVALID`,
        name: "Invalid Inventory Lot Warehouse",
        type: "WAREHOUSE",
        region: "CN_SHANGHAI",
      },
    });

    const result = await createInventoryLotAction({
      storeId,
      skuId: sku.id,
      locationId: location.id,
      quantity: "0",
      unitCost: "100",
      costCurrency: "CNY",
      sourceType: "PURCHASE",
      sourceId: `${runId}_INVALID_LOT`,
      receivedAt: new Date("2026-06-22T08:00:00.000Z"),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("入库数量必须大于 0");
    }
  });

  it("returns a structured failure when creating a lot for a parent SKU with variants", async () => {
    const parent = await prisma.sKU.create({
      data: {
        storeId,
        code: `SKU_${runId}_PARENT_LOT`,
        name: "Parent Lot Product",
      },
    });
    await prisma.sKU.create({
      data: {
        storeId,
        code: `SKU_${runId}_CHILD_LOT`,
        name: "Child Lot Product",
        parentSkuId: parent.id,
      },
    });
    const location = await prisma.location.create({
      data: {
        storeId,
        code: `WH_${runId}_PARENT`,
        name: "Parent Lot Warehouse",
        type: "WAREHOUSE",
        region: "CN_SHANGHAI",
      },
    });

    const result = await createInventoryLotAction({
      storeId,
      skuId: parent.id,
      locationId: location.id,
      quantity: "1",
      unitCost: "100",
      costCurrency: "CNY",
      sourceType: "PURCHASE",
      sourceId: `${runId}_PARENT_LOT`,
      receivedAt: new Date("2026-06-22T08:00:00.000Z"),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("商品组只用于管理规格");
    }
  });

  it("returns a structured failure when splitting more than available quantity", async () => {
    const sku = await prisma.sKU.create({
      data: {
        storeId,
        code: `SKU_${runId}_SPLIT_LIMIT`,
        name: "Split Limit Product",
      },
    });
    const location = await prisma.location.create({
      data: {
        storeId,
        code: `WH_${runId}_SPLIT`,
        name: "Split Limit Warehouse",
        type: "WAREHOUSE",
        region: "CN_SHANGHAI",
      },
    });
    const lot = await prisma.inventoryLot.create({
      data: {
        storeId,
        skuId: sku.id,
        locationId: location.id,
        unitCost: "80",
        costCurrency: "CNY",
        sourceType: "E2E",
        sourceId: `${runId}_SPLIT_LIMIT`,
        receivedAt: new Date("2026-06-22T08:00:00.000Z"),
      },
    });
    await prisma.stockLedger.create({
      data: {
        storeId,
        entityType: "LOT",
        entityId: lot.id,
        locationId: location.id,
        deltaQty: "1",
        reason: "INBOUND_PURCHASE",
        refType: "E2E",
        refId: `${runId}_SPLIT_LIMIT_IN`,
      },
    });

    const result = await convertLotToItemUnitAction({
      lotId: lot.id,
      storeId,
      quantity: 2,
      conditionGrade: "GOOD",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("可用数量不足");
    }

    await expect(
      prisma.itemUnit.findFirst({ where: { sourceId: lot.id } })
    ).resolves.toBeNull();
    await expect(
      prisma.inventorySplit.findFirst({ where: { sourceId: lot.id } })
    ).resolves.toBeNull();
  });

  it("creates label identity fields when splitting a lot into an item unit", async () => {
    const sku = await prisma.sKU.create({
      data: {
        storeId,
        code: `SKU_${runId}_SPLIT_IDENTITY`,
        name: "Split Identity Product",
      },
    });
    const location = await prisma.location.create({
      data: {
        storeId,
        code: `WH_${runId}_SPLIT_IDENTITY`,
        name: "Split Identity Warehouse",
        type: "WAREHOUSE",
        region: "CN_SHANGHAI",
      },
    });
    const lot = await prisma.inventoryLot.create({
      data: {
        storeId,
        skuId: sku.id,
        locationId: location.id,
        unitCost: "88",
        costCurrency: "CNY",
        sourceType: "E2E",
        sourceId: `${runId}_SPLIT_IDENTITY`,
        receivedAt: new Date("2026-06-22T08:00:00.000Z"),
      },
    });
    await prisma.stockLedger.create({
      data: {
        storeId,
        entityType: "LOT",
        entityId: lot.id,
        locationId: location.id,
        deltaQty: "1",
        reason: "INBOUND_PURCHASE",
        refType: "E2E",
        refId: `${runId}_SPLIT_IDENTITY_IN`,
      },
    });

    const result = await convertLotToItemUnitAction({
      lotId: lot.id,
      storeId,
      quantity: 1,
      conditionGrade: "GOOD",
    });

    if (!result.success) {
      throw new Error(result.error);
    }
    expect(result.success).toBe(true);

    const item = await prisma.itemUnit.findUniqueOrThrow({
      where: { id: result.itemUnitId },
    });

    expect(item.unitCode).toMatch(/^IU-\d{8}-\d{6}$/);
    expect(item.labelCode).toBe(item.unitCode);
    expect(item.labelStatus).toBe("PENDING");
  });

  it("creates label identity fields for inbound item units", async () => {
    const sku = await prisma.sKU.create({
      data: {
        storeId,
        code: `SKU_${runId}_INBOUND_IDENTITY`,
        name: "Inbound Identity Product",
      },
    });
    const location = await prisma.location.create({
      data: {
        storeId,
        code: `WH_${runId}_INBOUND_IDENTITY`,
        name: "Inbound Identity Warehouse",
        type: "WAREHOUSE",
        region: "CN_SHANGHAI",
      },
    });

    const item = await prisma.$transaction((tx) =>
      createInboundItemUnit(tx, {
        storeId,
        skuId: sku.id,
        locationId: location.id,
        unitCost: "66",
        costCurrency: "CNY",
        sourceType: "PURCHASE",
        sourceId: `${runId}_INBOUND_IDENTITY`,
        receivedAt: new Date("2026-06-22T08:00:00.000Z"),
      })
    );

    expect(item.unitCode).toMatch(/^IU-20260622-\d{6}$/);
    expect(item.labelCode).toBe(item.unitCode);
    expect(item.labelStatus).toBe("PENDING");
  });
});
