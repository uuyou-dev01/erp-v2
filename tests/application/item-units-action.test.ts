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
  createItemUnitAction,
  deleteItemUnitAction,
  getItemUnits,
  updateItemUnitAction,
} from "@/app/actions/item-units";

const runId = `item_units_action_${Date.now()}`;
const organizationCode = `org_${runId}`;
const storeId = `store_${runId}`;

describe("item unit action results", () => {
  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: {
        code: organizationCode,
        name: "Item Units Action Test Organization",
      },
    });

    await prisma.store.create({
      data: {
        id: storeId,
        organizationId: organization.id,
        code: `STORE_${runId}`,
        name: "Item Units Action Test Store",
        currency: "CNY",
      },
    });
  });

  afterAll(async () => {
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.organization.deleteMany({ where: { code: organizationCode } });
  });

  it("creates item units with stable identity label fields and photos", async () => {
    const sku = await prisma.sKU.create({
      data: {
        storeId,
        code: `SKU_${runId}_CREATE`,
        name: "Create Item Unit Product",
      },
    });
    const location = await prisma.location.create({
      data: {
        storeId,
        code: `WH_${runId}_CREATE`,
        name: "Create Item Unit Warehouse",
        type: "WAREHOUSE",
        region: "CN_SHANGHAI",
      },
    });
    const photos = ["https://example.test/item-unit-front.jpg"];

    const result = await createItemUnitAction({
      storeId,
      skuId: sku.id,
      locationId: location.id,
      unitCost: "128.50",
      costCurrency: "CNY",
      conditionGrade: "GOOD",
      photos,
      notes: "Created from action test",
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error(result.error);
    }

    const item = await prisma.itemUnit.findUniqueOrThrow({
      where: { id: result.id },
    });

    expect(item.unitCode).toMatch(/^IU-\d{8}-\d{6}$/);
    expect(item.labelCode).toBe(item.unitCode);
    expect(item.labelStatus).toBe("PENDING");
    expect(item.photos).toEqual(photos);
  });

  it("serializes item units with label, photo, hierarchy, location, and listing readiness fields", async () => {
    const parentSku = await prisma.sKU.create({
      data: {
        storeId,
        code: `SKU_${runId}_PARENT`,
        name: "Parent Product",
      },
    });
    const childSku = await prisma.sKU.create({
      data: {
        storeId,
        code: `SKU_${runId}_CHILD`,
        name: "Child Variant",
        parentSkuId: parentSku.id,
      },
    });
    const location = await prisma.location.create({
      data: {
        storeId,
        code: `WH_${runId}_BENCH`,
        name: "Bench Warehouse",
        type: "WAREHOUSE",
        region: "CN_SHANGHAI",
        isSellableDefault: false,
      },
    });
    const item = await prisma.itemUnit.create({
      data: {
        storeId,
        skuId: childSku.id,
        locationId: location.id,
        unitCost: "99.99",
        costCurrency: "CNY",
        unitCode: `UNIT_${runId}_BENCH`,
        labelCode: `LABEL_${runId}_BENCH`,
        labelStatus: "PRINTED",
        labelPrintedAt: new Date("2026-06-23T08:00:00.000Z"),
        conditionGrade: "GOOD",
        photos: ["https://example.test/front.jpg", "https://example.test/back.jpg"],
        sourceType: "MANUAL",
        sourceId: "test",
        status: "AVAILABLE",
      },
    });
    const platform = await prisma.platform.create({
      data: {
        storeId,
        code: `PF_${runId}`,
        name: "Workbench Platform",
      },
    });
    await prisma.listing.createMany({
      data: [
        {
          storeId,
          platformId: platform.id,
          skuId: childSku.id,
          itemUnitId: item.id,
          listingType: "ITEM_UNIT",
          listedPrice: "199.00",
          currency: "CNY",
          status: "ACTIVE",
        },
        {
          storeId,
          platformId: platform.id,
          skuId: childSku.id,
          itemUnitId: item.id,
          listingType: "ITEM_UNIT",
          listedPrice: "188.00",
          currency: "CNY",
          status: "DELISTED",
        },
      ],
    });

    const rows = await getItemUnits(storeId);
    const row = rows.find((candidate) => candidate.id === item.id);

    expect(row).toMatchObject({
      unitCode: `UNIT_${runId}_BENCH`,
      labelCode: `LABEL_${runId}_BENCH`,
      labelStatus: "PRINTED",
      photoCount: 2,
      activeListingCount: 1,
      location: expect.objectContaining({
        code: `WH_${runId}_BENCH`,
        isSellableDefault: false,
      }),
      sku: expect.objectContaining({
        code: `SKU_${runId}_CHILD`,
        name: "Child Variant",
        parentSku: {
          code: `SKU_${runId}_PARENT`,
          name: "Parent Product",
        },
      }),
    });
  });

  it("returns a structured failure when updating a missing item unit", async () => {
    const result = await updateItemUnitAction(`missing_item_${runId}`, {
      conditionGrade: "GOOD",
      photos: [],
      ownerId: undefined,
      holderId: undefined,
      notes: "Missing item unit",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("单品不存在");
    }
  });

  it("returns a structured failure when deleting a missing item unit", async () => {
    const result = await deleteItemUnitAction(
      `missing_item_${runId}`,
      `store_${runId}`
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("单品不存在");
    }
  });
});
