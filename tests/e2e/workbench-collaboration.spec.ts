import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";

const STORE_ID = "store_1";

test("collaboration surfaces render without app errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "选择操作人" })).toBeVisible();

  await page.goto("/workbench");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();
  const sidebar = page.getByRole("complementary");
  await expect(sidebar.getByRole("link", { name: "通知" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "采购单据" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "集运物流" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "库存看板" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "销售订单" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "销售平台" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "仓库位置" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "团队工作量" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "团队成员" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "店铺管理" })).toBeVisible();

  await page.goto("/notifications");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByRole("heading", { name: "通知" })).toBeVisible();

  await page.goto("/reports/team");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByRole("heading", { name: "团队工作量" })).toBeVisible();

  await page.goto("/settings/team");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByRole("heading", { name: "团队成员" })).toBeVisible();

  await page.goto("/settings/stores");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByRole("heading", { name: "店铺管理" })).toBeVisible();

  expect(
    errors.filter((line) =>
      /Runtime Error|Application error|Internal Server Error|Prisma|Unhandled/i.test(line)
    )
  ).toEqual([]);
});

test.describe("workbench purchase cancellation", () => {
  const runId = `e2e_cancel_po_${Date.now()}`;
  const orderNo = `PO_CANCEL_${runId}`;
  const skuCode = `SKU_CANCEL_${runId}`.toUpperCase();
  const supplierName = `E2E 取消采购 ${runId}`;
  let purchaseOrderId = "";
  let skuId = "";

  test.beforeAll(async () => {
    const sku = await prisma.sKU.create({
      data: {
        storeId: STORE_ID,
        code: skuCode,
        name: "E2E 工作台取消采购商品",
      },
    });
    skuId = sku.id;

    const order = await prisma.purchaseOrder.create({
      data: {
        storeId: STORE_ID,
        orderNo,
        supplierName,
        currency: "CNY",
        subtotal: "100",
        totalAmount: "100",
        status: "ORDERED",
        lines: {
          create: {
            skuId,
            quantity: "1",
            unitPrice: "100",
            lineAmount: "100",
          },
        },
      },
    });
    purchaseOrderId = order.id;
  });

  test.afterAll(async () => {
    if (purchaseOrderId) {
      await prisma.purchaseOrder.deleteMany({ where: { id: purchaseOrderId } });
    }
    if (skuId) {
      await prisma.sKU.deleteMany({ where: { id: skuId } });
    }
  });

  test("opens an in-page cancellation confirmation instead of a browser dialog", async ({
    page,
  }) => {
    const dialogMessages: string[] = [];
    page.on("dialog", async (dialog) => {
      dialogMessages.push(dialog.message());
      await dialog.dismiss();
    });

    await page.goto("/workbench?queue=missingLogistics");
    await expect(page.getByText(supplierName)).toBeVisible();

    const row = page.locator('[role="button"]').filter({ hasText: supplierName }).first();
    await row.locator("button", { hasText: "取消采购" }).click();

    await expect(page.getByRole("heading", { name: "确认取消采购单" })).toBeVisible();
    await expect(page.getByText(`确认取消采购单「${supplierName}`)).toBeVisible();
    expect(dialogMessages).toEqual([]);
  });
});
