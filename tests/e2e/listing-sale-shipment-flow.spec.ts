import { expect, test } from "@playwright/test";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";

const STORE_ID = "store_1";

test.describe("listing sale and shipment flow", () => {
  const runId = `e2e_${Date.now()}`;
  const skuCode = `SKU_${runId}`;
  const externalOrderNo = `SO_${runId}`;
  const sourceId = `SRC_${runId}`;

  let skuId = "";
  let locationId = "";
  let listingId = "";
  let lotId = "";
  let createdPlatformId = "";

  test.beforeAll(async () => {
    const location =
      (await prisma.location.findFirst({
        where: { storeId: STORE_ID, isSellableDefault: true, region: { startsWith: "JP_" } },
      })) ??
      (await prisma.location.create({
        data: {
          storeId: STORE_ID,
          code: `WH_${runId}`,
          name: "E2E 可售仓",
          type: "WAREHOUSE",
          region: "JP_TOKYO",
        },
      }));
    locationId = location.id;

    const sku = await prisma.sKU.create({
      data: {
        storeId: STORE_ID,
        code: skuCode,
        name: "E2E 完整售出发货商品",
      },
    });
    skuId = sku.id;

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
          defaultCurrency: "CNY",
          defaultFeeRate: "0.1000",
          defaultShippingFee: "12.0000",
        },
      });
      createdPlatformId = platform.id;
    }

    const lot = await prisma.inventoryLot.create({
      data: {
        storeId: STORE_ID,
        skuId,
        locationId,
        unitCost: "100.0000",
        costCurrency: "CNY",
        sourceType: "PURCHASE",
        sourceId,
        receivedAt: new Date(),
        status: "ACTIVE",
      },
    });
    lotId = lot.id;

    await prisma.stockLedger.create({
      data: {
        storeId: STORE_ID,
        entityType: "LOT",
        entityId: lot.id,
        locationId,
        deltaQty: "2.0000",
        reason: "INBOUND_PURCHASE",
        refType: "E2E",
        refId: sourceId,
      },
    });

    const listing = await prisma.listing.create({
      data: {
        storeId: STORE_ID,
        platformId: platform.id,
        listingType: "SKU",
        skuId,
        listedPrice: "180.0000",
        currency: "CNY",
        feeRateOverride: "0.1000",
        shippingFeeOverride: "12.0000",
        estimatedNet: "150.0000",
        status: "ACTIVE",
      },
    });
    listingId = listing.id;
  });

  test.afterAll(async () => {
    const orders = await prisma.customerOrder.findMany({
      where: { externalOrderNo },
      select: { id: true },
    });
    const orderIds = orders.map((order) => order.id);
    const lines = orderIds.length
      ? await prisma.orderLine.findMany({
          where: { orderId: { in: orderIds } },
          select: { id: true },
        })
      : [];
    const lineIds = lines.map((line) => line.id);
    if (lineIds.length > 0) {
      await prisma.orderAllocation.deleteMany({
        where: { orderLineId: { in: lineIds } },
      });
      await prisma.orderLine.deleteMany({ where: { id: { in: lineIds } } });
      await prisma.stockLedger.deleteMany({
        where: { refType: "ORDER_LINE", refId: { in: lineIds } },
      });
    }
    if (orderIds.length > 0) {
      await prisma.customerOrder.deleteMany({ where: { id: { in: orderIds } } });
      await prisma.task.deleteMany({
        where: { refType: "CUSTOMER_ORDER", refId: { in: orderIds } },
      });
    }
    await prisma.listing.deleteMany({ where: { id: listingId } });
    await prisma.stockLedger.deleteMany({ where: { refType: "E2E", refId: sourceId } });
    await prisma.inventoryLot.deleteMany({ where: { id: lotId } });
    if (createdPlatformId) {
      await prisma.platform.deleteMany({ where: { id: createdPlatformId } });
    }
    await prisma.sKU.deleteMany({ where: { id: skuId } });
  });

  test("opens an in-page delist confirmation instead of a browser dialog", async ({ page }) => {
    const dialogMessages: string[] = [];
    page.on("dialog", async (dialog) => {
      dialogMessages.push(dialog.message());
      await dialog.dismiss();
    });

    await page.goto(`/listing?q=${encodeURIComponent(skuCode)}`);
    await expect(page.getByRole("heading", { name: "Listing 分类" })).toBeVisible();

    const row = page.getByRole("row").filter({ hasText: skuCode });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "下架" }).click();

    expect(dialogMessages).toEqual([]);
    await expect(page.getByRole("heading", { name: "确认下架 Listing" })).toBeVisible();
    await page.getByRole("button", { name: "取消" }).click();
  });

  test("sells an active listing, ships the generated order, and keeps profit data visible", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(`/listing?q=${encodeURIComponent(skuCode)}`);
    await expect(page.getByRole("heading", { name: "Listing 分类" })).toBeVisible();

    const row = page.getByRole("row").filter({ hasText: skuCode });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "登记售出" }).click();

    await expect(page.getByRole("heading", { name: "登记售出" })).toBeVisible();
    await page.getByLabel("数量").fill("1");
    await page.getByLabel(/最终售出单价/).fill("180");
    await page.getByLabel("平台费率").selectOption("0.1");
    await page.getByLabel(/邮费成本/).fill("12");
    const shipFromLocation = page.getByLabel("发货方 / 发货仓");
    if (await shipFromLocation.isEnabled()) {
      await shipFromLocation.selectOption(locationId);
    } else {
      await expect(shipFromLocation).toHaveValue(locationId);
    }
    await page.getByLabel("客户名称").fill("E2E Buyer");
    await page.getByLabel("平台订单号").fill(externalOrderNo);
    await page.getByRole("button", { name: "确认登记" }).click();

    await expect(page).toHaveURL(/\/sales\/[^/]+$/);
    await expect(page.getByRole("heading", { name: /订单:/ })).toBeVisible();
    await expect(page.getByText("已成交 · 待发货", { exact: true })).toBeVisible();
    await expect(page.getByText("净利润")).toBeVisible();
    await expect(page.getByText("CNY 50.00")).toBeVisible();

    await page.getByRole("button", { name: "确认已发货" }).click();
    await expect(page.getByRole("heading", { name: "确认已发货" })).toBeVisible();
    await page.getByLabel("物流单号（选填）").fill(`TRK_${runId}`);
    await page.getByRole("button", { name: "确认发货" }).click();

    await expect(page.getByText("已发货", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(`物流单号：TRK_${runId}`, { exact: false })).toBeVisible();

    await page.goto("/reports?range=custom&from=2020-01-01&to=2030-12-31");
    await expect(page.getByRole("heading", { name: "报表分析" })).toBeVisible();
    await expect(page.getByText("业务概览")).toBeVisible();
    await expect(page.getByText("月度收支概览")).toBeVisible();

    const order = await prisma.customerOrder.findFirstOrThrow({
      where: { externalOrderNo },
      include: { lines: { include: { allocations: true } } },
    });
    expect(order.orderStatus).toBe("SHIPPED");
    expect(order.netRevenue?.toString()).toBe("150");
    expect(order.lines[0].allocations[0].status).toBe("SHIPPED");
    expect(order.lines[0].allocations[0].costAmount.toString()).toBe("100");

    await expectLotQuantity(lotId, "1");

    expect(
      errors.filter((line) =>
        /Runtime Error|Application error|Internal Server Error|Prisma|Unhandled/i.test(line)
      )
    ).toEqual([]);
  });
});

async function expectLotQuantity(lotId: string, expected: string) {
  const ledgers = await prisma.stockLedger.findMany({
    where: { entityType: "LOT", entityId: lotId },
    select: { deltaQty: true },
  });
  const quantity = ledgers.reduce(
    (sum, ledger) => sum.plus(new Decimal(ledger.deltaQty.toString())),
    new Decimal(0)
  );
  expect(quantity.toString()).toBe(expected);
}
