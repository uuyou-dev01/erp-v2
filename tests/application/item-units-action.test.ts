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
const ownerEmail = `${runId}_owner@example.com`;
const workerEmail = `${runId}_worker@example.com`;
let organizationId = "";

describe("item unit action results", () => {
  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: {
        code: organizationCode,
        name: "Item Units Action Test Organization",
      },
    });
    organizationId = organization.id;

    await prisma.store.create({
      data: {
        id: storeId,
        organizationId: organization.id,
        code: `STORE_${runId}`,
        name: "Item Units Action Test Store",
        currency: "CNY",
      },
    });
    const [owner, worker] = await Promise.all([
      prisma.user.create({ data: { email: ownerEmail, password: "test", role: "OWNER", storeId } }),
      prisma.user.create({
        data: { email: workerEmail, password: "test", role: "FULFILLMENT", storeId },
      }),
    ]);
    await prisma.membership.createMany({
      data: [
        { organizationId, userId: owner.id, role: "OWNER", status: "ACTIVE" },
        { organizationId, userId: worker.id, role: "FULFILLMENT", status: "ACTIVE" },
      ],
    });
    await prisma.storeAccess.createMany({
      data: [
        { storeId, userId: owner.id, role: "OWNER" },
        { storeId, userId: worker.id, role: "FULFILLMENT" },
      ],
    });
    process.env.ERP_DEV_USER_EMAIL = ownerEmail;
  });

  afterAll(async () => {
    delete process.env.ERP_DEV_USER_EMAIL;
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.organization.deleteMany({ where: { code: organizationCode } });
  });

  it("hides costs and blocks edit/delete for a warehouse worker", async () => {
    process.env.ERP_DEV_USER_EMAIL = ownerEmail;
    const sku = await prisma.sKU.create({
      data: { storeId, code: `SKU_${runId}_PRIVATE`, name: "Private Cost Item" },
    });
    const location = await prisma.location.create({
      data: { storeId, code: `WH_${runId}_PRIVATE`, name: "Private Warehouse", type: "WAREHOUSE" },
    });
    const created = await createItemUnitAction({
      storeId,
      skuId: sku.id,
      locationId: location.id,
      unitCost: "777.77",
      costCurrency: "CNY",
    });
    expect(created.success).toBe(true);
    if (!created.success) return;

    process.env.ERP_DEV_USER_EMAIL = workerEmail;
    const rows = await getItemUnits(storeId);
    const row = rows.find((candidate) => candidate.id === created.id);
    expect(row?.costHidden).toBe(true);
    expect(row?.unitCost).toBeNull();
    expect(row?.costCurrency).toBeNull();
    expect(JSON.stringify(row)).not.toContain("777.77");

    const updated = await updateItemUnitAction(created.id, { notes: "worker edit" });
    expect(updated.success).toBe(false);
    if (!updated.success) expect(updated.error).toContain("只有库存管理员");
    const deleted = await deleteItemUnitAction(created.id, storeId);
    expect(deleted.success).toBe(false);
    if (!deleted.success) expect(deleted.error).toContain("只有库存管理员");
    process.env.ERP_DEV_USER_EMAIL = ownerEmail;
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
    expect(item.conditionType).toBe("USED");
    expect(item.conditionGrade).toBe("B");
    expect(item.functionStatus).toBe("UNTESTED");
    expect(item.status).toBe("RETURN_CHECK");
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
    const result = await deleteItemUnitAction(`missing_item_${runId}`, `store_${runId}`);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("单品不存在");
    }
  });
});
