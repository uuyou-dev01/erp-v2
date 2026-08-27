import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { ensureShipOrderTaskDispatch } from "@/lib/application/shipping-dispatch-lifecycle";

const runId = `deploy_collab_${Date.now()}`;
const password = "deploy-collaboration-password";
const collaboratorAEmail = `${runId}-a@example.invalid`;
const collaboratorBEmail = `${runId}-b@example.invalid`;
const collaboratorCEmail = `${runId}-suspended-member@example.invalid`;
const orderNumber = `RC-WH-${runId}`.toUpperCase();
const evidenceDir = path.join(process.cwd(), "docs/testing/releases/v0.9.0/screenshots");
const proofFixture = path.join(process.cwd(), "public/uploads/1780277819644-5x8heb.JPG");
mkdirSync(evidenceDir, { recursive: true });

let organizationId = "";
let storeId = "";
let ownerId = "";
let locationId = "";
let orderId = "";
let taskId = "";
let collaboratorAId = "";
let collaboratorBId = "";
let secondaryOrganizationId = "";

async function shot(page: Page, name: string, mask: Locator[] = []) {
  await page.screenshot({
    path: path.join(evidenceDir, name),
    fullPage: true,
    animations: "disabled",
    mask,
  });
}

async function login(page: Page, email: string, destination: string) {
  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL((url) => url.pathname === new URL(destination, url.origin).pathname);
}

test.describe("deployment RC external warehouse and private evidence", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: "e2e-owner@example.invalid" },
      select: {
        id: true,
        memberships: {
          where: { status: "ACTIVE" },
          take: 1,
          select: { organizationId: true },
        },
        storeAccesses: { take: 1, select: { storeId: true } },
      },
    });
    ownerId = owner.id;
    organizationId = owner.memberships[0].organizationId;
    storeId = owner.storeAccesses[0].storeId;
    const [location, sku, hashedPassword] = await Promise.all([
      prisma.location.findFirstOrThrow({
        where: { storeId, code: "E2E-WH-CN" },
        select: { id: true },
      }),
      prisma.sKU.findFirstOrThrow({
        where: { storeId, code: "E2E-QA-STOCK-001" },
        select: { id: true },
      }),
      hashPassword(password),
    ]);
    locationId = location.id;

    const [collaboratorA, collaboratorB, collaboratorC] = await Promise.all([
      prisma.user.create({
        data: {
          email: collaboratorAEmail,
          name: "RC 外部仓库甲",
          password: hashedPassword,
          role: "USER",
          emailVerifiedAt: new Date(),
        },
      }),
      prisma.user.create({
        data: {
          email: collaboratorBEmail,
          name: "RC 外部仓库乙",
          password: hashedPassword,
          role: "USER",
          emailVerifiedAt: new Date(),
        },
      }),
      prisma.user.create({
        data: {
          email: collaboratorCEmail,
          name: "RC 已停用企业成员",
          password: hashedPassword,
          role: "USER",
          emailVerifiedAt: new Date(),
        },
      }),
    ]);
    collaboratorAId = collaboratorA.id;
    collaboratorBId = collaboratorB.id;

    const secondaryOrganization = await prisma.organization.create({
      data: {
        name: "RC 隔离经营主体",
        code: `${runId}-secondary`,
        memberships: {
          create: { userId: ownerId, role: "OWNER", status: "ACTIVE" },
        },
      },
      select: { id: true },
    });
    secondaryOrganizationId = secondaryOrganization.id;

    await prisma.locationFulfiller.create({
      data: {
        organizationId,
        locationId,
        userId: collaboratorB.id,
        email: collaboratorB.email,
        role: "OPERATOR",
        status: "ACTIVE",
        invitedById: ownerId,
        acceptedAt: new Date(),
      },
    });
    await prisma.membership.create({
      data: {
        organizationId,
        userId: collaboratorC.id,
        role: "MEMBER",
        status: "SUSPENDED",
      },
    });
    await prisma.locationFulfiller.create({
      data: {
        organizationId,
        locationId,
        userId: collaboratorC.id,
        email: collaboratorC.email,
        role: "OPERATOR",
        status: "ACTIVE",
        invitedById: ownerId,
        acceptedAt: new Date(),
      },
    });

    const order = await prisma.customerOrder.create({
      data: {
        storeId,
        orderNumber,
        customerName: "RC 合成收件人",
        customerPhone: "13800000000",
        shippingAddress: "上海市测试路 90 号（合成地址）",
        shippingCountry: "CN",
        orderDate: new Date(),
        currency: "CNY",
        subtotal: "199",
        totalPaid: "199",
        orderStatus: "CONFIRMED",
        confirmedAt: new Date(),
        lines: {
          create: {
            skuId: sku.id,
            quantity: "1",
            unitPrice: "199",
            lineAmount: "199",
          },
        },
      },
    });
    orderId = order.id;
    const dispatch = await ensureShipOrderTaskDispatch({
      organizationId,
      storeId,
      orderId,
      orderNumber,
      createdById: ownerId,
      locationId,
      description: "RC 外部仓库并发领取与私有凭证授权验收",
    });
    taskId = dispatch.task.id;
    await prisma.task.create({
      data: {
        organizationId,
        storeId,
        type: "SHIP_ORDER",
        status: "IN_PROGRESS",
        title: `停用成员资产鉴权回归 ${orderNumber}`,
        description: "成员已停用但仓库 roster 遗留 ACTIVE 时仍必须拒绝",
        refType: "CUSTOMER_ORDER",
        refId: order.id,
        createdById: ownerId,
        assignedToId: collaboratorC.id,
        assignedAt: new Date(),
        fulfillmentLocationId: locationId,
      },
    });
  });

  test("invites, protects address, blocks a concurrent claimant, returns and revokes proof access", async ({
    browser,
    page: ownerPage,
  }) => {
    test.setTimeout(240_000);
    const collaboratorAContext = await browser.newContext();
    const collaboratorBContext = await browser.newContext();
    const collaboratorCContext = await browser.newContext();
    const collaboratorAPage = await collaboratorAContext.newPage();
    const collaboratorBPage = await collaboratorBContext.newPage();
    const collaboratorCPage = await collaboratorCContext.newPage();

    await ownerPage.goto(`/inventory/locations/${locationId}`);
    await ownerPage.getByRole("button", { name: "添加协作人" }).click();
    const inviteDialog = ownerPage.getByRole("dialog", { name: "添加仓库协作人" });
    await inviteDialog.getByLabel("对方邮箱").fill(collaboratorAEmail);
    await inviteDialog.getByLabel("仓库角色").selectOption("OPERATOR");
    await inviteDialog.getByLabel("设为默认负责人").check();
    await shot(ownerPage, "10-01-owner-external-warehouse-invite-filled-rc1.png");
    await inviteDialog.getByRole("button", { name: "生成邀请链接" }).click();
    const invitationUrlInput = ownerPage.getByRole("textbox", { name: "邀请链接" });
    await expect(invitationUrlInput).toBeVisible();
    const invitationUrl = await invitationUrlInput.inputValue();
    await shot(ownerPage, "10-02-owner-invite-created-redacted-rc1.png", [invitationUrlInput]);

    const invitationPath = new URL(invitationUrl).pathname;
    await login(collaboratorAPage, collaboratorAEmail, invitationPath);
    await expect(collaboratorAPage.getByText("你只会获得这个仓库的发货任务")).toBeVisible();
    await expect(collaboratorAPage.getByText("不会加入对方企业")).toBeVisible();
    await shot(collaboratorAPage, "10-03-collaborator-scope-before-accept-rc1.png");
    await collaboratorAPage.getByRole("button", { name: "接受并进入发货任务" }).click();
    await expect(collaboratorAPage.getByRole("heading", { name: "我的发货任务" })).toBeVisible();

    await expect
      .poll(() =>
        prisma.notification.count({
          where: {
            recipientId: collaboratorAId,
            taskId,
            type: "WAREHOUSE_TASK_AVAILABLE",
            actionUrl: `/collaboration/tasks?task=${taskId}`,
          },
        })
      )
      .toBe(1);

    await login(collaboratorBPage, collaboratorBEmail, "/collaboration/tasks");
    for (const collaboratorPage of [collaboratorAPage, collaboratorBPage]) {
      await expect(
        collaboratorPage.getByRole("heading", { name: `订单 ${orderNumber}`, exact: true })
      ).toBeVisible();
      await expect(
        collaboratorPage.getByText("为保护客户隐私，接受任务后才会显示姓名、电话和收货地址。")
      ).toBeVisible();
    }
    await shot(collaboratorAPage, "10-04-address-hidden-before-claim-rc1.png");

    await Promise.allSettled([
      collaboratorAPage.getByRole("button", { name: "领取并开始" }).click(),
      collaboratorBPage.getByRole("button", { name: "领取并开始" }).click(),
    ]);
    await expect
      .poll(
        async () =>
          (await prisma.task.findUnique({ where: { id: taskId }, select: { assignedToId: true } }))
            ?.assignedToId ?? null
      )
      .not.toBeNull();

    const assignedTask = await prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      select: { assignedToId: true },
    });
    const winnerIsA = assignedTask.assignedToId === collaboratorAId;
    const winnerPage = winnerIsA ? collaboratorAPage : collaboratorBPage;
    const loserPage = winnerIsA ? collaboratorBPage : collaboratorAPage;
    const winnerContext = winnerIsA ? collaboratorAContext : collaboratorBContext;
    const loserContext = winnerIsA ? collaboratorBContext : collaboratorAContext;
    const winnerEmail = winnerIsA ? collaboratorAEmail : collaboratorBEmail;

    await expect(
      loserPage.getByText(/任务派发已经被领取或结束|任务已经被其他协作者领取/)
    ).toBeVisible();
    await shot(loserPage, "10-05-concurrent-claim-loser-blocked-rc1.png");
    await expect(winnerPage.getByText("RC 合成收件人")).toBeVisible();
    await expect(winnerPage.getByText("上海市测试路 90 号（合成地址）")).toBeVisible();
    await shot(winnerPage, "10-06-winner-address-visible-after-claim-rc1.png");

    const notification = await prisma.notification.findFirstOrThrow({
      where: { recipientId: collaboratorAId, taskId, type: "WAREHOUSE_TASK_AVAILABLE" },
      select: { readAt: true, resolvedAt: true, resolutionCode: true },
    });
    expect(notification.resolvedAt).not.toBeNull();
    expect(notification.resolutionCode).toBe("TASK_CLAIMED");

    await winnerPage.locator('input[type="file"]').setInputFiles(proofFixture);
    const proofImage = winnerPage.getByRole("img", { name: "发货凭证" });
    await expect(proofImage).toBeVisible();
    const proofUrl = await proofImage.getAttribute("src");
    expect(proofUrl).toMatch(/^\/api\/assets\/[^/]+\/content$/);
    await shot(winnerPage, "16-01-private-proof-uploaded-and-bound-rc1.png");

    expect((await winnerContext.request.get(proofUrl!)).status()).toBe(200);
    expect((await ownerPage.request.get(proofUrl!)).status()).toBe(200);
    const ownerAppUrl = new URL(ownerPage.url());
    await ownerPage.context().addCookies([
      {
        name: "erp_active_organization_id",
        value: secondaryOrganizationId,
        domain: ownerAppUrl.hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    expect(
      (await ownerPage.context().cookies(ownerAppUrl.origin)).find(
        (cookie) => cookie.name === "erp_active_organization_id"
      )?.value
    ).toBe(secondaryOrganizationId);
    const adjacentTenantDenied = await ownerPage.goto(proofUrl!);
    expect(adjacentTenantDenied?.status()).toBe(404);
    await shot(ownerPage, "17-00-adjacent-tenant-owner-private-proof-denied-rc1.png");
    await ownerPage.context().addCookies([
      {
        name: "erp_active_organization_id",
        value: organizationId,
        domain: ownerAppUrl.hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    expect((await loserContext.request.get(proofUrl!)).status()).toBe(404);
    await login(collaboratorCPage, collaboratorCEmail, "/collaboration/tasks");
    expect((await collaboratorCContext.request.get(proofUrl!)).status()).toBe(404);
    const exactDenied = await loserPage.goto(proofUrl!);
    expect(exactDenied?.status()).toBe(404);
    await shot(loserPage, "17-01-other-collaborator-private-proof-denied-rc1.png");
    const guessedDenied = await loserPage.goto(
      "/api/assets/00000000-0000-4000-8000-000000000000/content"
    );
    expect(guessedDenied?.status()).toBe(404);
    await shot(loserPage, "17-02-guessed-private-asset-id-denied-rc1.png");

    await winnerPage.goto(`/collaboration/tasks?task=${taskId}`);
    await expect(winnerPage.getByRole("button", { name: "退回任务" })).toBeVisible();
    await winnerPage.getByRole("button", { name: "退回任务" }).click();
    await expect(winnerPage.getByText("任务已退回委托方。")).toBeVisible();
    await shot(winnerPage, "10-07-external-collaborator-returned-task-rc1.png");
    expect((await winnerContext.request.get(proofUrl!)).status()).toBe(404);

    await ownerPage.goto(`/inventory/locations/${locationId}`);
    const winnerRosterRow = ownerPage
      .getByText(`${winnerEmail} · 发货操作员`, { exact: true })
      .locator("xpath=../..");
    await winnerRosterRow.getByRole("button", { name: "暂停权限" }).click();
    await expect(winnerRosterRow.getByText("已暂停")).toBeVisible();
    await winnerRosterRow.scrollIntoViewIfNeeded();
    await ownerPage.screenshot({
      path: path.join(evidenceDir, "17-03-owner-suspended-collaborator-rc1.png"),
      animations: "disabled",
    });

    await winnerPage.goto("/collaboration/tasks");
    await expect(
      winnerPage.getByRole("heading", { name: `订单 ${orderNumber}`, exact: true })
    ).toHaveCount(0);
    await expect(
      winnerPage.getByRole("heading", { name: "当前没有待领取任务", exact: true })
    ).toBeVisible();
    await shot(winnerPage, "17-04-suspended-collaborator-task-access-blocked-rc1.png");
    expect((await winnerContext.request.get(proofUrl!)).status()).toBe(404);

    await collaboratorAContext.close();
    await collaboratorBContext.close();
    await collaboratorCContext.close();
  });
});
