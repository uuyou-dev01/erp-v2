import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";

const STORE_ID = "store_1";
const EVIDENCE_DIR = path.join(
  process.cwd(),
  "docs/testing/e2e-2026-07-26/screenshots",
);

mkdirSync(EVIDENCE_DIR, { recursive: true });

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, name),
    fullPage: true,
    animations: "disabled",
  });
}

async function lotQuantity(lotId: string) {
  const ledgers = await prisma.stockLedger.findMany({
    where: { entityType: "LOT", entityId: lotId },
    select: { deltaQty: true },
  });
  return ledgers.reduce(
    (sum, row) => sum.plus(row.deltaQty.toString()),
    new Decimal(0),
  );
}

test.describe.configure({ mode: "serial" });

test.describe("ERP full-flow evidence", () => {
  const runId = `evidence_${Date.now()}`;
  const orderNo = `PO_${runId}`.toUpperCase();
  const skuCode = `SKU_${runId}`.toUpperCase();
  const productName = `全流程测试商品 ${runId}`;
  const externalOrderNo = `SO_${runId}`.toUpperCase();
  const supplierName = `全流程供应商 ${runId}`;

  let sellableLocationId = "";
  let skuId = "";
  let listingId = "";

  test.beforeAll(async () => {
    const location = await prisma.location.findFirstOrThrow({
      where: {
        storeId: STORE_ID,
        isSellableDefault: true,
        region: { startsWith: "CN" },
      },
      orderBy: { createdAt: "asc" },
    });
    sellableLocationId = location.id;
  });

  test("01 CNY purchase, inbound, listing, sale, shipment and profit", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const appErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") appErrors.push(message.text());
    });
    page.on("pageerror", (error) => appErrors.push(error.message));

    await page.goto("/procurement/new");
    await expect(page.getByRole("heading", { name: "新建采购订单" })).toBeVisible();
    await page.getByLabel(/采购单号/).fill(orderNo);
    await page.getByLabel(/供应商/).fill(supplierName);
    await page.getByLabel(/^币种/).selectOption("CNY");
    await page.getByLabel("目的地仓库").selectOption(sellableLocationId);
    await shot(page, "01-purchase-basic-cny.png");

    await page.getByRole("button", { name: /下一步/ }).click();
    await page.getByRole("button", { name: /新建SKU/ }).click();
    await expect(
      page.getByRole("heading", { name: /快速新建\s*SKU/ }),
    ).toBeVisible();
    await page.getByLabel("系统 SKU 编码").fill(skuCode);
    await page.getByLabel(/商品名称/).fill(productName);
    await page.getByRole("button", { name: "创建并选中" }).click();

    await expect(page.getByText(`已选择：${skuCode}`)).toBeVisible();
    await page.getByPlaceholder("100").fill("2");
    await page.getByPlaceholder("99.99").fill("100");
    await page.getByRole("button", { name: /^添加$/ }).click();
    await expect(page.getByRole("cell", { name: skuCode })).toBeVisible();
    await shot(page, "02-purchase-line-qty-cost.png");

    await page.getByRole("button", { name: /下一步/ }).click();
    await expect(page.getByRole("heading", { name: "订单信息预览" })).toBeVisible();
    await shot(page, "03-purchase-review-total.png");
    await page.getByRole("button", { name: /确认提交/ }).click();

    await expect(page).toHaveURL(/\/procurement\/[^/]+$/);
    await expect(page.getByText("草稿", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "标记为已下单" }).click();
    await expect(page.getByText("已下单", { exact: true })).toBeVisible();
    await shot(page, "04-purchase-ordered-receive.png");

    await page.getByLabel(/目的地仓库/).selectOption(sellableLocationId);
    await page.getByRole("button", { name: "确认收货并创建库存" }).click();
    await expect(page.getByRole("heading", { name: "采购管理" })).toBeVisible();

    const purchase = await prisma.purchaseOrder.findFirstOrThrow({
      where: { storeId: STORE_ID, orderNo },
      include: { lines: true },
    });
    skuId = purchase.lines[0].skuId;
    expect(purchase.status).toBe("RECEIVED");
    expect(purchase.currency).toBe("CNY");
    expect(purchase.subtotal.toString()).toBe("200");
    expect(purchase.totalAmount.toString()).toBe("200");
    expect(purchase.lines[0].quantity.toString()).toBe("2");
    expect(purchase.lines[0].unitPrice.toString()).toBe("100");

    const lot = await prisma.inventoryLot.findFirstOrThrow({
      where: {
        storeId: STORE_ID,
        skuId,
        sourceType: "PURCHASE",
        sourceId: purchase.lines[0].id,
      },
    });
    expect((await lotQuantity(lot.id)).toString()).toBe("2");

    await page.goto(`/inventory/sellable?q=${encodeURIComponent(productName)}`);
    await expect(page.getByRole("heading", { name: "库存看板" })).toBeVisible();
    const card = page.locator("article").filter({ hasText: productName });
    await expect(card).toBeVisible();
    await shot(page, "05-inventory-received-qty-2.png");

    await card.getByRole("button", { name: "首上架" }).click();
    await expect(page.getByText("添加上架记录").last()).toBeVisible();
    await page.getByLabel("挂牌价").fill("180");
    await page.getByLabel("币种").selectOption("CNY");
    await shot(page, "06-listing-create-cny-180.png");
    await page.getByRole("button", { name: "确认添加" }).click();

    await expect
      .poll(async () => {
        const listing = await prisma.listing.findFirst({
          where: { storeId: STORE_ID, skuId, status: "ACTIVE" },
        });
        if (listing) listingId = listing.id;
        return Boolean(listing);
      })
      .toBe(true);

    await page.goto(`/listing?q=${encodeURIComponent(productName)}`);
    await expect(page.getByRole("heading", { name: "Listing 分类" })).toBeVisible();
    const listedRow = page.getByRole("row").filter({ hasText: productName });
    await expect(listedRow.getByText("在售中")).toBeVisible();
    await shot(page, "07-listing-active.png");

    await listedRow.getByRole("button", { name: "登记售出" }).click();
    await expect(page.getByRole("heading", { name: "登记售出" })).toBeVisible();
    await page.getByLabel("数量").fill("1");
    await page.getByLabel(/最终售出单价/).fill("180");
    await page.getByLabel("平台费率").fill("0.1");
    await page.getByLabel(/邮费成本/).fill("12");
    await page.getByLabel("发货方 / 发货仓").selectOption(sellableLocationId);
    await page.getByLabel("客户名称").fill("全流程买家");
    await page.getByLabel("平台订单号").fill(externalOrderNo);
    await shot(page, "08-sale-input-fees.png");
    await page.getByRole("button", { name: "确认登记" }).click();

    await expect(page).toHaveURL(/\/sales\/[^/]+$/);
    await expect(page.getByText("已确认", { exact: true })).toBeVisible();
    await expect(page.getByText("CNY 50.00")).toBeVisible();
    await shot(page, "09-sale-confirmed-profit-50.png");

    await page.getByRole("button", { name: "确认已发货" }).click();
    await page.getByLabel("物流单号（选填）").fill(`TRK_${runId}`);
    await page.getByRole("button", { name: "确认发货" }).click();
    await expect(page.getByText("已发货", { exact: true }).first()).toBeVisible();
    await shot(page, "10-sale-shipped.png");

    const order = await prisma.customerOrder.findFirstOrThrow({
      where: { externalOrderNo },
      include: { lines: { include: { allocations: true } } },
    });
    expect(order.orderStatus).toBe("SHIPPED");
    expect(order.currency).toBe("CNY");
    expect(order.subtotal.toString()).toBe("180");
    expect(order.platformFee.toString()).toBe("18");
    expect(order.shippingFee.toString()).toBe("12");
    expect(order.netRevenue?.toString()).toBe("150");
    expect(order.lines[0].allocations[0].costAmount.toString()).toBe("100");
    expect((await lotQuantity(lot.id)).toString()).toBe("1");

    await page.goto("/reports?range=custom&from=2020-01-01&to=2030-12-31");
    await expect(page.getByRole("heading", { name: "报表分析" })).toBeVisible();
    await shot(page, "11-report-after-sale.png");

    expect(
      appErrors.filter((line) =>
        /Runtime Error|Application error|Internal Server Error|Prisma|Unhandled/i.test(
          line,
        ),
      ),
    ).toEqual([]);
  });

  test("02 consolidation status flow and inventory movement evidence", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const transit = await prisma.location.create({
      data: {
        storeId: STORE_ID,
        code: `FWD_${runId}`.toUpperCase(),
        name: "证据：中国转运仓",
        region: "CN_SHANGHAI",
        type: "TRANSIT",
        isSellableDefault: false,
      },
    });
    const destination = await prisma.location.create({
      data: {
        storeId: STORE_ID,
        code: `WH_JP_${runId}`.toUpperCase(),
        name: "证据：日本可售仓",
        region: "JP_TOKYO",
        type: "WAREHOUSE",
        isSellableDefault: true,
      },
    });
    const transferSku = await prisma.sKU.create({
      data: {
        storeId: STORE_ID,
        code: `TRANSFER_${runId}`.toUpperCase(),
        name: "集运库存移动验证商品",
      },
    });
    const purchase = await prisma.purchaseOrder.create({
      data: {
        storeId: STORE_ID,
        orderNo: `PO_TRANSFER_${runId}`.toUpperCase(),
        supplierName: "集运测试供应商",
        currency: "JPY",
        subtotal: "18000",
        totalAmount: "18000",
        status: "RECEIVED",
        destinationLocationId: transit.id,
        receivedAt: new Date(),
        lines: {
          create: {
            skuId: transferSku.id,
            quantity: "3",
            unitPrice: "6000",
            lineAmount: "18000",
          },
        },
      },
      include: { lines: true },
    });
    const lot = await prisma.inventoryLot.create({
      data: {
        storeId: STORE_ID,
        skuId: transferSku.id,
        locationId: transit.id,
        unitCost: "6000",
        costCurrency: "JPY",
        sourceType: "PURCHASE",
        sourceId: purchase.lines[0].id,
        receivedAt: new Date(),
        batchLabel: `TRANSFER_${runId}`,
      },
    });
    await prisma.stockLedger.create({
      data: {
        storeId: STORE_ID,
        entityType: "LOT",
        entityId: lot.id,
        locationId: transit.id,
        deltaQty: "3",
        reason: "INBOUND_PURCHASE",
        refType: "PURCHASE_LINE",
        refId: purchase.lines[0].id,
      },
    });
    const batch = await prisma.consolidationBatch.create({
      data: {
        storeId: STORE_ID,
        fromLocationId: transit.id,
        toLocationId: destination.id,
        note: "验证集运状态是否驱动库存移动",
        lines: {
          create: {
            sourceType: "PURCHASE_LINE",
            sourceId: purchase.lines[0].id,
            quantity: "3",
          },
        },
      },
    });

    await page.goto("/logistics/consolidations");
    await expect(
      page.getByRole("heading", { name: "集运批次", exact: true }),
    ).toBeVisible();
    await shot(page, "12-consolidation-list.png");
    await page.goto(`/logistics/consolidations/${batch.id}`);
    await expect(page.getByText("证据：中国转运仓 → 证据：日本可售仓")).toBeVisible();
    await shot(page, "13-consolidation-open.png");

    await page.getByRole("button", { name: "封箱" }).click();
    await expect
      .poll(async () => {
        const current = await prisma.consolidationBatch.findUnique({
          where: { id: batch.id },
          select: { status: true },
        });
        return current?.status;
      })
      .toBe("SEALED");
    await page.getByText("国际物流单号").locator("..").getByRole("textbox").fill(`JP_${runId}`);
    await page.getByText("承运商").locator("..").getByRole("textbox").fill("Yamato");
    await page.getByRole("button", { name: "填写物流并发出" }).click();
    await expect
      .poll(async () => {
        const current = await prisma.consolidationBatch.findUnique({
          where: { id: batch.id },
          select: { status: true },
        });
        return current?.status;
      })
      .toBe("SHIPPED");
    await page.reload();
    await shot(page, "14-consolidation-shipped.png");

    await page.getByRole("button", { name: "确认到货" }).click();
    await expect
      .poll(async () => {
        const current = await prisma.consolidationBatch.findUnique({
          where: { id: batch.id },
          select: { status: true },
        });
        return current?.status;
      })
      .toBe("RECEIVED");
    await page.reload();
    await shot(page, "15-consolidation-received.png");

    const refreshedBatch = await prisma.consolidationBatch.findUniqueOrThrow({
      where: { id: batch.id },
    });
    expect(refreshedBatch.status).toBe("RECEIVED");
    expect(refreshedBatch.outboundTrackingNo).toBe(`JP_${runId}`);
    expect(refreshedBatch.carrier).toBe("Yamato");

    const refreshedLot = await prisma.inventoryLot.findUniqueOrThrow({
      where: { id: lot.id },
    });
    const destinationTransfer = await prisma.stockLedger.findFirstOrThrow({
      where: {
        storeId: STORE_ID,
        locationId: destination.id,
        reason: "TRANSFER_IN",
        refType: "CONSOLIDATION_BATCH",
        refId: batch.id,
      },
    });
    const destinationLot = await prisma.inventoryLot.findUniqueOrThrow({
      where: { id: destinationTransfer.entityId },
    });
    expect(refreshedLot.locationId).toBe(transit.id);
    expect(refreshedLot.status).toBe("CONSUMED");
    expect((await lotQuantity(lot.id)).toString()).toBe("0");
    expect((await lotQuantity(destinationLot.id)).toString()).toBe("3");
    expect(
      await prisma.stockLedger.count({
        where: {
          refType: "CONSOLIDATION_BATCH",
          refId: batch.id,
        },
      }),
    ).toBe(2);
  });

  test("03 multi-account task assignment and notification", async ({ page }) => {
    test.setTimeout(90_000);
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@example.com" },
      include: { memberships: true },
    });
    const memberEmail = `${runId}@example.com`;
    const member = await prisma.user.create({
      data: {
        email: memberEmail,
        name: "代发执行员",
        password: await hashPassword("e2e-test-password"),
        role: "FULFILLMENT",
        storeId: STORE_ID,
        memberships: {
          create: {
            organizationId: admin.memberships[0].organizationId,
            role: "FULFILLMENT",
            status: "ACTIVE",
          },
        },
        storeAccesses: {
          create: {
            storeId: STORE_ID,
            role: "FULFILLMENT",
          },
        },
      },
    });
    const taskSku = await prisma.sKU.create({
      data: {
        storeId: STORE_ID,
        code: `TASK_${runId}`.toUpperCase(),
        name: "多人任务分发商品",
      },
    });
    const taskSupplier = `任务分发供应商 ${runId}`;
    const purchase = await prisma.purchaseOrder.create({
      data: {
        storeId: STORE_ID,
        orderNo: `PO_TASK_${runId}`.toUpperCase(),
        supplierName: taskSupplier,
        currency: "CNY",
        subtotal: "88",
        totalAmount: "88",
        status: "ORDERED",
        lines: {
          create: {
            skuId: taskSku.id,
            quantity: "1",
            unitPrice: "88",
            lineAmount: "88",
          },
        },
      },
    });
    const task = await prisma.task.create({
      data: {
        organizationId: admin.memberships[0].organizationId,
        storeId: STORE_ID,
        type: "CONFIRM_ARRIVAL",
        status: "OPEN",
        title: `代发协作任务 ${runId}`,
        description: "由管理员分配给代发执行员",
        refType: "PURCHASE_ORDER",
        refId: purchase.id,
        createdById: admin.id,
      },
    });

    await page.context().clearCookies();
    await page.goto("/workbench?queue=missingLogistics");
    await expect(page.getByText(taskSupplier)).toBeVisible();
    await page.locator('[role="button"]').filter({ hasText: taskSupplier }).first().click();
    await expect(page.getByText("任务委托")).toBeVisible();
    await shot(page, "16-task-unassigned.png");

    const assignment = page.locator("section").filter({ hasText: "任务委托" }).last();
    await assignment.getByRole("combobox").selectOption(member.id);
    await assignment.getByRole("button", { name: "指派" }).click();
    await expect
      .poll(async () => {
        const current = await prisma.task.findUnique({
          where: { id: task.id },
          select: { assignedToId: true },
        });
        return current?.assignedToId;
      })
      .toBe(member.id);
    await page.reload();
    await shot(page, "17-task-assigned.png");

    const assignedTask = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(assignedTask.status).toBe("ASSIGNED");
    expect(assignedTask.assignedToId).toBe(member.id);
    expect(assignedTask.delegatedToId).toBe(member.id);
    await expect
      .poll(() =>
        prisma.notification.count({
          where: {
            recipientId: member.id,
            taskId: task.id,
            type: "TASK_ASSIGNED",
          },
        }),
      )
      .toBe(1);

    await page.goto("/login");
    await page.getByLabel("邮箱").fill(memberEmail);
    await page.getByLabel("密码").fill("e2e-test-password");
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();
    await page.goto("/notifications");
    await expect(page.getByText("你有一个新的任务")).toBeVisible();
    await expect(page.getByText(`代发协作任务 ${runId}`)).toBeVisible();
    await shot(page, "18-assignee-notification.png");

    await page.goto("/workbench");
    await page.getByRole("button", { name: "我的任务" }).click();
    await expect(page.getByText(taskSupplier)).toBeVisible();
    await shot(page, "19-assignee-my-tasks.png");
  });
});
