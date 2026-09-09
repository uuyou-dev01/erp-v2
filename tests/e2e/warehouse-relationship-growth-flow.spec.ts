import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { ensureShipOrderTaskDispatch } from "@/lib/application/shipping-dispatch-lifecycle";

const runId = Date.now().toString(36);
const invitedEmail = `warehouse-manager-${runId}@example.invalid`;
const operatorEmail = `warehouse-operator-${runId}@example.invalid`;
const password = "warehouse-relationship-password";
const ownOrganizationName = `协作者自己的企业 ${runId}`;
const ownStoreName = `协作者自己的店铺 ${runId}`;
const orderNumber = `REL-${runId}`.toUpperCase();
const offerTitle = `仅向协作者企业开放的货盘 ${runId}`;
const evidenceDir = path.join(
  process.cwd(),
  "docs/testing/releases/v0.9.0/relationship-flow/screenshots"
);
mkdirSync(evidenceDir, { recursive: true });

async function shot(page: Page, name: string, mask: Locator[] = []) {
  await page.screenshot({
    path: path.join(evidenceDir, name),
    fullPage: true,
    animations: "disabled",
    mask,
  });
}

test.describe("warehouse invitee identity, work and ERP growth flow", () => {
  test.describe.configure({ mode: "serial" });

  test("keeps one personal account across warehouse work, own ERP and explicit business sharing", async ({
    browser,
    page: ownerPage,
  }) => {
    test.setTimeout(300_000);
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
    const ownerOrganizationId = owner.memberships[0].organizationId;
    const ownerStoreId = owner.storeAccesses[0].storeId;
    ownerPage.setDefaultTimeout(10_000);
    const [location, sku] = await Promise.all([
      prisma.location.findFirstOrThrow({
        where: { storeId: ownerStoreId, code: "E2E-WH-CN" },
        select: { id: true },
      }),
      prisma.sKU.findFirstOrThrow({
        where: { storeId: ownerStoreId, code: "E2E-QA-STOCK-001" },
        select: { id: true },
      }),
    ]);

    await ownerPage.goto(`/inventory/locations/${location.id}`);
    await ownerPage.getByRole("button", { name: "添加协作人" }).click();
    const dialog = ownerPage.getByRole("dialog", { name: "添加任务协作者" });
    await dialog.getByLabel("对方邮箱").fill(invitedEmail);
    await dialog.getByLabel("任务角色").selectOption("MANAGER");
    await shot(ownerPage, "01-owner-invites-warehouse-manager.png");
    await dialog.getByRole("button", { name: "生成邀请链接" }).click();
    const invitationInput = ownerPage.getByRole("textbox", { name: "邀请链接" });
    const invitationUrl = await invitationInput.inputValue();
    const invitationPath = new URL(invitationUrl).pathname;

    const inviteeContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const inviteePage = await inviteeContext.newPage();
    inviteePage.setDefaultTimeout(10_000);
    await inviteePage.goto(invitationPath);
    await expect(inviteePage.getByRole("heading", { name: "参与合作方任务" })).toBeVisible();
    await expect(inviteePage.getByText("不会让你加入对方企业")).toBeVisible();
    await shot(inviteePage, "02-unregistered-invitee-understands-scope.png");

    await inviteePage.getByRole("link", { name: "注册个人账号" }).click();
    await expect(inviteePage.getByLabel("邮箱")).toHaveValue(invitedEmail);
    await expect(inviteePage.getByLabel("邮箱")).toHaveAttribute("readonly", "");
    await inviteePage.getByLabel("姓名").fill("外部任务负责人");
    await inviteePage.getByLabel("密码", { exact: true }).fill(password);
    await inviteePage.getByLabel("确认密码").fill(password);
    await shot(inviteePage, "03-invite-scoped-personal-registration.png");
    await inviteePage.getByRole("button", { name: "创建账号" }).click();
    await expect(inviteePage.getByRole("heading", { name: "参与合作方任务" })).toBeVisible();
    await shot(inviteePage, "04-registered-account-before-acceptance.png");

    await inviteePage.getByRole("button", { name: "接受并进入我的任务" }).click();
    await expect(inviteePage.getByRole("heading", { name: "我的任务" })).toBeVisible();
    await expect(inviteePage.getByText("当前没有待领取任务")).toBeVisible();
    await shot(inviteePage, "05-empty-task-portal-with-navigation.png");

    await inviteePage.goto("/collaboration");
    await expect(inviteePage.getByRole("heading", { name: "我的协作" })).toBeVisible();
    await expect(inviteePage.getByText("任务负责人", { exact: true })).toBeVisible();
    await expect(inviteePage.getByText("之后的新任务仍会出现在这里")).toBeVisible();
    await expect(
      inviteePage.getByRole("main").getByRole("link", { name: "创建自己的企业" })
    ).toBeVisible();
    await shot(inviteePage, "06-relationship-home-explains-long-term-options.png");

    const invitedUser = await prisma.user.findUniqueOrThrow({
      where: { email: invitedEmail },
      select: { id: true },
    });
    const managerRelationship = await prisma.locationFulfiller.findFirstOrThrow({
      where: { locationId: location.id, userId: invitedUser.id },
      select: { id: true, status: true, role: true },
    });
    expect(managerRelationship).toMatchObject({ status: "ACTIVE", role: "MANAGER" });
    await expect(
      prisma.membership.count({
        where: { organizationId: ownerOrganizationId, userId: invitedUser.id },
      })
    ).resolves.toBe(0);
    await expect(
      prisma.locationFulfillerEvent.findMany({
        where: { fulfillerId: managerRelationship.id },
        select: { eventType: true },
        orderBy: { createdAt: "asc" },
      })
    ).resolves.toEqual([{ eventType: "INVITED" }, { eventType: "ACCEPTED" }]);

    const operator = await prisma.user.create({
      data: {
        email: operatorEmail,
        name: "外部任务协作者",
        password: await hashPassword(password),
        role: "USER",
        emailVerifiedAt: new Date(),
      },
    });
    const operatorRelationship = await prisma.locationFulfiller.create({
      data: {
        organizationId: ownerOrganizationId,
        locationId: location.id,
        userId: operator.id,
        email: operator.email,
        role: "OPERATOR",
        status: "ACTIVE",
        acceptedAt: new Date(),
        invitedById: owner.id,
      },
    });
    await prisma.locationFulfillerEvent.create({
      data: {
        fulfillerId: operatorRelationship.id,
        eventType: "ACCEPTED",
        actorUserId: owner.id,
        toStatus: "ACTIVE",
        metadata: { fixture: true },
      },
    });
    const order = await prisma.customerOrder.create({
      data: {
        storeId: ownerStoreId,
        orderNumber,
        customerName: "仅执行人可见的收件人",
        customerPhone: "13800000000",
        shippingAddress: "上海市合成验收路 8 号",
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
    const bundle = await ensureShipOrderTaskDispatch({
      organizationId: ownerOrganizationId,
      storeId: ownerStoreId,
      orderId: order.id,
      orderNumber,
      createdById: owner.id,
      locationId: location.id,
    });

    await inviteePage.goto(`/collaboration/tasks?task=${bundle.task.id}`);
    await expect(inviteePage.getByText("任务负责人视图")).toBeVisible();
    await expect(inviteePage.getByText("订单发货", { exact: true }).first()).toBeVisible();
    await expect(inviteePage.getByRole("heading", { name: `订单 ${orderNumber}` })).toBeVisible();
    await expect(
      inviteePage.getByText("为保护客户隐私，接受任务后才会显示姓名、电话和收货地址。")
    ).toBeVisible();
    await expect(inviteePage.getByText("仅执行人可见的收件人")).toHaveCount(0);
    await shot(inviteePage, "07-manager-dispatch-view-keeps-recipient-private.png");
    await inviteePage.getByLabel("指派给").selectOption(operator.id);
    await inviteePage.getByRole("button", { name: "指派任务" }).click();
    await expect(inviteePage.getByText("任务已指派，等待对方领取。")).toBeVisible();
    await expect
      .poll(() =>
        prisma.task.findUnique({ where: { id: bundle.task.id }, select: { assignedToId: true } })
      )
      .toEqual({ assignedToId: operator.id });
    await shot(inviteePage, "08-manager-assigned-task-to-operator.png");

    await inviteePage.goto("/onboarding");
    await expect(inviteePage.getByText("暂不创建，返回我的外部协作")).toBeVisible();
    await inviteePage.getByLabel("企业或团队名称").fill(ownOrganizationName);
    await inviteePage.getByLabel("第一个店铺名称").fill(ownStoreName);
    await shot(inviteePage, "09-optional-own-erp-onboarding.png");
    await inviteePage.getByRole("button", { name: "创建企业并开始配置" }).click();
    await expect(inviteePage).toHaveURL(/\/setup\?welcome=1/);
    await expect(inviteePage.getByRole("heading", { name: `配置 ${ownStoreName}` })).toBeVisible();
    await shot(inviteePage, "10-same-account-enters-own-erp.png");

    const ownOrganization = await prisma.organization.findFirstOrThrow({
      where: { name: ownOrganizationName },
      select: {
        id: true,
        code: true,
        stores: { select: { id: true } },
        inventoryPools: { select: { id: true } },
      },
    });
    expect(ownOrganization.stores).toHaveLength(1);
    expect(ownOrganization.inventoryPools).toHaveLength(1);
    await expect(
      prisma.stockLedger.count({ where: { storeId: ownOrganization.stores[0].id } })
    ).resolves.toBe(0);

    await inviteePage.goto("/collaboration");
    await inviteePage.getByRole("button", { name: "申请企业合作" }).click();
    await expect(inviteePage.getByText(/已向 .* 发送企业合作申请/)).toBeVisible();
    await shot(inviteePage, "11-personal-relationship-upgraded-to-company-request.png");

    await ownerPage.goto("/settings/connections");
    await expect(ownerPage.getByText(ownOrganizationName)).toBeVisible();
    await expect(ownerPage.getByText("未关联合作方")).toBeVisible();
    await shot(ownerPage, "12-inviter-receives-company-connection-request.png");
    await ownerPage.getByRole("button", { name: "接受" }).click();
    await expect(ownerPage.getByText("企业连接已建立")).toBeVisible();
    await ownerPage.getByRole("tab", { name: "已连接企业" }).click();
    await expect(ownerPage.getByText(ownOrganizationName)).toBeVisible();
    await expect(
      ownerPage.getByText(
        "企业连接只确认双方身份，不会自动共享库存、成本、订单或资金数据；具体业务仍需货盘授权或服务协议。"
      )
    ).toBeVisible();
    await shot(ownerPage, "13-company-connection-confirmed-without-data-grant.png");

    await ownerPage.goto("/marketplace/new");
    await ownerPage.getByRole("button").filter({ hasText: "E2E QA 基础库存商品" }).click();
    const visibilityPanel = ownerPage
      .locator("div.rounded-lg")
      .filter({ hasText: "谁可以卖" })
      .first();
    await visibilityPanel.getByRole("combobox").selectOption("PARTNER_ONLY");
    await visibilityPanel.getByLabel(new RegExp(ownOrganizationName)).check();
    await ownerPage
      .getByPlaceholder(/用双方都听得懂的话写清/)
      .fill("货主收取已确认供货价，协作者企业保留供销差价；成交后由货主发货。");
    await ownerPage.getByText("更多限制与备注（可选）", { exact: true }).click();
    await ownerPage.getByLabel("货盘名称（可选）").fill(offerTitle);
    await shot(ownerPage, "14-explicit-offer-grant-to-connected-company.png");
    await ownerPage.getByRole("button", { name: "确认发布" }).click();
    await expect(ownerPage).toHaveURL(/\/marketplace\/my-offers\/[^/]+$/);
    const offerId = ownerPage.url().split("/").pop()!;

    const visibilityRule = await prisma.offerVisibility.findFirstOrThrow({
      where: { offerId },
      select: {
        partnerId: true,
        viewerOrganizationId: true,
        organizationConnectionId: true,
      },
    });
    expect(visibilityRule).toMatchObject({
      partnerId: null,
      viewerOrganizationId: ownOrganization.id,
      organizationConnectionId: expect.any(String),
    });

    await inviteePage.goto("/marketplace");
    await expect(inviteePage.getByText(offerTitle, { exact: true })).toBeVisible();
    await expect(inviteePage.getByText("内部成本", { exact: true })).toHaveCount(0);
    await shot(inviteePage, "15-own-erp-sees-only-explicitly-shared-offer.png");

    await ownerPage.goto("/settings/connections");
    await ownerPage.getByRole("tab", { name: "已连接企业" }).click();
    const connectionRow = ownerPage
      .locator("div.grid")
      .filter({ hasText: ownOrganizationName })
      .last();
    await connectionRow.getByRole("button", { name: "解除连接" }).click();
    await expect(ownerPage.getByText("企业连接已解除，历史业务记录不受影响")).toBeVisible();

    const denied = await inviteePage.goto(`/marketplace/${offerId}`);
    expect(denied?.status()).toBe(404);
    await expect(inviteePage.getByText(offerTitle, { exact: true })).toHaveCount(0);
    await shot(inviteePage, "16-disconnection-revokes-future-offer-access.png");

    await inviteeContext.close();
  });
});
