import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";

test("sold-out variant can open presale from inventory details", async ({ page }) => {
  const fx = await prisma.fxRate.create({ data: { fromCurrency: "JPY", toCurrency: "CNY", rate: "0.05", effectiveDate: new Date() } });
  const code = `E2E-PRESALE-DETAIL-${Date.now()}`;
  const parent = await prisma.sKU.create({
    data: { storeId: "store_1", code, name: code, catalogRole: "GROUP" },
  });
  const soldOut = await prisma.sKU.create({
    data: {
      storeId: "store_1",
      code: `${code}-ZERO`,
      name: "零库存测试款",
      parentSkuId: parent.id,
      catalogRole: "VARIANT",
    },
  });
  const stocked = await prisma.sKU.create({
    data: {
      storeId: "store_1",
      code: `${code}-STOCK`,
      name: "有库存测试款",
      parentSkuId: parent.id,
      catalogRole: "VARIANT",
    },
  });
  const location = await prisma.location.findFirstOrThrow({
    where: { storeId: "store_1", isSellableDefault: true, region: { startsWith: "JP_" } },
  });
  const lot = await prisma.inventoryLot.create({
    data: {
      storeId: "store_1",
      skuId: stocked.id,
      locationId: location.id,
      unitCost: "100",
      costCurrency: "JPY",
      sourceType: "E2E",
      sourceId: code,
      receivedAt: new Date(),
      status: "ACTIVE",
    },
  });
  await prisma.stockLedger.create({
    data: {
      storeId: "store_1",
      entityType: "LOT",
      entityId: lot.id,
      locationId: location.id,
      deltaQty: "1",
      reason: "INBOUND_PURCHASE",
      refType: "E2E",
      refId: code,
    },
  });
  const platform = await prisma.platform.findFirstOrThrow({
    where: { storeId: "store_1", code: "MERCARI" },
  });
  const order = await prisma.customerOrder.create({
    data: {
      storeId: "store_1",
      orderNumber: code,
      platformId: platform.id,
      customerName: "E2E",
      orderDate: new Date(),
      currency: "JPY",
      subtotal: "100",
      totalPaid: "100",
      orderStatus: "SHIPPED",
      lines: { create: { skuId: soldOut.id, quantity: "1", lineAmount: "100", unitPrice: "100" } },
    },
  });
  let bundleOrderId: string | undefined;
  try {
    await page.goto(`/inventory/sellable?market=JP&q=${code}`);
    await page.getByRole("button", { name: "查看明细", exact: true }).click();
    await page.getByRole("button", { name: /零库存测试款.*未上架/ }).click();
    // The last button is inside the details overlay, above the outer card.
    await page.getByRole("button", { name: "预售上架", exact: true }).last().click();
    await expect(page.getByRole("paragraph").filter({ hasText: /^添加上架记录$/ })).toBeVisible();
    await expect(page.getByText(`${code}-ZERO · 零库存测试款`, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: "开启缺货预售（不设数量上限）" })
    ).toBeChecked();
    await expect(page.getByLabel("预计发货日期", { exact: true })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /我已在销售平台设置预售/ })).not.toBeChecked();
  const listingBase = { storeId: "store_1", platformId: platform.id, listingType: "SKU", currency: "JPY", listedPrice: "100", status: "ACTIVE" };
  const stockListing = await prisma.listing.create({ data: { ...listingBase, skuId: stocked.id } });
  const presaleListing = await prisma.listing.create({ data: { ...listingBase, skuId: soldOut.id, isPresale: true, expectedShipDate: new Date("2099-10-10"), presaleConfirmedAt: new Date() } });

    await page.goto(`/listing?q=${code}`);
    await page.getByRole("button", { name: "打包出售", exact: true }).click();
    await page.getByRole("checkbox", { name: "选择 零库存测试款", exact: true }).check();
    await page.getByRole("checkbox", { name: "选择 有库存测试款", exact: true }).check();
    await page.getByRole("button", { name: "填写打包单" }).click();
    const bundleDialog = page.getByRole("dialog", { name: "打包出售", exact: true });
    await expect(bundleDialog).toBeVisible();
    await expect(bundleDialog.getByRole("button", { name: "确认打包出售", exact: true })).toBeDisabled();
    await bundleDialog.getByLabel("收货国家/地区", { exact: true }).selectOption("JP");
    await bundleDialog.getByLabel("共同发货仓", { exact: true }).selectOption(location.id);
    await bundleDialog.getByLabel("平台订单号", { exact: true }).fill(`${code}-BUNDLE`);
    await bundleDialog.getByRole("checkbox", { name: /已与买家确认/ }).check();
    await bundleDialog.getByRole("button", { name: "确认打包出售", exact: true }).click();
    await expect(page).toHaveURL(/sales\//);
    const bundle = await prisma.customerOrder.findFirstOrThrow({ where: { externalOrderNo: `${code}-BUNDLE` } });
    bundleOrderId = bundle.id;
    expect(bundle.orderStatus).toBe("DRAFT");
    expect(bundle.shipTogetherLocationId).toBe(location.id);
    await expect(page.getByText(/合包发货仓：/)).toBeVisible();
    await page.goto(`/workbench?open=customerOrder:${bundle.id}`);
    await expect(page.getByRole("button", { name: "取消订单并释放预留", exact: true })).toBeVisible();
    await page.getByPlaceholder("如：买家取消、重复下单、信息有误").fill("买家取消等待");
    await page.getByRole("button", { name: "取消订单并释放预留", exact: true }).click();
    await page.getByRole("button", { name: "取消订单", exact: true }).click();
    await expect.poll(async () => (await prisma.customerOrder.findUniqueOrThrow({ where: { id: bundle.id } })).orderStatus).toBe("CANCELLED");


  } finally {
    await prisma.fxRate.delete({ where: { id: fx.id } });
    if (bundleOrderId) {
      await prisma.task.deleteMany({ where: { refId: bundleOrderId } });
      await prisma.customerOrder.delete({ where: { id: bundleOrderId } });
    }
    await prisma.listing.deleteMany({ where: { skuId: { in: [soldOut.id, stocked.id] } } });
    await prisma.customerOrder.delete({ where: { id: order.id } });
    await prisma.stockLedger.deleteMany({ where: { refId: code, refType: "E2E" } });
    await prisma.inventoryLot.delete({ where: { id: lot.id } });
    await prisma.sKU.deleteMany({ where: { id: { in: [soldOut.id, stocked.id, parent.id] } } });
  }
});
