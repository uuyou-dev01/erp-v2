import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { hashPassword } from "@/lib/auth/password";
import { ensureShipOrderTaskDispatch } from "@/lib/application/shipping-dispatch-lifecycle";
import { prisma } from "@/lib/prisma";

const STORE_ID = "store_1";
const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL ?? "e2e-owner@example.invalid";
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD ?? "e2e-owner-password-7fd243e68c2d4b33";
const ACTOR_PASSWORD = "e2e-release-tasks-password-09-10";
const EVIDENCE_DIR = path.join(process.cwd(), "docs/testing/releases/v0.9.0/screenshots");

mkdirSync(EVIDENCE_DIR, { recursive: true });

const fixture = {
  organizationId: "",
  ownerId: "",
  locationId: "",
  skuId: "",
  lotId: "",
  internalMemberId: "",
  internalMemberEmail: "",
  internalTaskId: "",
  internalOrderId: "",
  internalOrderNumber: "",
  collaboratorAId: "",
  collaboratorAEmail: "",
  collaboratorBId: "",
  collaboratorBEmail: "",
  transferTaskId: "",
  transferOrderNumber: "",
  withdrawTaskId: "",
  withdrawOrderNumber: "",
};

async function shot(page: Page, name: string) {
  await expect(page.getByText(/正在加载你的任务协作关系/)).toHaveCount(0);
  await expect(page.getByText("加载工作台...")).toHaveCount(0);
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, name),
    fullPage: true,
    animations: "disabled",
  });
}

async function login(page: Page, email: string, destination: string, password = ACTOR_PASSWORD) {
  await page.context().clearCookies();
  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  const expected = new URL(destination, page.url());
  await page.waitForURL(
    (url) => url.pathname === expected.pathname && url.search === expected.search
  );
}

async function externalPage(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  return { context, page: await context.newPage() };
}

test.describe.configure({ mode: "serial" });

test.describe("release scenarios 09 and 10", () => {
  const runId = Date.now().toString(36);

  test.beforeAll(async () => {
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: OWNER_EMAIL },
      select: {
        id: true,
        memberships: {
          where: { status: "ACTIVE" },
          take: 1,
          select: { organizationId: true },
        },
      },
    });
    fixture.ownerId = owner.id;
    fixture.organizationId = owner.memberships[0].organizationId;

    const [location, sku, lot, password] = await Promise.all([
      prisma.location.findFirstOrThrow({
        where: { storeId: STORE_ID, code: "E2E-WH-CN" },
        select: { id: true },
      }),
      prisma.sKU.findUniqueOrThrow({
        where: { storeId_code: { storeId: STORE_ID, code: "E2E-QA-STOCK-001" } },
        select: { id: true },
      }),
      prisma.inventoryLot.findUniqueOrThrow({
        where: { id: "e2e_qa_inventory_lot_001" },
        select: { id: true },
      }),
      hashPassword(ACTOR_PASSWORD),
    ]);
    fixture.locationId = location.id;
    fixture.skuId = sku.id;
    fixture.lotId = lot.id;

    fixture.internalMemberEmail = `rc-09-member-${runId}@example.invalid`;
    const internalMember = await prisma.user.create({
      data: {
        email: fixture.internalMemberEmail,
        name: "RC 09 内部受托人",
        password,
        role: "FULFILLMENT",
        storeId: STORE_ID,
        emailVerifiedAt: new Date(),
        memberships: {
          create: {
            organizationId: fixture.organizationId,
            role: "FULFILLMENT",
            status: "ACTIVE",
          },
        },
        storeAccesses: { create: { storeId: STORE_ID, role: "FULFILLMENT" } },
      },
    });
    fixture.internalMemberId = internalMember.id;

    fixture.internalOrderNumber = `RC-09-${runId}`.toUpperCase();
    const internalOrder = await prisma.customerOrder.create({
      data: {
        storeId: STORE_ID,
        orderNumber: fixture.internalOrderNumber,
        customerName: "RC 09 合成收件人",
        customerPhone: "13800000009",
        shippingAddress: "上海市验收路 9 号",
        shippingCountry: "CN",
        orderDate: new Date(),
        currency: "CNY",
        subtotal: "99",
        totalPaid: "99",
        orderStatus: "DRAFT",
        lines: {
          create: {
            skuId: fixture.skuId,
            quantity: "1",
            unitPrice: "99",
            lineAmount: "99",
            supplyStatus: "ALLOCATED_FROM_STOCK",
            allocations: {
              create: {
                allocationType: "LOT",
                lotId: fixture.lotId,
                quantity: "1",
                unitCost: "100",
                costAmount: "100",
                costCurrency: "CNY",
                costSourceType: "E2E_FIXTURE",
                costSourceId: fixture.lotId,
                status: "ALLOCATED",
              },
            },
          },
        },
      },
    });
    fixture.internalOrderId = internalOrder.id;
    const internalTask = await prisma.task.create({
      data: {
        organizationId: fixture.organizationId,
        storeId: STORE_ID,
        type: "CONFIRM_ORDER",
        status: "OPEN",
        title: `确认内部订单 ${fixture.internalOrderNumber}`,
        description: "RC 09 委托、开始、完成与结果通知验收",
        refType: "CUSTOMER_ORDER",
        refId: internalOrder.id,
        createdById: fixture.ownerId,
        metadata: {
          work: { code: "CONFIRM_ORDER", name: "确认订单", quantity: 1, unit: "单" },
        },
      },
    });
    fixture.internalTaskId = internalTask.id;

    fixture.collaboratorAEmail = `rc-10-a-${runId}@example.invalid`;
    fixture.collaboratorBEmail = `rc-10-b-${runId}@example.invalid`;
    const [collaboratorA, collaboratorB] = await Promise.all([
      prisma.user.create({
        data: {
          email: fixture.collaboratorAEmail,
          name: "RC 10 外部仓库甲",
          password,
          emailVerifiedAt: new Date(),
        },
      }),
      prisma.user.create({
        data: {
          email: fixture.collaboratorBEmail,
          name: "RC 10 外部仓库乙",
          password,
          emailVerifiedAt: new Date(),
        },
      }),
    ]);
    fixture.collaboratorAId = collaboratorA.id;
    fixture.collaboratorBId = collaboratorB.id;
    await prisma.locationFulfiller.createMany({
      data: [
        {
          organizationId: fixture.organizationId,
          locationId: fixture.locationId,
          userId: collaboratorA.id,
          email: collaboratorA.email,
          role: "OPERATOR",
          status: "ACTIVE",
          invitedById: fixture.ownerId,
          acceptedAt: new Date(),
        },
        {
          organizationId: fixture.organizationId,
          locationId: fixture.locationId,
          userId: collaboratorB.id,
          email: collaboratorB.email,
          role: "OPERATOR",
          status: "ACTIVE",
          invitedById: fixture.ownerId,
          acceptedAt: new Date(),
        },
      ],
    });

    async function createShippingTask(label: "TRANSFER" | "WITHDRAW") {
      const orderNumber = `RC-10-${label}-${runId}`.toUpperCase();
      const order = await prisma.customerOrder.create({
        data: {
          storeId: STORE_ID,
          orderNumber,
          customerName: `RC 10 ${label} 合成收件人`,
          customerPhone: label === "TRANSFER" ? "13800001001" : "13800001002",
          shippingAddress: `上海市验收路 10 号 ${label}`,
          shippingCountry: "CN",
          orderDate: new Date(),
          currency: "CNY",
          subtotal: "199",
          totalPaid: "199",
          orderStatus: "CONFIRMED",
          confirmedAt: new Date(),
          lines: {
            create: {
              skuId: fixture.skuId,
              quantity: "1",
              unitPrice: "199",
              lineAmount: "199",
            },
          },
        },
      });
      const dispatch = await ensureShipOrderTaskDispatch({
        organizationId: fixture.organizationId,
        storeId: STORE_ID,
        orderId: order.id,
        orderNumber,
        createdById: fixture.ownerId,
        locationId: fixture.locationId,
        description: `RC 10 ${label} 外部个人任务协作验收`,
      });
      return { orderNumber, taskId: dispatch.task.id };
    }

    const transfer = await createShippingTask("TRANSFER");
    fixture.transferTaskId = transfer.taskId;
    fixture.transferOrderNumber = transfer.orderNumber;
    const withdraw = await createShippingTask("WITHDRAW");
    fixture.withdrawTaskId = withdraw.taskId;
    fixture.withdrawOrderNumber = withdraw.orderNumber;
  });

  test("09 internal assignee starts, completes and notifies the delegator", async ({
    browser,
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 430, height: 900 });
    const member = await externalPage(browser);
    await member.page.setViewportSize({ width: 430, height: 900 });

    await login(page, OWNER_EMAIL, `/m/tasks/${fixture.internalTaskId}`, OWNER_PASSWORD);
    await expect(page.getByRole("heading", { name: /E2E-QA-STOCK-001/ })).toBeVisible();
    await expect(page.getByText("尚未委托", { exact: true })).toBeVisible();
    await shot(page, "09-01-owner-task-before-assignment-rc2.png");

    await page.getByLabel("选择负责人").selectOption(fixture.internalMemberId);
    await page.getByRole("button", { name: "委托", exact: true }).click();
    await expect(page.getByText("已委托并通知对方", { exact: true })).toBeVisible();
    await expect(page.getByText("负责人：RC 09 内部受托人", { exact: true })).toBeVisible();
    await shot(page, "09-02-owner-task-assigned-rc2.png");

    await login(member.page, fixture.internalMemberEmail, "/m/notifications");
    await expect(member.page.getByRole("heading", { name: "消息" })).toBeVisible();
    const assignedNotice = member.page.getByRole("link").filter({
      has: member.page.getByText("你有一个新的任务", { exact: true }),
    });
    await expect(assignedNotice).toContainText(`确认内部订单 ${fixture.internalOrderNumber}`);
    await shot(member.page, "09-03-assignee-received-assignment-notification-rc2.png");

    await assignedNotice.click();
    await expect(member.page).toHaveURL(new RegExp(`/m/tasks/${fixture.internalTaskId}$`));
    await expect(member.page.getByRole("button", { name: "开始处理", exact: true })).toBeVisible();
    await shot(member.page, "09-04-assignee-before-start-rc2.png");

    await member.page.getByRole("button", { name: "开始处理", exact: true }).click();
    await expect(member.page.getByText("任务已开始处理", { exact: true })).toBeVisible();
    await expect(member.page.getByRole("button", { name: "开始处理", exact: true })).toHaveCount(0);
    await shot(member.page, "09-05-assignee-task-started-rc2.png");

    await member.page
      .getByText("我已核对商品、数量和当前状态，确认执行此业务节点。", { exact: true })
      .click();
    await shot(member.page, "09-06-assignee-before-completion-rc2.png");
    await member.page.getByRole("button", { name: "确认订单", exact: true }).click();
    await member.page.waitForURL((url) => url.pathname === "/m");
    await member.page.goto(`/m/tasks/${fixture.internalTaskId}`);
    await expect(member.page.getByText("已完成", { exact: true })).toBeVisible();
    await expect(member.page.getByText("RC 09 内部受托人", { exact: true })).toBeVisible();
    await shot(member.page, "09-07-assignee-completion-receipt-rc2.png");

    await page.goto("/m/notifications");
    await expect(page.getByRole("heading", { name: "消息" })).toBeVisible();
    const doneNotice = page.getByRole("link").filter({
      has: page.getByText("任务已完成", { exact: true }),
    });
    await expect(doneNotice).toContainText(`确认内部订单 ${fixture.internalOrderNumber}`);
    await shot(page, "09-08-owner-result-notification-rc2.png");
    await doneNotice.click();
    await expect(page).toHaveURL(new RegExp(`/m/tasks/${fixture.internalTaskId}$`));
    await expect(page.getByText("RC 09 内部受托人", { exact: true })).toBeVisible();
    await shot(page, "09-09-owner-completion-receipt-rc2.png");

    const [task, order, assignmentNotification, resultNotification, request, workRecords] =
      await Promise.all([
        prisma.task.findUniqueOrThrow({ where: { id: fixture.internalTaskId } }),
        prisma.customerOrder.findUniqueOrThrow({ where: { id: fixture.internalOrderId } }),
        prisma.notification.findFirstOrThrow({
          where: {
            recipientId: fixture.internalMemberId,
            taskId: fixture.internalTaskId,
            type: "TASK_ASSIGNED",
          },
        }),
        prisma.notification.findFirstOrThrow({
          where: {
            recipientId: fixture.ownerId,
            taskId: fixture.internalTaskId,
            type: "TASK_DONE",
          },
        }),
        prisma.mobileActionRequest.findFirstOrThrow({
          where: { taskId: fixture.internalTaskId, userId: fixture.internalMemberId },
        }),
        prisma.workRecord.findMany({ where: { taskId: fixture.internalTaskId } }),
      ]);
    expect(task).toMatchObject({
      status: "DONE",
      assignedToId: fixture.internalMemberId,
      completedById: fixture.internalMemberId,
    });
    expect(task.startedAt).not.toBeNull();
    expect(task.completedAt).not.toBeNull();
    expect(order.orderStatus).toBe("CONFIRMED");
    expect(assignmentNotification.actionUrl).toBe(`/m/tasks/${fixture.internalTaskId}`);
    expect(assignmentNotification.resolutionCode).toBe("TASK_STARTED");
    expect(assignmentNotification.resolvedById).toBe(fixture.internalMemberId);
    expect(resultNotification.actionUrl).toBe(`/m/tasks/${fixture.internalTaskId}`);
    expect(resultNotification.resolutionCode).toBe("INFORMATIONAL");
    expect(request.status).toBe("COMPLETED");
    expect(workRecords).toHaveLength(1);
    expect(workRecords[0].relationshipType).toBe("MEMBER");

    await member.context.close();
  });

  test("10 external warehouse handoff and owner withdrawal revoke the previous executor", async ({
    browser,
    page: ownerPage,
  }) => {
    test.setTimeout(240_000);
    const collaboratorA = await externalPage(browser);
    const collaboratorB = await externalPage(browser);

    await login(
      collaboratorA.page,
      fixture.collaboratorAEmail,
      `/collaboration/tasks?task=${fixture.transferTaskId}`
    );
    await expect(
      collaboratorA.page.getByRole("heading", {
        name: `订单 ${fixture.transferOrderNumber}`,
        exact: true,
      })
    ).toBeVisible();
    await shot(collaboratorA.page, "10-08-external-a-before-claim-rc2.png");
    await collaboratorA.page.getByRole("button", { name: "领取并开始", exact: true }).click();
    await expect(
      collaboratorA.page.getByText("任务已领取，可以开始填写发货结果。", { exact: true })
    ).toBeVisible();
    await expect(collaboratorA.page.getByText("RC 10 TRANSFER 合成收件人")).toBeVisible();
    await shot(collaboratorA.page, "10-09-external-a-claimed-rc2.png");

    await collaboratorA.page.getByLabel("转交给").selectOption(fixture.collaboratorBId);
    await shot(collaboratorA.page, "10-10-external-a-handoff-selected-rc2.png");
    await collaboratorA.page.getByRole("button", { name: "转交任务", exact: true }).click();
    await expect(
      collaboratorA.page.getByText("转交请求已发送；对方接受前仍由当前执行人负责。", {
        exact: true,
      })
    ).toBeVisible();
    await shot(collaboratorA.page, "10-11-external-a-handoff-requested-rc2.png");

    await login(
      collaboratorB.page,
      fixture.collaboratorBEmail,
      `/collaboration/tasks?task=${fixture.transferTaskId}`
    );
    await expect(
      collaboratorB.page.getByRole("button", { name: "接受转交", exact: true })
    ).toBeVisible();
    await expect(
      collaboratorB.page.getByText("为保护客户隐私，接受任务后才会显示姓名、电话和收货地址。")
    ).toBeVisible();
    await shot(collaboratorB.page, "10-12-external-b-before-accept-handoff-rc2.png");
    await collaboratorB.page.getByRole("button", { name: "接受转交", exact: true }).click();
    await expect(
      collaboratorB.page.getByText("转交已接受，现在由你负责这项任务。", { exact: true })
    ).toBeVisible();
    await expect(collaboratorB.page.getByText("RC 10 TRANSFER 合成收件人")).toBeVisible();
    await shot(collaboratorB.page, "10-13-external-b-handoff-accepted-rc2.png");

    await collaboratorA.page.reload();
    await expect(collaboratorA.page.getByRole("heading", { name: "我的任务" })).toBeVisible();
    await expect(
      collaboratorA.page.getByRole("heading", {
        name: `订单 ${fixture.transferOrderNumber}`,
        exact: true,
      })
    ).toHaveCount(0);
    await shot(collaboratorA.page, "10-14-external-a-access-revoked-after-handoff-rc2.png");

    await collaboratorB.page.goto(`/collaboration/tasks?task=${fixture.withdrawTaskId}`);
    await expect(
      collaboratorB.page.getByRole("heading", {
        name: `订单 ${fixture.withdrawOrderNumber}`,
        exact: true,
      })
    ).toBeVisible();
    await collaboratorB.page.getByRole("button", { name: "领取并开始", exact: true }).click();
    await expect(
      collaboratorB.page.getByText("任务已领取，可以开始填写发货结果。", { exact: true })
    ).toBeVisible();
    await shot(collaboratorB.page, "10-15-external-b-processing-before-withdrawal-rc2.png");

    await login(
      ownerPage,
      OWNER_EMAIL,
      `/workbench?scope=warehouse&task=${fixture.withdrawTaskId}`,
      OWNER_PASSWORD
    );
    await expect(
      ownerPage.getByRole("heading", {
        name: `订单 ${fixture.withdrawOrderNumber}`,
        exact: true,
      })
    ).toBeVisible();
    await ownerPage.getByLabel("撤回原因").fill("客户取消订单，停止仓库发货");
    await shot(ownerPage, "10-16-owner-withdrawal-reason-filled-rc2.png");
    await ownerPage.getByRole("button", { name: "撤回任务", exact: true }).click();
    await expect(ownerPage.getByText("任务已撤回。", { exact: true })).toBeVisible();
    await expect(ownerPage.getByText("任务已撤回", { exact: true }).last()).toBeVisible();
    await shot(ownerPage, "10-17-owner-task-withdrawn-rc2.png");

    await collaboratorB.page.reload();
    await expect(collaboratorB.page.getByRole("heading", { name: "我的任务" })).toBeVisible();
    await expect(
      collaboratorB.page.getByRole("heading", {
        name: `订单 ${fixture.withdrawOrderNumber}`,
        exact: true,
      })
    ).toHaveCount(0);
    await shot(collaboratorB.page, "10-18-external-b-access-revoked-after-withdrawal-rc2.png");

    const [transferTask, transferDispatch, handoff, handoffNotification] = await Promise.all([
      prisma.task.findUniqueOrThrow({ where: { id: fixture.transferTaskId } }),
      prisma.taskDispatch.findUniqueOrThrow({ where: { taskId: fixture.transferTaskId } }),
      prisma.collaborationRequest.findFirstOrThrow({
        where: {
          kind: "SHIP_ORDER_HANDOFF",
          parent: { dispatches: { some: { taskId: fixture.transferTaskId } } },
        },
      }),
      prisma.notification.findFirstOrThrow({
        where: {
          recipientId: fixture.collaboratorBId,
          taskId: fixture.transferTaskId,
          type: "TASK_HANDOFF_REQUESTED",
        },
      }),
    ]);
    expect(transferTask.status).toBe("IN_PROGRESS");
    expect(transferTask.assignedToId).toBe(fixture.collaboratorBId);
    expect(transferDispatch.status).toBe("CLAIMED");
    expect(transferDispatch.claimedByUserId).toBe(fixture.collaboratorBId);
    expect(handoff.status).toBe("CLOSED");
    expect(handoff.resolutionCode).toBe("HANDOFF_ACCEPTED");
    expect(handoffNotification.actionUrl).toBe(
      `/collaboration/tasks?task=${fixture.transferTaskId}`
    );
    expect(handoffNotification.resolutionCode).toBe("HANDOFF_ACCEPTED");

    const [withdrawTask, withdrawDispatch, withdrawRequest, withdrawEvents] = await Promise.all([
      prisma.task.findUniqueOrThrow({ where: { id: fixture.withdrawTaskId } }),
      prisma.taskDispatch.findUniqueOrThrow({ where: { taskId: fixture.withdrawTaskId } }),
      prisma.collaborationRequest.findFirstOrThrow({
        where: { dispatches: { some: { taskId: fixture.withdrawTaskId } } },
      }),
      prisma.collaborationEvent.findMany({
        where: { request: { dispatches: { some: { taskId: fixture.withdrawTaskId } } } },
        orderBy: { occurredAt: "asc" },
      }),
    ]);
    expect(withdrawTask.status).toBe("CANCELLED");
    expect(withdrawTask.completedAt).toBeNull();
    expect(withdrawDispatch.status).toBe("CANCELLED");
    expect(withdrawDispatch.completedAt).toBeNull();
    expect(withdrawRequest.status).toBe("CANCELLED");
    expect(withdrawRequest.resolutionCode).toBe("客户取消订单，停止仓库发货");
    expect(withdrawEvents.map((event) => event.type)).toContain("CANCELLED");

    await collaboratorA.context.close();
    await collaboratorB.context.close();
  });
});
