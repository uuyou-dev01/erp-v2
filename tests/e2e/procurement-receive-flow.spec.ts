import { expect, test } from "@playwright/test";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";

const STORE_ID = "store_1";

test.describe("procurement create and receive flow", () => {
  const runId = `e2e_po_${Date.now()}`;
  const orderNo = `PO_${runId}`;
  const duplicateOrderNo = `PO_DUP_${runId}`;
  const invalidReceiveOrderNo = `PO_RECV_INVALID_${runId}`;
  const skuCode = `SKU_${runId}`.toUpperCase();
  const duplicateSkuCode = `SKU_DUP_${runId}`.toUpperCase();
  const invalidReceiveSkuCode = `SKU_RECV_INVALID_${runId}`.toUpperCase();
  const supplierName = `Supplier ${runId}`;

  let locationId = "";
  let createdLocationId = "";
  let purchaseOrderId = "";
  let skuId = "";
  let duplicateSkuId = "";
  let invalidReceiveSkuId = "";
  let duplicateOrderId = "";
  let invalidReceiveOrderId = "";
  let supplierId = "";

  test.beforeAll(async () => {
    let location = await prisma.location.findFirst({
      where: { storeId: STORE_ID, isSellableDefault: true },
      orderBy: { createdAt: "asc" },
    });

    if (!location) {
      location = await prisma.location.create({
        data: {
          storeId: STORE_ID,
          code: `WH_${runId}`,
          name: "E2E 采购收货仓",
          type: "WAREHOUSE",
          region: "CN_SHANGHAI",
        },
      });
      createdLocationId = location.id;
    }

    locationId = location.id;

    const supplier = await prisma.partner.create({
      data: {
        storeId: STORE_ID,
        code: `SUPPLIER_${runId}`.toUpperCase(),
        name: supplierName,
        type: "SUPPLIER",
        status: "ACTIVE",
        defaultCurrency: "CNY",
      },
    });
    supplierId = supplier.id;

    const duplicateSku = await prisma.sKU.create({
      data: {
        storeId: STORE_ID,
        code: duplicateSkuCode,
        name: "E2E 重复采购单校验商品",
      },
    });
    duplicateSkuId = duplicateSku.id;

    const duplicateOrder = await prisma.purchaseOrder.create({
      data: {
        storeId: STORE_ID,
        orderNo: duplicateOrderNo,
        supplierId,
        supplierName,
        currency: "CNY",
        subtotal: "0",
        totalAmount: "0",
        status: "DRAFT",
      },
    });
    duplicateOrderId = duplicateOrder.id;

    const invalidReceiveSku = await prisma.sKU.create({
      data: {
        storeId: STORE_ID,
        code: invalidReceiveSkuCode,
        name: "E2E 收货错误校验商品",
      },
    });
    invalidReceiveSkuId = invalidReceiveSku.id;

    const invalidReceiveOrder = await prisma.purchaseOrder.create({
      data: {
        storeId: STORE_ID,
        orderNo: invalidReceiveOrderNo,
        supplierId,
        supplierName,
        currency: "CNY",
        subtotal: "100",
        totalAmount: "100",
        status: "ORDERED",
        destinationLocationId: locationId,
        lines: {
          create: {
            skuId: invalidReceiveSku.id,
            quantity: "1",
            unitPrice: "100",
            lineAmount: "100",
          },
        },
      },
    });
    invalidReceiveOrderId = invalidReceiveOrder.id;
  });

  test.afterAll(async () => {
    const order = await prisma.purchaseOrder.findFirst({
      where: { storeId: STORE_ID, orderNo },
      include: { lines: { select: { id: true, skuId: true } } },
    });
    const lineIds = order?.lines.map((line) => line.id) ?? [];
    const skuIds = order?.lines.map((line) => line.skuId) ?? [];

    if (lineIds.length > 0) {
      const lots = await prisma.inventoryLot.findMany({
        where: { sourceType: "PURCHASE", sourceId: { in: lineIds } },
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

    if (order) {
      await prisma.purchaseOrder.delete({ where: { id: order.id } });
    }
    if (duplicateOrderId) {
      await prisma.purchaseOrder.deleteMany({ where: { id: duplicateOrderId } });
    }
    if (invalidReceiveOrderId) {
      await prisma.purchaseOrder.deleteMany({ where: { id: invalidReceiveOrderId } });
    }

    const cleanupSkuIds = Array.from(
      new Set([skuId, duplicateSkuId, invalidReceiveSkuId, ...skuIds].filter(Boolean))
    );
    if (cleanupSkuIds.length > 0) {
      await prisma.sKU.deleteMany({ where: { id: { in: cleanupSkuIds } } });
    } else {
      await prisma.sKU.deleteMany({
        where: { storeId: STORE_ID, code: skuCode },
      });
    }

    if (createdLocationId) {
      await prisma.location.deleteMany({ where: { id: createdLocationId } });
    }
    if (supplierId) {
      await prisma.partner.deleteMany({ where: { id: supplierId } });
    }
  });

  test("creates a purchase order through the wizard and receives stock through the form", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/procurement/new");
    await expect(page.getByRole("heading", { name: "新建采购订单" })).toBeVisible();

    await page.getByLabel(/采购单号/).fill(orderNo);
    await page.getByLabel(/供应商（合作方）/).selectOption(supplierId);
    await page.getByLabel("目的地仓库").selectOption(locationId);
    await page.getByRole("button", { name: /下一步/ }).click();

    await expect(page.getByRole("heading", { name: "采购商品" })).toBeVisible();
    await page.getByRole("button", { name: /新建SKU/ }).click();
    await expect(page.getByRole("heading", { name: /快速新建\s*SKU/ })).toBeVisible();
    await page.getByLabel("系统 SKU 编码").fill(skuCode);
    await page.getByLabel(/商品名称/).fill("E2E 采购收货商品");
    await page.getByRole("button", { name: "创建并选中" }).click();

    await expect(page.getByText(`已选择：${skuCode}`)).toBeVisible();
    await page.getByPlaceholder("100").fill("2");
    await page.getByPlaceholder("99.99").fill("100");
    await page.getByRole("button", { name: /^添加$/ }).click();

    await expect(page.getByRole("cell", { name: skuCode })).toBeVisible();
    await page.getByRole("button", { name: /下一步/ }).click();
    await expect(page.getByRole("heading", { name: "订单信息预览" })).toBeVisible();
    await page.getByRole("button", { name: /确认提交/ }).click();

    await expect(page).toHaveURL(/\/procurement\/[^/]+$/);
    await expect(page.getByRole("heading", { name: new RegExp(orderNo) })).toBeVisible();
    await expect(page.getByText("草稿", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "标记为已下单" }).click();
    await expect(page.getByText("已下单", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "收货" })).toBeVisible();

    await page.getByLabel(/目的地仓库/).selectOption(locationId);
    await page.getByRole("button", { name: "确认收货并创建库存" }).click();

    await expect(page).toHaveURL(/\/procurement(?:\?.*)?$/);
    await expect(page.getByRole("heading", { name: "采购管理" })).toBeVisible();

    const order = await prisma.purchaseOrder.findFirstOrThrow({
      where: { storeId: STORE_ID, orderNo },
      include: { lines: true },
    });
    purchaseOrderId = order.id;
    skuId = order.lines[0].skuId;
    expect(order.status).toBe("RECEIVED");
    expect(order.receivedAt).toBeTruthy();
    expect(order.destinationLocationId).toBe(locationId);
    expect(order.lines[0].quantity.toString()).toBe("2");
    expect(order.lines[0].unitPrice.toString()).toBe("100");

    const lot = await prisma.inventoryLot.findFirstOrThrow({
      where: {
        storeId: STORE_ID,
        skuId,
        sourceType: "PURCHASE",
        sourceId: order.lines[0].id,
      },
    });
    expect(lot.locationId).toBe(locationId);
    expect(lot.unitCost.toString()).toBe("100");
    await expectLotQuantity(lot.id, "2");

    expect(
      errors.filter((line) =>
        /Runtime Error|Application error|Internal Server Error|Prisma|Unhandled/i.test(line)
      )
    ).toEqual([]);
  });

  test("shows an inline duplicate-order error in the purchase wizard instead of a browser alert", async ({
    page,
  }) => {
    const dialogMessages: string[] = [];
    page.on("dialog", async (dialog) => {
      dialogMessages.push(dialog.message());
      await dialog.dismiss();
    });

    await page.goto("/procurement/new");
    await expect(page.getByRole("heading", { name: "新建采购订单" })).toBeVisible();

    await page.getByLabel(/采购单号/).fill(duplicateOrderNo);
    await page.getByRole("button", { name: /下一步/ }).click();

    await expect(page.getByRole("heading", { name: "采购商品" })).toBeVisible();
    await page.getByPlaceholder("输入SKU代码或商品名称搜索").fill(duplicateSkuCode);
    await page.getByRole("button", { name: new RegExp(duplicateSkuCode) }).click();
    await page.getByPlaceholder("100").fill("1");
    await page.getByPlaceholder("99.99").fill("100");
    await page.getByRole("button", { name: /^添加$/ }).click();

    await page.getByRole("button", { name: /下一步/ }).click();
    await expect(page.getByRole("heading", { name: "订单信息预览" })).toBeVisible();
    await page.getByRole("button", { name: /确认提交/ }).click();

    await expect(page.getByRole("alert").filter({ hasText: "采购单号已存在" })).toBeVisible();
    expect(dialogMessages).toEqual([]);
    await expect(page).toHaveURL(/\/procurement\/new/);
  });

  test("shows an inline duplicate-SKU error in the purchase wizard quick-create dialog", async ({
    page,
  }) => {
    const dialogMessages: string[] = [];
    page.on("dialog", async (dialog) => {
      dialogMessages.push(dialog.message());
      await dialog.dismiss();
    });

    await page.goto("/procurement/new");
    await expect(page.getByRole("heading", { name: "新建采购订单" })).toBeVisible();
    await page.getByRole("button", { name: /下一步/ }).click();

    await expect(page.getByRole("heading", { name: "采购商品" })).toBeVisible();
    await page.getByRole("button", { name: /新建SKU/ }).click();
    const quickCreateDialog = page.locator(".fixed.inset-0").filter({
      has: page.getByRole("heading", { name: /快速新建\s*SKU/ }),
    });
    await quickCreateDialog.getByLabel("系统 SKU 编码").fill(duplicateSkuCode);
    await quickCreateDialog.getByLabel(/商品名称/).fill("E2E 重复 SKU 名称");
    await quickCreateDialog.getByRole("button", { name: "创建并选中" }).click();

    await expect(
      quickCreateDialog.getByRole("alert").filter({ hasText: "SKU代码已存在" })
    ).toBeVisible();
    expect(dialogMessages).toEqual([]);
    await expect(quickCreateDialog.getByRole("heading", { name: /快速新建\s*SKU/ })).toBeVisible();
  });

  test("shows an inline quick-receive server error instead of an alert", async ({ page }) => {
    const unexpectedDialogs: string[] = [];
    page.on("dialog", async (dialog) => {
      unexpectedDialogs.push(dialog.message());
      await dialog.dismiss();
    });

    await page.goto(`/procurement/${invalidReceiveOrderId}`);
    await expect(
      page.getByRole("heading", { name: new RegExp(invalidReceiveOrderNo) })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "收货" })).toBeVisible();

    await prisma.purchaseOrder.update({
      where: { id: invalidReceiveOrderId },
      data: { status: "DRAFT" },
    });

    await page.getByRole("button", { name: "一键收货" }).click();
    await expect(page.getByRole("heading", { name: "确认一键收货" })).toBeVisible();
    await page.getByRole("button", { name: "确认收货", exact: true }).click();

    await expect(
      page.getByRole("alert").filter({ hasText: "只有已下单、在途或已到货待分流的采购单可以入库" })
    ).toBeVisible();
    expect(unexpectedDialogs).toEqual([]);
    await expect(page).toHaveURL(new RegExp(`/procurement/${invalidReceiveOrderId}`));
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
