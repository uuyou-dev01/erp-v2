import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";

const runId = `flow_continuity_${Date.now()}`;
const supplierName = `E2E 无单号流转 ${runId}`;
let targetId: string;
let sourceId: string;
let otherId: string;
let skuId: string;

test.beforeAll(async () => {
  const sku = await prisma.sKU.create({
    data: { storeId: "store_1", code: runId, name: "工作台连续流转商品", catalogRole: "SIMPLE" },
  });
  skuId = sku.id;
  sourceId = (
    await prisma.location.create({
      data: {
        storeId: "store_1",
        name: "连续流转收货仓",
        code: `${runId}_source`,
        type: "WAREHOUSE",
        isSellableDefault: true,
      },
    })
  ).id;
  otherId = (
    await prisma.location.create({
      data: {
        storeId: "store_1",
        name: "连续流转另一个仓",
        code: `${runId}_other`,
        type: "WAREHOUSE",
        isSellableDefault: true,
      },
    })
  ).id;
  const oldIds = Array.from({ length: 130 }, (_, index) => `${runId}_${index}`);
  await prisma.purchaseOrder.createMany({
    data: oldIds.map((id) => ({
      id,
      storeId: "store_1",
      orderNo: id,
      status: "ORDERED",
      currency: "CNY",
      subtotal: "10",
      totalAmount: "10",
      updatedAt: new Date("2025-01-01"),
    })),
  });
  await prisma.purchaseLine.createMany({
    data: oldIds.map((id) => ({
      purchaseOrderId: id,
      skuId,
      quantity: "1",
      unitPrice: "10",
      lineAmount: "10",
    })),
  });
  targetId = (
    await prisma.purchaseOrder.create({
      data: {
        storeId: "store_1",
        orderNo: `${runId}_target`,
        supplierName,
        currency: "CNY",
        status: "ORDERED",
        subtotal: "20",
        totalAmount: "20",
        lines: { create: { skuId, quantity: "2", unitPrice: "10", lineAmount: "20" } },
      },
    })
  ).id;
});

test("blank tracking needs explicit shipping intent and stays visible through arrival and inbound", async ({
  page,
}) => {
  await page.goto("/workbench?queue=missingLogistics");
  const row = () => page.locator('[role="button"]').filter({ hasText: supplierName }).first();
  await expect(row()).toBeVisible();
  await row().getByRole("checkbox").check();
  await page.locator("#bulk-destination-location").selectOption(sourceId);
  const ship = page.getByRole("button", { name: "批量补物流", exact: true });
  await expect(ship).toBeDisabled();
  await page.getByLabel("暂无单号，确认已发货", { exact: true }).check();
  await expect(ship).toBeEnabled();
  await ship.click();
  await expect(page).toHaveURL(/queue=pendingArrival/);
  await expect(row()).toBeVisible();
  await expect(row()).toContainText("运单待补");
  await page.reload();
  await expect(row()).toBeVisible();
  expect(
    (await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: targetId } })).trackingNo
  ).toBeNull();

  await row().getByRole("checkbox").check();
  await expect(page.getByRole("button", { name: "批量确认到货", exact: true })).toBeDisabled();
  await page.locator("#bulk-arrival-mode").selectOption("expected");
  await page.getByRole("button", { name: "批量确认到货", exact: true }).click();
  await expect(page).toHaveURL(/queue=pendingDisposition/);
  await expect(row()).toBeVisible();
  const line = await prisma.purchaseLine.findFirstOrThrow({ where: { purchaseOrderId: targetId } });
  expect(await prisma.inventoryLot.count({ where: { sourceId: line.id } })).toBe(0);

  await row().getByRole("checkbox").check();
  await expect(page.getByText("按各单已确认的收货位置入库")).toBeVisible();
  await expect(page.locator("#bulk-destination-location")).toHaveCount(0);
  await page.getByRole("button", { name: "批量确认入库", exact: true }).click();
  await expect(row()).toHaveCount(0);
  const lot = await prisma.inventoryLot.findFirstOrThrow({
    where: { sourceType: "PURCHASE", sourceId: line.id },
  });
  expect(lot.locationId).toBe(sourceId);
  const ledger = await prisma.stockLedger.findMany({
    where: { refType: "PURCHASE_LINE", refId: line.id },
  });
  expect(ledger).toHaveLength(1);
  expect(ledger[0].deltaQty.toString()).toBe("2");
});

test("batch arrival can choose the actual warehouse instead of the expected one", async ({ page }) => {
  const supplier = `E2E 实际到货位置 ${runId}`;
  const order = await prisma.purchaseOrder.create({
    data: {
      storeId: "store_1",
      orderNo: `${runId}_actual`,
      supplierName: supplier,
      currency: "CNY",
      status: "SHIPPED",
      destinationLocationId: sourceId,
      subtotal: "10",
      totalAmount: "10",
      lines: { create: { skuId, quantity: "1", unitPrice: "10", lineAmount: "10" } },
    },
  });
  await page.goto("/workbench?queue=pendingArrival");
  const row = () => page.locator('[role="button"]').filter({ hasText: supplier }).first();
  await row().getByRole("checkbox").check();
  await page.locator("#bulk-arrival-mode").selectOption("actual");
  await page.locator("#bulk-actual-arrival-location").selectOption(otherId);
  await page.getByRole("button", { name: "批量确认到货", exact: true }).click();
  await expect(page).toHaveURL(/queue=pendingDisposition/);
  await expect(page.getByText("按各单已确认的收货位置入库")).toHaveCount(0);
  await row().getByRole("checkbox").check();
  await expect(page.getByText("连续流转另一个仓 · " + `${runId}_other`)).toBeVisible();
  await page.getByRole("button", { name: "批量确认入库", exact: true }).click();
  await expect(row()).toHaveCount(0);
  const line = await prisma.purchaseLine.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
  expect(
    await prisma.inventoryLot.findFirstOrThrow({
      where: { sourceType: "PURCHASE", sourceId: line.id },
    })
  ).toMatchObject({ locationId: otherId });
});

test("single arrival preselects the exact location ID when warehouse names repeat", async ({ page }) => {
  const duplicate = await prisma.location.create({
    data: {
      storeId: "store_1",
      name: "连续流转收货仓",
      code: `${runId}_same_name`,
      type: "WAREHOUSE",
    },
  });
  const supplier = `E2E 同名位置 ${runId}`;
  await prisma.purchaseOrder.create({
    data: {
      storeId: "store_1",
      orderNo: `${runId}_same_name`,
      supplierName: supplier,
      currency: "CNY",
      status: "SHIPPED",
      destinationLocationId: duplicate.id,
      subtotal: "10",
      totalAmount: "10",
      lines: { create: { skuId, quantity: "1", unitPrice: "10", lineAmount: "10" } },
    },
  });
  await page.goto("/workbench?queue=pendingArrival");
  await page.locator('[role="button"]').filter({ hasText: supplier }).first().click();
  await expect(page.locator("#arrivalLocationId")).toHaveValue(duplicate.id);
  await expect(page.getByText(`预计到货位置：连续流转收货仓 · ${runId}_same_name`, { exact: false })).toBeVisible();
});

test("single disposition shows the recorded warehouse and reserves other destinations for transfer", async ({
  page,
}) => {
  const singleSupplier = `E2E 单单分流 ${runId}`;
  await prisma.purchaseOrder.create({
    data: {
      storeId: "store_1",
      orderNo: `${runId}_single`,
      supplierName: singleSupplier,
      currency: "CNY",
      status: "RECEIVED",
      destinationLocationId: sourceId,
      receivedAt: new Date(),
      subtotal: "10",
      totalAmount: "10",
      lines: { create: { skuId, quantity: "1", unitPrice: "10", lineAmount: "10" } },
    },
  });
  await page.goto("/workbench?queue=pendingDisposition");
  await page.locator('[role="button"]').filter({ hasText: singleSupplier }).first().click();
  await expect(page.getByText("在已确认的收货位置入库")).toBeVisible();
  await expect(page.locator("#dispositionInboundLocationId")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/workbench-disposition-current-location.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: "立即发起转仓", exact: true }).click();
  await expect(page.getByRole("button", { name: "整单确认发出并进入在途" })).toBeVisible();
  expect(otherId).toBeTruthy();
});
