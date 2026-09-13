import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";

const run = `warehouse_ui_${Date.now()}`;
const email = `${run}@example.invalid`,
  password = "warehouse-ui-test-password";
let batchId = "",
  locationId = "",
  destinationId = "",
  managerId = "",
  orderId = "",
  taskId = "",
  organizationId = "",
  storeId = "",
  ownerId = "",
  skuId = "";
const shots = "/tmp/erp-rc11-ui";
mkdirSync(shots, { recursive: true });

test.beforeAll(async () => {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: "e2e-owner@example.invalid" },
    include: { storeAccesses: true, memberships: true },
  });
  ownerId = owner.id;
  storeId = owner.storeAccesses[0].storeId;
  organizationId = owner.memberships[0].organizationId;
  const locations = await Promise.all(
    ["origin", "target"].map((code) =>
      prisma.location.create({
        data: { storeId, name: `UI ${code}`, code: `${run}_${code}`, type: "WAREHOUSE" },
      })
    )
  );
  [locationId, destinationId] = locations.map((l) => l.id);
  const sku = await prisma.sKU.create({
    data: {
      storeId,
      code: `${run}_${"X".repeat(140)}`,
      name: "POP MART 火影忍者 晓组织系列 · 小南 手机端商品名称换行验证",
    },
  });
  skuId = sku.id;
  const purchase = await prisma.purchaseOrder.create({
    data: {
      storeId,
      orderNo: run,
      subtotal: "25",
      totalAmount: "25",
      currency: "CNY",
      orderedAt: new Date("2026-08-12T03:00:00Z"),
      lines: { create: { skuId, quantity: "25", unitPrice: "1", lineAmount: "25" } },
    },
    include: { lines: true },
  });
  const lots = await Promise.all(
    Array.from({ length: 25 }, () =>
      prisma.inventoryLot.create({
        data: {
          storeId,
          locationId,
          skuId,
          sourceType: "PURCHASE",
          sourceId: purchase.lines[0].id,
          unitCost: "1",
          costCurrency: "CNY",
          receivedAt: new Date(),
        },
      })
    )
  );
  await prisma.stockLedger.createMany({
    data: lots.map((lot) => ({
      storeId,
      locationId,
      entityId: lot.id,
      entityType: "LOT",
      deltaQty: "1",
      reason: "INBOUND_PURCHASE",
      refType: "TEST",
      refId: run,
    })),
  });
  const batch = await prisma.consolidationBatch.create({
    data: {
      storeId,
      fromLocationId: locationId,
      toLocationId: destinationId,
      lines: {
        create: lots.map((lot) => ({ sourceType: "LOT", sourceId: lot.id, quantity: "1" })),
      },
    },
  });
  batchId = batch.id;
  const manager = await prisma.user.create({
    data: {
      email,
      name: "UI 仓库负责人",
      password: await hashPassword(password),
      emailVerifiedAt: new Date(),
      role: "USER",
    },
  });
  managerId = manager.id;
  await prisma.locationFulfiller.create({
    data: {
      organizationId,
      locationId,
      userId: managerId,
      email,
      role: "MANAGER",
      status: "ACTIVE",
      invitedById: ownerId,
    },
  });
  const order = await prisma.customerOrder.create({
    data: {
      storeId,
      orderNumber: run,
      orderStatus: "CONFIRMED",
      orderDate: new Date(),
      customerName: "UI customer",
      currency: "CNY",
      subtotal: "1",
      totalPaid: "1",
      lines: {
        create: {
          skuId,
          quantity: "1",
          lineAmount: "1",
          allocations: {
            create: {
              allocationType: "LOT",
              lotId: lots[0].id,
              quantity: "1",
              unitCost: "1",
              costAmount: "1",
              status: "PENDING",
            },
          },
        },
      },
    },
  });
  orderId = order.id;
  const task = await prisma.task.create({
    data: {
      organizationId,
      storeId,
      type: "SHIP_ORDER",
      status: "IN_PROGRESS",
      title: run,
      refType: "CUSTOMER_ORDER",
      refId: orderId,
      assignedToId: managerId,
      createdById: ownerId,
      fulfillmentLocationId: locationId,
    },
  });
  taskId = task.id;
});

test("consolidation form is modal and the goods list paginates without stretching the page", async ({
  page,
}) => {
  await page.goto("/logistics/consolidations");
  await expect(page.getByLabel("起运仓库", { exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "创建批次", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "新建集运批次" })).toBeVisible();
  await page.getByRole("button", { name: "关闭新建集运批次" }).click();
  await page.goto(`/logistics/consolidations/${batchId}`);
  const list = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "批次商品", exact: true }) });
  await expect(list.getByText(/购入时间：2026\/8\/12/)).toHaveCount(10);
  const pagination = page.getByRole("navigation", { name: "批次商品分页" });
  await pagination.getByRole("button", { name: "下一页" }).click();
  await pagination.getByRole("button", { name: "下一页" }).click();
  await expect(list.getByText(/购入时间：/)).toHaveCount(5);
  await expect(pagination).toContainText("第 3 / 3 页");
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 2)
  ).toBe(true);
  await page.screenshot({ path: `${shots}/consolidation-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
});

test("warehouse manager sees read-only stock and can photograph shared preparation without dispatching", async ({
  browser,
  page: ownerPage,
}) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("/login?next=%2Fcollaboration%2Finventory");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("heading", { name: "仓库库存", exact: true })).toBeVisible();
  await expect(page.getByText("在仓 25 件", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "调整库存", exact: true })).toHaveCount(0);
  await page.screenshot({ path: `${shots}/warehouse-mobile.png`, fullPage: true });
  await page.goto(`/collaboration/tasks?task=${taskId}`);
  await expect(page.getByRole("heading", { name: "发货前资料", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  const camera = page.getByLabel("拍摄发货前资料");
  await expect(camera).toHaveAttribute("capture", "environment");
  await camera.setInputFiles("public/uploads/1780277819644-5x8heb.JPG");
  await expect(page.getByText("发货前资料已保存并通知货主，订单仍为待发货。")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("img", { name: "发货前资料", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await page.screenshot({ path: `${shots}/preparation-mobile.png`, fullPage: true });
  const order = await prisma.customerOrder.findUniqueOrThrow({ where: { id: orderId } });
  expect(order.orderStatus).toBe("CONFIRMED");
  expect(order.shippedAt).toBeNull();
  await ownerPage.goto(`/sales/${orderId}`);
  await expect(ownerPage.getByRole("img", { name: "发货前资料", exact: true })).toBeVisible();
  const url = await ownerPage
    .getByRole("img", { name: "发货前资料", exact: true })
    .getAttribute("src");
  expect((await ownerPage.request.get(url!)).status()).toBe(200);
  await context.close();
});

test.afterAll(async () => {
  await prisma.notification.deleteMany({ where: { refId: orderId } });
  await prisma.task.deleteMany({ where: { id: taskId } });
  await prisma.mobileAsset.deleteMany({ where: { refType: "CUSTOMER_ORDER", refId: orderId } });
  await prisma.customerOrder.deleteMany({ where: { id: orderId } });
  await prisma.consolidationBatch.deleteMany({ where: { id: batchId } });
  await prisma.purchaseOrder.deleteMany({ where: { storeId, orderNo: run } });
  await prisma.sKU.deleteMany({ where: { id: skuId } });
  await prisma.stockLedger.deleteMany({ where: { refId: run } });
  await prisma.location.deleteMany({ where: { id: { in: [locationId, destinationId] } } });
  await prisma.user.deleteMany({ where: { id: managerId } });
});
