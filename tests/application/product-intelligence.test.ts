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
  addProductIntelligenceObservationAction,
  createProductIntelligenceAction,
  createProductIntelligenceVariantAction,
  deleteProductIntelligenceObservationAction,
  getProductIntelligenceItemById,
  getProductIntelligenceItems,
  updateProductIntelligenceAction,
} from "@/app/actions/product-intelligence";

const runId = `product_intel_${Date.now()}`;
const userEmail = `${runId}@example.com`;
const organizationCode = `org_${runId}`;

let storeAId = "";
let storeBId = "";
let publicItemId = "";
let privateItemId = "";
let variantItemId = "";
let noPriceVariantId = "";
let storeBObservationId = "";

describe("product intelligence module", () => {
  beforeAll(async () => {
    process.env.ERP_DEV_USER_EMAIL = userEmail;

    const organization = await prisma.organization.create({
      data: {
        code: organizationCode,
        name: "Product Intelligence Test Organization",
      },
    });

    const [storeA, storeB] = await Promise.all([
      prisma.store.create({
        data: {
          organizationId: organization.id,
          code: `PI_A_${runId}`,
          name: "Camera Expert Store",
          currency: "JPY",
        },
      }),
      prisma.store.create({
        data: {
          organizationId: organization.id,
          code: `PI_B_${runId}`,
          name: "Figure Expert Store",
          currency: "JPY",
        },
      }),
    ]);
    storeAId = storeA.id;
    storeBId = storeB.id;

    const user = await prisma.user.create({
      data: {
        email: userEmail,
        name: "Product Intelligence Tester",
        password: "test",
        role: "OWNER",
        storeId: storeA.id,
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

    await prisma.storeAccess.createMany({
      data: [storeA, storeB].map((store) => ({
        storeId: store.id,
        userId: user.id,
        role: "OWNER",
      })),
    });
  });

  afterAll(async () => {
    await prisma.store.deleteMany({ where: { id: { in: [storeAId, storeBId] } } });
    await prisma.organization.deleteMany({ where: { code: organizationCode } });
    delete process.env.ERP_DEV_USER_EMAIL;
  });

  it("shares public product intelligence while hiding private items from other stores", async () => {
    const publicResult = await createProductIntelligenceAction({
      storeId: storeAId,
      title: "Sony CCD Camera",
      brand: "Sony",
      category: "中古相机",
      model: "CCD",
      productKind: "USED",
      tags: "高周转, 适合代卖",
      visibility: "PUBLIC",
    });
    expect(publicResult.success).toBe(true);
    if (publicResult.success) publicItemId = publicResult.id;

    const privateResult = await createProductIntelligenceAction({
      storeId: storeAId,
      title: "Private Test Product",
      category: "内部观察",
      visibility: "PRIVATE",
    });
    expect(privateResult.success).toBe(true);
    if (privateResult.success) privateItemId = privateResult.id;

    const storeBItems = await getProductIntelligenceItems({ storeId: storeBId });
    expect(storeBItems.map((item) => item.id)).toContain(publicItemId);
    expect(storeBItems.map((item) => item.id)).not.toContain(privateItemId);

    const publicDetailForB = await getProductIntelligenceItemById(publicItemId, storeBId);
    expect(publicDetailForB?.summary.observationCount).toBe(0);
    expect(publicDetailForB?.isOwner).toBe(false);
  });

  it("groups variants under a product intelligence item and summarizes child observations", async () => {
    const missingPriceResult = await createProductIntelligenceAction({
      storeId: storeAId,
      title: "No Price Product",
      category: "测试品类",
      visibility: "PUBLIC",
    });
    expect(missingPriceResult.success).toBe(true);

    const variantResult = await createProductIntelligenceAction({
      storeId: storeAId,
      parentItemId: publicItemId,
      title: "Sony CCD Camera Silver Variant",
      brand: "Sony",
      category: "中古相机",
      model: "Silver",
      productKind: "USED",
      visibility: "PUBLIC",
      initialObservations: [
        {
          priceType: "SALE",
          sourceType: "MARKET_SEEN",
          amount: "1999",
          currency: "JPY",
          platformName: "Mercari",
          sourceName: "Mercari",
          confidence: "MEDIUM",
        },
      ],
    });
    expect(variantResult.success).toBe(true);
    if (variantResult.success) variantItemId = variantResult.id;

    const list = await getProductIntelligenceItems({ storeId: storeBId });
    expect(list.map((item) => item.id)).toContain(publicItemId);
    expect(list.map((item) => item.id)).not.toContain(variantItemId);

    const groupDetail = await getProductIntelligenceItemById(publicItemId, storeBId);
    expect(groupDetail?.variantCount).toBe(1);
    expect(groupDetail?.childItems.map((item) => item.id)).toContain(variantItemId);
    expect(groupDetail?.summary.maxSalePrice).toBe("1999.00");

    const variantDetail = await getProductIntelligenceItemById(variantItemId, storeBId);
    expect(variantDetail?.parentItem?.id).toBe(publicItemId);
  });

  it("creates empty variants first and stores later observations on the selected variant", async () => {
    const variantResult = await createProductIntelligenceVariantAction({
      storeId: storeAId,
      parentItemId: publicItemId,
      title: "Sony CCD Camera Black Variant",
      model: "Black",
      visibility: "PUBLIC",
    });
    expect(variantResult.success).toBe(true);
    if (variantResult.success) noPriceVariantId = variantResult.id;

    const groupBeforeObservation = await getProductIntelligenceItemById(publicItemId, storeAId);
    const emptyVariant = groupBeforeObservation?.childItems.find((item) => item.id === noPriceVariantId);
    expect(emptyVariant?.observations).toHaveLength(0);

    const observationResult = await addProductIntelligenceObservationAction({
      storeId: storeBId,
      itemId: noPriceVariantId,
      priceType: "SALE",
      sourceType: "MARKET_SEEN",
      amount: "53000",
      currency: "JPY",
      platformName: "Yahoo Auction",
      sourceName: "Yahoo Auction",
    });
    expect(observationResult.success).toBe(true);

    const groupAfterObservation = await getProductIntelligenceItemById(publicItemId, storeAId);
    const observedVariant = groupAfterObservation?.childItems.find((item) => item.id === noPriceVariantId);
    expect(observedVariant?.observations.map((observation) => observation.amount.toString())).toContain("53000");
  });

  it("allows visible members to add observations but protects owner-only mutations", async () => {
    const parentObservationResult = await addProductIntelligenceObservationAction({
      storeId: storeBId,
      itemId: publicItemId,
      priceType: "SALE",
      sourceType: "PLATFORM_LISTING",
      amount: "1888",
      currency: "JPY",
      platformName: "Mercari",
      confidence: "MEDIUM",
      note: "带原盒更容易卖出",
    });
    expect(parentObservationResult.success).toBe(false);

    const addObservationResult = await addProductIntelligenceObservationAction({
      storeId: storeBId,
      itemId: variantItemId,
      priceType: "SALE",
      sourceType: "PLATFORM_LISTING",
      amount: "1888",
      currency: "JPY",
      platformName: "Mercari",
      confidence: "MEDIUM",
      note: "带原盒更容易卖出",
    });
    expect(addObservationResult.success).toBe(true);
    if (addObservationResult.success) storeBObservationId = addObservationResult.id;

    const detail = await getProductIntelligenceItemById(publicItemId, storeAId);
    const observedVariant = detail?.childItems.find((item) => item.id === variantItemId);
    expect(observedVariant?.observations.map((observation) => observation.id)).toContain(storeBObservationId);
    expect(detail?.summary.minSalePrice).toBe("1888.00");
    expect(detail?.summary.saleRanges).toEqual([
      { currency: "JPY", min: "1888.00", max: "53000.00" },
    ]);

    const cnySaleResult = await addProductIntelligenceObservationAction({
      storeId: storeAId,
      itemId: variantItemId,
      priceType: "SALE",
      sourceType: "MARKET_SEEN",
      amount: "53000",
      currency: "CNY",
      platformName: "闲鱼",
      confidence: "MEDIUM",
    });
    expect(cnySaleResult.success).toBe(true);

    const multiCurrencyDetail = await getProductIntelligenceItemById(publicItemId, storeAId);
    expect(multiCurrencyDetail?.summary.saleRanges).toEqual([
      { currency: "CNY", min: "53000.00", max: "53000.00" },
      { currency: "JPY", min: "1888.00", max: "53000.00" },
    ]);

    const updateFromStoreB = await updateProductIntelligenceAction(publicItemId, {
      storeId: storeBId,
      title: "Changed by another store",
      visibility: "PUBLIC",
    });
    expect(updateFromStoreB.success).toBe(false);

    const deleteObservationFromStoreA = await deleteProductIntelligenceObservationAction(
      storeBObservationId,
      storeAId,
    );
    expect(deleteObservationFromStoreA.success).toBe(false);

    const updateFromStoreA = await updateProductIntelligenceAction(publicItemId, {
      storeId: storeAId,
      title: "Sony CCD Camera Updated",
      brand: "Sony",
      category: "中古相机",
      model: "CCD",
      productKind: "USED",
      visibility: "PUBLIC",
      status: "ACTIVE",
    });
    expect(updateFromStoreA.success).toBe(true);

    const deleteObservationFromStoreB = await deleteProductIntelligenceObservationAction(
      storeBObservationId,
      storeBId,
    );
    expect(deleteObservationFromStoreB.success).toBe(true);
  });
});
