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
  createSKU,
  createSKUAction,
  convertSkuStructureAction,
  deleteSKUAction,
  setSkuCatalogStatusAction,
  updateSKUAction,
} from "@/app/actions/skus";
import { createInventoryLotAction } from "@/app/actions/inventory-lots";

const runId = `skus_action_${Date.now()}`;
const organizationCode = `org_${runId}`;
const storeId = `store_${runId}`;
const userEmail = `${runId}@example.com`;

describe("sku action results", () => {
  beforeAll(async () => {
    process.env.ERP_DEV_USER_EMAIL = userEmail;

    const organization = await prisma.organization.create({
      data: {
        code: organizationCode,
        name: "SKU Action Test Organization",
      },
    });

    const store = await prisma.store.create({
      data: {
        id: storeId,
        organizationId: organization.id,
        code: `STORE_${runId}`,
        name: "SKU Action Test Store",
        currency: "CNY",
      },
    });

    const user = await prisma.user.create({
      data: {
        email: userEmail,
        name: "SKU Action Tester",
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
  });

  afterAll(async () => {
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.organization.deleteMany({ where: { code: organizationCode } });
    delete process.env.ERP_DEV_USER_EMAIL;
  });

  it("returns a structured failure when updating a missing SKU", async () => {
    const result = await updateSKUAction({
      id: `missing_sku_${runId}`,
      storeId: `store_${runId}`,
      code: `SKU_${runId}`,
      name: "Missing SKU",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("SKU不存在");
    }
  });

  it("returns a structured failure when deleting a missing SKU", async () => {
    const result = await deleteSKUAction(`missing_sku_${runId}`);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("SKU不存在");
    }
  });

  it("returns a structured failure when changing status for a missing SKU", async () => {
    const result = await setSkuCatalogStatusAction(`missing_sku_${runId}`, "disabled");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("SKU不存在");
    }
  });

  it("rejects invalid catalog reference price and currency on create", async () => {
    const negativePrice = await createSKUAction({
      storeId,
      code: `SKU_${runId}_NEG_PRICE`,
      name: "Negative Reference Price",
      attributes: {
        referencePrice: "-1",
        currency: "CNY",
      },
    });

    expect(negativePrice.success).toBe(false);
    if (!negativePrice.success) {
      expect(negativePrice.error).toContain("参考售价不能为负数");
    }

    const invalidCurrency = await createSKUAction({
      storeId,
      code: `SKU_${runId}_BAD_CURRENCY`,
      name: "Bad Currency",
      attributes: {
        referencePrice: "100",
        currency: "ABC",
      },
    });

    expect(invalidCurrency.success).toBe(false);
    if (!invalidCurrency.success) {
      expect(invalidCurrency.error).toContain("币种必须是 CNY、JPY、USD 或 EUR");
    }
  });

  it("creates catalog groups and variant SKUs with generated internal identity", async () => {
    const groupResult = await createSKUAction({
      storeId,
      catalogRole: "GROUP",
      name: "AJ1 芝加哥 2015",
      brand: "Nike",
      category: "球鞋",
      manufacturerCode: "555088-101",
      variantAxes: ["尺码"],
    });

    expect(groupResult.success).toBe(true);
    if (!groupResult.success) return;
    expect(groupResult.code).toBe("NIKE-555088-101");
    expect(groupResult.name).toBe("AJ1 芝加哥 2015");
    expect(groupResult.catalogRole).toBe("GROUP");
    expect(groupResult.manufacturerCode).toBe("555088-101");

    const variantResult = await createSKUAction({
      storeId,
      catalogRole: "VARIANT",
      parentSkuId: groupResult.id,
      variantLabel: "42码",
      variantValues: { 尺码: "42码" },
    });

    expect(variantResult.success).toBe(true);
    if (!variantResult.success) return;
    expect(variantResult.code).toBe("NIKE-555088-101-42");
    expect(variantResult.name).toBe("AJ1 芝加哥 2015 · 42码");
    expect(variantResult.catalogRole).toBe("VARIANT");
    expect(variantResult.variantLabel).toBe("42码");
    expect(variantResult.variantValues).toEqual({ 尺码: "42码" });
  });

  it("rejects inventory operations for an explicit catalog group even before variants exist", async () => {
    const group = await createSKU({
      storeId,
      catalogRole: "GROUP",
      name: "火影忍者 晓组织系列",
      category: "潮玩",
      variantAxes: ["角色"],
    });
    const location = await prisma.location.create({
      data: {
        storeId,
        code: `WH_${runId}_GROUP_REJECT`,
        name: "Group Reject Warehouse",
        type: "WAREHOUSE",
        region: "CN_SHANGHAI",
      },
    });

    const result = await createInventoryLotAction({
      storeId,
      skuId: group.id,
      locationId: location.id,
      quantity: "1",
      unitCost: "100",
      costCurrency: "CNY",
      sourceType: "PURCHASE",
      sourceId: `${runId}_GROUP_REJECT`,
      receivedAt: new Date("2026-07-06T08:00:00.000Z"),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("商品组只用于管理规格");
    }
  });

  it("converts an independent SKU to a group and back without changing the operational SKU id", async () => {
    const simple = await createSKU({
      storeId,
      catalogRole: "SIMPLE",
      name: "克罗心 绿松石单珠手链 6mm",
      brand: "Chrome Hearts",
      category: "手链",
      imageUrl: "/uploads/structure-test.jpg",
    });
    const intelligenceParent = await prisma.productIntelligenceItem.create({
      data: {
        storeId,
        title: simple.name,
        brand: simple.brand,
        visibility: "ORGANIZATION",
      },
    });
    const intelligenceChild = await prisma.productIntelligenceItem.create({
      data: {
        storeId,
        parentItemId: intelligenceParent.id,
        skuId: simple.id,
        title: "标准款",
        brand: simple.brand,
        visibility: "ORGANIZATION",
      },
    });
    const observation = await prisma.productIntelligenceObservation.create({
      data: {
        itemId: intelligenceChild.id,
        storeId,
        sourceType: "MARKET_SEEN",
        priceType: "SALE",
        amount: "85000",
        currency: "JPY",
        visibility: "ORGANIZATION",
      },
    });

    const toGroup = await convertSkuStructureAction({
      skuId: simple.id,
      mode: "SIMPLE_TO_GROUP",
      groupName: "克罗心 绿松石单珠手链",
      axisName: "尺寸",
      variantLabel: "6mm",
    });
    expect(toGroup.success).toBe(true);
    if (!toGroup.success) return;
    expect(toGroup.mode).toBe("SIMPLE_TO_GROUP");
    if (toGroup.mode !== "SIMPLE_TO_GROUP") return;

    const variantAfterConversion = await prisma.sKU.findUniqueOrThrow({
      where: { id: simple.id },
    });
    expect(variantAfterConversion.catalogRole).toBe("VARIANT");
    expect(variantAfterConversion.parentSkuId).toBe(toGroup.groupId);
    expect(variantAfterConversion.variantLabel).toBe("6mm");
    expect(variantAfterConversion.code).toBe(simple.code);
    const groupAfterConversion = await prisma.sKU.findUniqueOrThrow({
      where: { id: toGroup.groupId },
    });
    expect(groupAfterConversion.catalogRole).toBe("GROUP");
    const intelligenceAfterConversion = await prisma.productIntelligenceItem.findUniqueOrThrow({
      where: { id: intelligenceChild.id },
      include: { parentItem: true },
    });
    expect(intelligenceAfterConversion.title).toBe("6mm");
    expect(intelligenceAfterConversion.parentItem?.skuId).toBe(toGroup.groupId);
    expect(
      (
        await prisma.productIntelligenceObservation.findUniqueOrThrow({
          where: { id: observation.id },
        })
      ).itemId
    ).toBe(intelligenceChild.id);

    const toSimple = await convertSkuStructureAction({
      skuId: toGroup.groupId,
      mode: "GROUP_TO_SIMPLE",
      simpleName: "克罗心 绿松石单珠手链 6mm",
    });
    expect(toSimple.success).toBe(true);
    if (!toSimple.success) return;
    expect(toSimple.targetSkuId).toBe(simple.id);

    const simpleAfterRoundTrip = await prisma.sKU.findUniqueOrThrow({ where: { id: simple.id } });
    expect(simpleAfterRoundTrip.catalogRole).toBe("SIMPLE");
    expect(simpleAfterRoundTrip.parentSkuId).toBeNull();
    expect(simpleAfterRoundTrip.variantLabel).toBeNull();
    expect(simpleAfterRoundTrip.code).toBe(simple.code);
    const archivedGroup = await prisma.sKU.findUniqueOrThrow({ where: { id: toGroup.groupId } });
    expect(archivedGroup.mergeStatus).toBe("MERGED");
    const intelligenceAfterRoundTrip = await prisma.productIntelligenceItem.findUniqueOrThrow({
      where: { id: intelligenceChild.id },
      include: { parentItem: true },
    });
    expect(intelligenceAfterRoundTrip.title).toBe("标准款");
    expect(intelligenceAfterRoundTrip.parentItem?.skuId).toBeNull();
    expect(
      (
        await prisma.productIntelligenceObservation.findUniqueOrThrow({
          where: { id: observation.id },
        })
      ).itemId
    ).toBe(intelligenceChild.id);
  });
});
