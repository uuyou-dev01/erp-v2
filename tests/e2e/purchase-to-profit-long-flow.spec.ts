import { expect, test } from "@playwright/test";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";

const STORE_ID = "store_1";

test.describe("browser purchase to profit flow", () => {
  const runId = `e2e_long_${Date.now()}`;
  const orderNo = `PO_${runId}`;
  const skuCode = `SKU_${runId}`.toUpperCase();
  const externalOrderNo = `SO_${runId}`;
  const supplierName = `Supplier ${runId}`;
  const productName = `E2E 长链商品 ${runId}`;

  let locationId = "";
  let createdLocationId = "";
  let purchaseOrderId = "";
  let skuId = "";
  let listingId = "";
  let customerOrderId = "";

  test.beforeAll(async () => {
    let location = await prisma.location.findFirst({
      where: {
        storeId: STORE_ID,
        isSellableDefault: true,
        region: { startsWith: "CN" },
      },
      orderBy: { createdAt: "asc" },
    });

    if (!location) {
      location = await prisma.location.create({
        data: {
          storeId: STORE_ID,
          code: `WH_${runId}`,
          name: "E2E 长链仓",
          type: "WAREHOUSE",
          region: "CN_SHANGHAI",
        },
      });
      createdLocationId = location.id;
    }

    locationId = location.id;
  });

  test.afterAll(async () => {
    const orders = await prisma.customerOrder.findMany({
      where: { externalOrderNo },
      include: { lines: { select: { id: true } } },
    });
    const customerOrderIds = orders.map((order) => order.id);
    const orderLineIds = orders.flatMap((order) => order.lines.map((line) => line.id));

    if (orderLineIds.length > 0) {
      await prisma.orderAllocation.deleteMany({
        where: { orderLineId: { in: orderLineIds } },
      });
      await prisma.stockLedger.deleteMany({
        where: { refType: "ORDER_LINE", refId: { in: orderLineIds } },
      });
      await prisma.orderLine.deleteMany({ where: { id: { in: orderLineIds } } });
    }
    if (customerOrderIds.length > 0) {
      await prisma.task.deleteMany({
        where: { refType: "CUSTOMER_ORDER", refId: { in: customerOrderIds } },
      });
      await prisma.customerOrder.deleteMany({
        where: { id: { in: customerOrderIds } },
      });
    }

    await prisma.listing.deleteMany({
      where: {
        OR: [
          { id: listingId || "__missing__" },
          { sku: { storeId: STORE_ID, code: skuCode } },
        ],
      },
    });

    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { storeId: STORE_ID, orderNo },
      include: { lines: { select: { id: true, skuId: true } } },
    });
    const purchaseLineIds = purchaseOrder?.lines.map((line) => line.id) ?? [];
    const purchaseSkuIds = purchaseOrder?.lines.map((line) => line.skuId) ?? [];

    if (purchaseLineIds.length > 0) {
      const lots = await prisma.inventoryLot.findMany({
        where: { sourceType: "PURCHASE", sourceId: { in: purchaseLineIds } },
        select: { id: true },
      });
      const lotIds = lots.map((lot) => lot.id);
      if (lotIds.length > 0) {
        await prisma.stockLedger.deleteMany({
          where: { entityType: "LOT", entityId: { in: lotIds } },
        });
        await prisma.inventoryLot.deleteMany({ where: { id: { in: lotIds } } });
      }
    }

    if (purchaseOrder) {
      await prisma.purchaseOrder.delete({ where: { id: purchaseOrder.id } });
    }

    const cleanupSkuIds = Array.from(new Set([skuId, ...purchaseSkuIds].filter(Boolean)));
    if (cleanupSkuIds.length > 0) {
      await prisma.sKU.deleteMany({ where: { id: { in: cleanupSkuIds } } });
    } else {
      await prisma.sKU.deleteMany({ where: { storeId: STORE_ID, code: skuCode } });
    }

    if (createdLocationId) {
      await prisma.location.deleteMany({ where: { id: createdLocationId } });
    }
  });

  test("creates purchase stock, lists it, sells it, ships it, and reports profit", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await createAndReceivePurchase(page);
    await createListingFromSellableInventory(page);
    await sellListingAndShipOrder(page);

    await page.goto("/reports?range=custom&from=2020-01-01&to=2030-12-31");
    await expect(page.getByRole("heading", { name: "报表分析" })).toBeVisible();
    await expect(page.getByText("业务概览")).toBeVisible();
    await expect(page.getByText("月度收支概览")).toBeVisible();

    const customerOrder = await prisma.customerOrder.findFirstOrThrow({
      where: { externalOrderNo },
      include: { lines: { include: { allocations: true } } },
    });
    customerOrderId = customerOrder.id;
    expect(customerOrder.orderStatus).toBe("SHIPPED");
    expect(customerOrder.subtotal.toString()).toBe("180");
    expect(customerOrder.platformFee.toString()).toBe("18");
    expect(customerOrder.shippingFee.toString()).toBe("12");
    expect(customerOrder.netRevenue?.toString()).toBe("150");
    expect(customerOrder.lines[0].allocations[0].costAmount.toString()).toBe("100");

    const lot = await prisma.inventoryLot.findFirstOrThrow({
      where: { storeId: STORE_ID, skuId },
    });
    await expectLotQuantity(lot.id, "1");

    expect(
      errors.filter((line) =>
        /Runtime Error|Application error|Internal Server Error|Prisma|Unhandled/i.test(line),
      ),
    ).toEqual([]);
  });

  async function createAndReceivePurchase(page: import("@playwright/test").Page) {
    await page.goto("/procurement/new");
    await expect(page.getByRole("heading", { name: "新建采购订单" })).toBeVisible();

    await page.getByLabel(/采购单号/).fill(orderNo);
    await page.getByLabel(/供应商/).fill(supplierName);
    await page.getByLabel("目的地仓库").selectOption(locationId);
    await page.getByRole("button", { name: /下一步/ }).click();

    await expect(page.getByRole("heading", { name: "采购商品" })).toBeVisible();
    await page.getByRole("button", { name: /新建SKU/ }).click();
    await page.getByLabel("系统 SKU 编码").fill(skuCode);
    await page.getByLabel(/商品名称/).fill(productName);
    await page.getByRole("button", { name: "创建并选中" }).click();

    await expect(page.getByText(`已选择：${skuCode}`)).toBeVisible();
    await page.getByPlaceholder("100").fill("2");
    await page.getByPlaceholder("99.99").fill("100");
    await page.getByRole("button", { name: /^添加$/ }).click();
    await expect(page.getByRole("cell", { name: skuCode })).toBeVisible();

    await page.getByRole("button", { name: /下一步/ }).click();
    await page.getByRole("button", { name: /确认提交/ }).click();

    await expect(page).toHaveURL(/\/procurement\/[^/]+$/);
    await expect(page.getByRole("heading", { name: new RegExp(orderNo) })).toBeVisible();
    await page.getByRole("button", { name: "标记为已下单" }).click();
    await expect(page.getByText("已下单", { exact: true })).toBeVisible();

    await page.getByLabel(/目的地仓库/).selectOption(locationId);
    await page.getByRole("button", { name: "确认收货并创建库存" }).click();
    await expect(page.getByRole("heading", { name: "采购管理" })).toBeVisible();

    const purchaseOrder = await prisma.purchaseOrder.findFirstOrThrow({
      where: { storeId: STORE_ID, orderNo },
      include: { lines: true },
    });
    purchaseOrderId = purchaseOrder.id;
    skuId = purchaseOrder.lines[0].skuId;
    expect(purchaseOrder.status).toBe("RECEIVED");
  }

  async function createListingFromSellableInventory(page: import("@playwright/test").Page) {
    await page.goto(
      `/inventory/sellable?unlisted=1&q=${encodeURIComponent(productName)}`,
    );
    await expect(page.getByRole("heading", { name: "库存看板" })).toBeVisible();

    const card = page.locator("article").filter({ hasText: productName });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "首上架" }).click();

    await expect(page.getByText("添加上架记录").last()).toBeVisible();
    await page.getByLabel("挂牌价").fill("180");
    await page.getByLabel("币种").selectOption("CNY");
    await page.getByRole("button", { name: "确认添加" }).click();

    await expect
      .poll(
        async () =>
          Boolean(
            await prisma.listing.findFirst({
              where: { storeId: STORE_ID, skuId, status: "ACTIVE" },
            }),
          ),
        { timeout: 10_000 },
      )
      .toBe(true);
    const listing = await prisma.listing.findFirstOrThrow({
      where: { storeId: STORE_ID, skuId, status: "ACTIVE" },
    });
    listingId = listing.id;

    await page.goto(`/listing?q=${encodeURIComponent(productName)}`);
    const listedRow = page.getByRole("row").filter({ hasText: productName });
    await expect(listedRow.getByText("在售中")).toBeVisible();
  }

  async function sellListingAndShipOrder(page: import("@playwright/test").Page) {
    const listedRow = page.getByRole("row").filter({ hasText: productName });
    await listedRow.getByRole("button", { name: "登记售出" }).click();

    await expect(page.getByRole("heading", { name: "登记售出" })).toBeVisible();
    await page.getByLabel("数量").fill("1");
    await page.getByLabel(/最终售出单价/).fill("180");
    await page.getByLabel("平台费率").selectOption("0.1");
    await page.getByLabel(/邮费成本/).fill("12");
    await page.getByLabel("发货方 / 发货仓").selectOption(locationId);
    await page.getByLabel("客户名称").fill("E2E Long Buyer");
    await page.getByLabel("平台订单号").fill(externalOrderNo);
    await page.getByRole("button", { name: "确认登记" }).click();

    await expect(page).toHaveURL(/\/sales\/[^/]+$/);
    await expect(page.getByText("已确认", { exact: true })).toBeVisible();
    await expect(page.getByText("CNY 50.00")).toBeVisible();

    await page.getByRole("button", { name: "确认已发货" }).click();
    await page.getByLabel("物流单号（选填）").fill(`TRK_${runId}`);
    await page.getByRole("button", { name: "确认发货" }).click();

    await expect(page.getByText("已发货", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(`物流单号：TRK_${runId}`, { exact: false })).toBeVisible();
  }
});

async function expectLotQuantity(lotId: string, expected: string) {
  const ledgers = await prisma.stockLedger.findMany({
    where: { entityType: "LOT", entityId: lotId },
    select: { deltaQty: true },
  });
  const quantity = ledgers.reduce(
    (sum, ledger) => sum.plus(new Decimal(ledger.deltaQty.toString())),
    new Decimal(0),
  );
  expect(quantity.toString()).toBe(expected);
}
