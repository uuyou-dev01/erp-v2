import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";

const STORE_ID = "store_1";

test.describe("listing platform eligibility", () => {
  const runId = `e2e_listing_eligibility_${Date.now()}`;
  const skuCode = `SKU_${runId}`.toUpperCase();
  const sellableSkuCode = `SKU_SELLABLE_${runId}`.toUpperCase();
  const sourceId = `SRC_${runId}`;
  const sellableSourceId = `SRC_SELLABLE_${runId}`;

  let skuId = "";
  let lotId = "";
  let locationId = "";
  let sellableSkuId = "";
  let sellableLotId = "";
  let sellableLocationId = "";
  let platformId = "";
  let createdPlatformId = "";

  test.beforeAll(async () => {
    const location = await prisma.location.create({
      data: {
        storeId: STORE_ID,
        code: `CN_TRANSIT_${runId}`,
        name: "E2E 中国转运仓",
        type: "FORWARDER",
        region: "CN_SHANGHAI",
        isSellableDefault: false,
      },
    });
    locationId = location.id;

    const sellableLocation = await prisma.location.create({
      data: {
        storeId: STORE_ID,
        code: `JP_SELLABLE_${runId}`,
        name: "E2E 日本可售仓",
        type: "WAREHOUSE",
        region: "JP_TOKYO",
        isSellableDefault: true,
      },
    });
    sellableLocationId = sellableLocation.id;

    const sku = await prisma.sKU.create({
      data: {
        storeId: STORE_ID,
        code: skuCode,
        name: "E2E 强履约限制商品",
      },
    });
    skuId = sku.id;

    const sellableSku = await prisma.sKU.create({
      data: {
        storeId: STORE_ID,
        code: sellableSkuCode,
        name: "E2E 批量上架库存商品",
      },
    });
    sellableSkuId = sellableSku.id;

    let platform = await prisma.platform.findFirst({
      where: { storeId: STORE_ID, code: "MERCARI" },
    });
    if (!platform) {
      platform = await prisma.platform.create({
        data: {
          storeId: STORE_ID,
          code: "MERCARI",
          name: "Mercari（メルカリ）",
          country: "JP",
          defaultCurrency: "JPY",
          defaultFeeRate: "0.1000",
        },
      });
      createdPlatformId = platform.id;
    }
    platformId = platform.id;

    const lot = await prisma.inventoryLot.create({
      data: {
        storeId: STORE_ID,
        skuId,
        locationId,
        unitCost: "100.0000",
        costCurrency: "CNY",
        sourceType: "E2E",
        sourceId,
        receivedAt: new Date(),
        status: "ACTIVE",
      },
    });
    lotId = lot.id;

    const sellableLot = await prisma.inventoryLot.create({
      data: {
        storeId: STORE_ID,
        skuId: sellableSkuId,
        locationId: sellableLocationId,
        unitCost: "120.0000",
        costCurrency: "CNY",
        sourceType: "E2E",
        sourceId: sellableSourceId,
        receivedAt: new Date(),
        status: "ACTIVE",
      },
    });
    sellableLotId = sellableLot.id;

    await prisma.stockLedger.create({
      data: {
        storeId: STORE_ID,
        entityType: "LOT",
        entityId: lot.id,
        locationId,
        deltaQty: "1.0000",
        reason: "INBOUND_PURCHASE",
        refType: "E2E",
        refId: sourceId,
      },
    });

    await prisma.stockLedger.create({
      data: {
        storeId: STORE_ID,
        entityType: "LOT",
        entityId: sellableLot.id,
        locationId: sellableLocationId,
        deltaQty: "1.0000",
        reason: "INBOUND_PURCHASE",
        refType: "E2E",
        refId: sellableSourceId,
      },
    });
  });

  test.afterAll(async () => {
    await prisma.listing.deleteMany({
      where: { skuId: { in: [skuId, sellableSkuId].filter(Boolean) } },
    });
    await prisma.stockLedger.deleteMany({
      where: { refType: "E2E", refId: { in: [sourceId, sellableSourceId] } },
    });
    await prisma.inventoryLot.deleteMany({ where: { id: lotId } });
    await prisma.inventoryLot.deleteMany({ where: { id: sellableLotId } });
    await prisma.sKU.deleteMany({ where: { id: { in: [skuId, sellableSkuId].filter(Boolean) } } });
    if (createdPlatformId) {
      await prisma.platform.deleteMany({ where: { id: createdPlatformId } });
    }
    await prisma.location.deleteMany({ where: { id: locationId } });
    await prisma.location.deleteMany({ where: { id: sellableLocationId } });
  });

  test("shows an inline eligibility error instead of a generic alert", async ({ page }) => {
    const dialogMessages: string[] = [];
    page.on("dialog", async (dialog) => {
      dialogMessages.push(dialog.message());
      await dialog.dismiss();
    });

    await page.goto(`/listing/new?listingType=SKU&skuId=${skuId}&platformId=${platformId}`);
    await expect(page.getByRole("heading", { name: "添加上架记录" })).toBeVisible();
    await expect(page.getByText("已到仓暂存 1 件，当前不可发货", { exact: false })).toBeVisible();

    await page.getByLabel(/Listing 价格/).fill("180");
    await page.getByRole("button", { name: "添加上架记录" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "可售库存" })).toBeVisible();
    expect(dialogMessages).toEqual([]);
    await expect(page).toHaveURL(/\/listing\/new/);

    await expect
      .poll(
        async () =>
          await prisma.listing.count({
            where: { storeId: STORE_ID, skuId, platformId },
          })
      )
      .toBe(0);
  });

  test("shows a batch listing inline eligibility error when sellable stock changes before submit", async ({
    page,
  }) => {
    const dialogMessages: string[] = [];
    page.on("dialog", async (dialog) => {
      dialogMessages.push(dialog.message());
      await dialog.dismiss();
    });

    await page.goto("/inventory/sellable?unlisted=1");
    await expect(page.getByRole("heading", { name: "库存看板" })).toBeVisible();
    await expect(page.getByText(sellableSkuCode, { exact: false }).first()).toBeVisible();

    await page.getByRole("button", { name: "批量添加上架记录" }).click();
    const batchDialog = page.locator(".fixed.inset-0").filter({
      has: page.getByRole("heading", { name: "批量添加上架记录" }),
    });
    await batchDialog.getByLabel(new RegExp(sellableSkuCode)).check();
    await batchDialog.getByRole("button", { name: "下一步" }).click();
    await batchDialog.getByRole("radio", { name: /Mercari/ }).check();
    await batchDialog.getByRole("button", { name: "下一步" }).click();
    await batchDialog.getByLabel(/统一价格/).fill("2800");
    await batchDialog.getByRole("button", { name: "下一步" }).click();

    await prisma.stockLedger.create({
      data: {
        storeId: STORE_ID,
        entityType: "LOT",
        entityId: sellableLotId,
        locationId: sellableLocationId,
        deltaQty: "-1.0000",
        reason: "ADJUSTMENT",
        refType: "E2E",
        refId: sellableSourceId,
      },
    });

    await batchDialog.getByRole("button", { name: /确认创建/ }).click();

    await expect(batchDialog.getByRole("alert")).toContainText("可售库存");
    expect(dialogMessages).toEqual([]);
    await expect(batchDialog.getByRole("heading", { name: "批量添加上架记录" })).toBeVisible();

    await expect
      .poll(
        async () =>
          await prisma.listing.count({
            where: { storeId: STORE_ID, skuId: sellableSkuId, platformId },
          })
      )
      .toBe(0);
  });
});
