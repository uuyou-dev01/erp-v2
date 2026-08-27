import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
  convertLotToItemUnitAction,
  createInventoryLotAction,
  deleteInventoryLotAction,
  getInventoryLotDeletionImpactAction,
  getInventoryLots,
} from "@/app/actions/inventory-lots";
import { createInboundItemUnit } from "@/lib/application/inventory";

const runId = `inventory_lots_${Date.now()}`;
const organizationCode = `org_${runId}`;
const storeId = `store_${runId}`;
const userEmail = `${runId}@example.com`;

describe("inventory lot action values", () => {
  beforeAll(async () => {
    process.env.ERP_DEV_USER_EMAIL = userEmail;
    const organization = await prisma.organization.create({
      data: {
        code: organizationCode,
        name: "Inventory Lots Action Test Organization",
      },
    });

    const store = await prisma.store.create({
      data: {
        id: storeId,
        organizationId: organization.id,
        code: `STORE_${runId}`,
        name: "Inventory Lots Action Test Store",
        currency: "CNY",
      },
    });

    const user = await prisma.user.create({
      data: {
        email: userEmail,
        name: "Inventory Lot Action Tester",
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
      data: { storeId: store.id, userId: user.id, role: "OWNER" },
    });
  });

  afterAll(async () => {
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.organization.deleteMany({ where: { code: organizationCode } });
    await prisma.user.deleteMany({ where: { email: userEmail } });
    delete process.env.ERP_DEV_USER_EMAIL;
  });

  it("deletes an unused lot with only its initial inbound ledger", async () => {
    const sku = await prisma.sKU.create({
      data: { storeId, code: `SKU_${runId}_DELETE_EMPTY_LOT`, name: "Deletable lot SKU" },
    });
    const location = await prisma.location.create({
      data: {
        storeId,
        code: `WH_${runId}_DELETE_EMPTY_LOT`,
        name: "Deletable Lot Warehouse",
        type: "WAREHOUSE",
        region: "CN_SHANGHAI",
      },
    });
    const lot = await prisma.inventoryLot.create({
      data: {
        storeId,
        skuId: sku.id,
        locationId: location.id,
        unitCost: "10",
        costCurrency: "CNY",
        sourceType: "PURCHASE",
        sourceId: `${runId}_MANUAL_LOT`,
        receivedAt: new Date(),
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
      },
    });

    const impact = await getInventoryLotDeletionImpactAction(lot.id, storeId);
    expect(impact.success).toBe(true);
    if (!impact.success) return;
    expect(impact.impact.canDelete).toBe(true);

    const result = await deleteInventoryLotAction(lot.id, storeId);
    expect(result.success).toBe(true);
    await expect(prisma.inventoryLot.findUnique({ where: { id: lot.id } })).resolves.toBeNull();
    await expect(
      prisma.stockLedger.count({ where: { entityType: "LOT", entityId: lot.id } })
    ).resolves.toBe(0);
  });

  it("keeps a lot that already has inventory history and explains the blocker", async () => {
    const sku = await prisma.sKU.create({
      data: { storeId, code: `SKU_${runId}_KEEP_HISTORY_LOT`, name: "Historical lot SKU" },
    });
    const location = await prisma.location.create({
      data: {
        storeId,
        code: `WH_${runId}_KEEP_HISTORY_LOT`,
        name: "Historical Lot Warehouse",
        type: "WAREHOUSE",
        region: "CN_SHANGHAI",
      },
    });
    const lot = await prisma.inventoryLot.create({
      data: {
        storeId,
        skuId: sku.id,
        locationId: location.id,
        unitCost: "10",
        costCurrency: "CNY",
        sourceType: "PURCHASE",
        sourceId: `${runId}_HISTORY_LOT`,
        receivedAt: new Date(),
      },
    });
    await prisma.stockLedger.createMany({
      data: [
        {
          storeId,
          entityType: "LOT",
          entityId: lot.id,
          locationId: location.id,
          deltaQty: "1",
          reason: "INBOUND_PURCHASE",
        },
        {
          storeId,
          entityType: "LOT",
          entityId: lot.id,
          locationId: location.id,
          deltaQty: "-1",
          reason: "ADJUST",
        },
      ],
    });

    const impact = await getInventoryLotDeletionImpactAction(lot.id, storeId);
    expect(impact.success).toBe(true);
    if (!impact.success) return;
    expect(impact.impact.canDelete).toBe(false);
    expect(impact.impact.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "ledgers", count: 2 })])
    );

    const result = await deleteInventoryLotAction(lot.id, storeId);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("不能删除");
    await expect(prisma.inventoryLot.findUnique({ where: { id: lot.id } })).resolves.not.toBeNull();
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
    const resultLot = lots.find((item) => item.id === lot.id);

    expect(resultLot?.onHandQuantity).toBe("3");
    expect(resultLot?.inventoryValue).toBe("300.00");
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

    await expect(prisma.itemUnit.findFirst({ where: { sourceId: lot.id } })).resolves.toBeNull();
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
