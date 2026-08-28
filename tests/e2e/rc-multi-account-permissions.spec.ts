import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { createPublicCode } from "@/lib/auth/invitation-token";

const runId = Date.now().toString(36);
const password = "rc-permission-password";
const evidenceDir = path.join(process.cwd(), "docs/testing/releases/v0.9.0/screenshots");
mkdirSync(evidenceDir, { recursive: true });

type Fixture = {
  defaultOrganizationId: string;
  defaultStoreId: string;
  extraStoreId: string;
  extraStoreName: string;
  secondOrganizationId: string;
  secondOrganizationName: string;
  secondStoreIds: string[];
  removedItemId: string;
  ownerEmail: string;
  roleUsers: Record<string, { id: string; email: string }>;
  targetUserId: string;
  targetEmail: string;
};

let fixture: Fixture;

async function shot(page: Page, filename: string) {
  await expect(page.getByText("加载工作台...", { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: path.join(evidenceDir, filename),
    fullPage: true,
    animations: "disabled",
  });
}

async function login(browser: Browser, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();
  return { context, page };
}

async function selectContextOption(page: Page, label: string, value: string) {
  const cookieName =
    label === "当前经营主体" ? "erp_active_organization_id" : "erp_active_store_id";
  await page.getByLabel(label).selectOption(value);
  await expect
    .poll(async () => {
      const cookies = await page.context().cookies();
      return cookies.find((cookie) => cookie.name === cookieName)?.value;
    })
    .toBe(value);
  await page.reload();
  await expect(page.getByLabel(label)).toHaveValue(value);
}

async function createRoleUser(input: {
  organizationId: string;
  storeId: string;
  role: string;
  label: string;
  emailKey?: string;
}) {
  const email = `rc-${input.emailKey ?? input.role.toLowerCase()}-${runId}@example.test`;
  const user = await prisma.user.create({
    data: {
      email,
      name: `RC ${input.label}`,
      password: await hashPassword(password),
      role: input.role,
      storeId: input.storeId,
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.membership.create({
    data: {
      organizationId: input.organizationId,
      userId: user.id,
      role: input.role,
      status: "ACTIVE",
    },
  });
  await prisma.storeAccess.create({
    data: { storeId: input.storeId, userId: user.id, role: input.role },
  });
  return { id: user.id, email };
}

test.describe.serial("v0.9.0 RC multi-account and authorization evidence", () => {
  test.beforeAll(async () => {
    const ownerEmail = process.env.E2E_OWNER_EMAIL ?? "e2e-owner@example.invalid";
    const [owner, defaultOrganization, defaultStore] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { email: ownerEmail } }),
      prisma.organization.findUniqueOrThrow({ where: { code: "e2e-main" } }),
      prisma.store.findUniqueOrThrow({ where: { id: "store_1" } }),
    ]);

    const extraStoreName = "RC 多店二号";
    const extraStore = await prisma.store.create({
      data: {
        organizationId: defaultOrganization.id,
        name: extraStoreName,
        code: `RC-A2-${runId}`.toUpperCase(),
        currency: "CNY",
      },
    });
    await prisma.storeAccess.create({
      data: { storeId: extraStore.id, userId: owner.id, role: "OWNER" },
    });
    const extraLocation = await prisma.location.create({
      data: {
        storeId: extraStore.id,
        code: `RC-WH-${runId}`.toUpperCase(),
        name: "RC 二号店仓库",
        type: "WAREHOUSE",
      },
    });
    const removedSku = await prisma.sKU.create({
      data: {
        storeId: extraStore.id,
        code: `RC-SCOPE-${runId}`.toUpperCase(),
        name: "RC 范围隔离商品",
        catalogRole: "SIMPLE",
        nameSource: "MANUAL",
        codeSource: "MANUAL",
      },
    });
    const removedItem = await prisma.itemUnit.create({
      data: {
        storeId: extraStore.id,
        skuId: removedSku.id,
        locationId: extraLocation.id,
        unitCost: "100",
        costCurrency: "CNY",
        sourceType: "MANUAL",
        sourceId: `rc-scope-${runId}`,
        status: "AVAILABLE",
      },
    });

    const secondOrganizationName = "RC 第二经营主体";
    const secondOrganization = await prisma.organization.create({
      data: {
        name: secondOrganizationName,
        code: `RC-B-${runId}`.toUpperCase(),
        collaborationCode: createPublicCode("ORG"),
      },
    });
    const secondStores = await Promise.all(
      ["东京店", "大阪店"].map((name, index) =>
        prisma.store.create({
          data: {
            organizationId: secondOrganization.id,
            name: `RC ${name}`,
            code: `RC-B${index + 1}-${runId}`.toUpperCase(),
            currency: "JPY",
          },
        })
      )
    );
    await prisma.membership.create({
      data: {
        organizationId: secondOrganization.id,
        userId: owner.id,
        role: "OWNER",
        status: "ACTIVE",
      },
    });
    await prisma.storeAccess.createMany({
      data: secondStores.map((store) => ({ storeId: store.id, userId: owner.id, role: "OWNER" })),
    });

    const roleUsers: Fixture["roleUsers"] = {};
    for (const [role, label] of [
      ["ADMIN", "管理员"],
      ["FINANCE", "财务"],
      ["PROCUREMENT", "采购"],
      ["WAREHOUSE", "仓库"],
      ["FULFILLMENT", "履约"],
    ] as const) {
      roleUsers[role] = await createRoleUser({
        organizationId: defaultOrganization.id,
        storeId: defaultStore.id,
        role,
        label,
      });
    }

    const target = await createRoleUser({
      organizationId: defaultOrganization.id,
      storeId: defaultStore.id,
      role: "FULFILLMENT",
      label: "范围成员",
      emailKey: "scope-member",
    });
    await prisma.storeAccess.create({
      data: { storeId: extraStore.id, userId: target.id, role: "FULFILLMENT" },
    });
    await prisma.locationAccess.upsert({
      where: { locationId_userId: { locationId: extraLocation.id, userId: target.id } },
      update: { role: "FULFILLMENT", permissions: { ship: true } },
      create: {
        locationId: extraLocation.id,
        userId: target.id,
        role: "FULFILLMENT",
        permissions: { ship: true },
      },
    });
    await prisma.membership.create({
      data: {
        organizationId: secondOrganization.id,
        userId: target.id,
        role: "FULFILLMENT",
        status: "ACTIVE",
      },
    });
    await prisma.storeAccess.create({
      data: { storeId: secondStores[0].id, userId: target.id, role: "FULFILLMENT" },
    });

    fixture = {
      defaultOrganizationId: defaultOrganization.id,
      defaultStoreId: defaultStore.id,
      extraStoreId: extraStore.id,
      extraStoreName,
      secondOrganizationId: secondOrganization.id,
      secondOrganizationName,
      secondStoreIds: secondStores.map((store) => store.id),
      removedItemId: removedItem.id,
      ownerEmail,
      roleUsers,
      targetUserId: target.id,
      targetEmail: target.email,
    };
  });

  test.afterAll(async () => {
    if (!fixture) return;
    const userIds = [
      ...Object.values(fixture.roleUsers).map((user) => user.id),
      fixture.targetUserId,
    ];
    await prisma.notification.deleteMany({ where: { recipientId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: fixture.ownerEmail } });
    await prisma.storeAccess.deleteMany({
      where: { userId: owner.id, storeId: { in: fixture.secondStoreIds } },
    });
    await prisma.membership.deleteMany({
      where: { userId: owner.id, organizationId: fixture.secondOrganizationId },
    });
    await prisma.store.deleteMany({ where: { id: { in: fixture.secondStoreIds } } });
    await prisma.organization.deleteMany({ where: { id: fixture.secondOrganizationId } });
    await prisma.itemUnit.deleteMany({ where: { id: fixture.removedItemId } });
    await prisma.storeAccess.deleteMany({ where: { storeId: fixture.extraStoreId } });
    await prisma.store.deleteMany({ where: { id: fixture.extraStoreId } });
  });

  test("02 multi-organization and store switches survive refresh and isolate direct links", async ({
    page,
  }) => {
    await page.goto("/workbench");
    await expect(page.getByLabel("当前经营主体")).toHaveValue(fixture.defaultOrganizationId);
    await expect(page.getByLabel("当前店铺")).toHaveValue(fixture.defaultStoreId);
    await shot(page, "02-01-multi-org-store-before-switch-rc1.png");

    await selectContextOption(page, "当前店铺", fixture.extraStoreId);
    await shot(page, "02-02-second-store-selected-rc1.png");
    await page.reload();
    await expect(page.getByLabel("当前店铺")).toHaveValue(fixture.extraStoreId);
    await shot(page, "02-03-store-selection-survives-refresh-rc1.png");

    await selectContextOption(page, "当前经营主体", fixture.secondOrganizationId);
    await expect(page.getByLabel("当前店铺").locator("option")).toHaveCount(2);
    await shot(page, "02-04-second-organization-view-rc1.png");

    await page.goto(`/inventory/items/${fixture.removedItemId}`);
    await shot(page, "02-05-cross-organization-direct-link-blocked-rc1.png");
    await expect(page.getByRole("heading", { name: "RC 范围隔离商品" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "没有找到这个页面" })).toBeVisible();

    await page.goto("/workbench");
    await selectContextOption(page, "当前经营主体", fixture.defaultOrganizationId);
    await selectContextOption(page, "当前店铺", fixture.defaultStoreId);
  });

  test("03 role menus and direct URLs follow server-side authorization", async ({
    browser,
    page,
  }) => {
    await page.goto("/workbench");
    await page.getByRole("button", { name: "个人与账号设置" }).click();
    await expect(page.getByRole("menuitem", { name: "企业设置" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "系统设置" })).toBeVisible();
    await shot(page, "03-01-owner-menu-rc1.png");

    const expectations = [
      {
        role: "ADMIN",
        screenshot: "03-02-admin-menu-rc1.png",
        visible: ["采购单据", "库存管理", "经营报表"],
        allowed: "/settings/team",
      },
      {
        role: "FINANCE",
        screenshot: "03-03-finance-menu-rc1.png",
        visible: ["经营报表", "工作量"],
        hidden: ["采购单据", "库存管理"],
        allowed: "/finance/settlements",
        denied: "/procurement",
        deniedShot: "03-07-finance-direct-url-blocked-rc1.png",
      },
      {
        role: "PROCUREMENT",
        screenshot: "03-04-procurement-menu-rc1.png",
        visible: ["采购单据", "集运物流", "库存管理"],
        hidden: ["经营报表", "销售订单"],
        allowed: "/procurement",
        denied: "/finance/settlements",
        deniedShot: "03-08-procurement-direct-url-blocked-rc1.png",
      },
      {
        role: "WAREHOUSE",
        screenshot: "03-05-warehouse-menu-rc1.png",
        visible: ["集运物流", "代发履约", "库存管理"],
        hidden: ["采购单据", "经营报表"],
        allowed: "/inventory/items",
        denied: "/finance/settlements",
        deniedShot: "03-09-warehouse-direct-url-blocked-rc1.png",
      },
      {
        role: "FULFILLMENT",
        screenshot: "03-06-fulfillment-menu-rc1.png",
        visible: ["集运物流", "代发履约"],
        hidden: ["采购单据", "经营报表"],
        allowed: "/fulfillment/requests",
        denied: "/settings/team",
        deniedShot: "03-10-fulfillment-direct-url-blocked-rc1.png",
      },
    ];

    for (const expectation of expectations) {
      const actor = fixture.roleUsers[expectation.role];
      const { context, page: actorPage } = await login(browser, actor.email);
      try {
        const sidebar = actorPage.getByRole("complementary");
        for (const label of expectation.visible) {
          await expect(sidebar.getByText(label, { exact: true }).first()).toBeVisible();
        }
        for (const label of expectation.hidden ?? []) {
          await expect(sidebar.getByText(label, { exact: true })).toHaveCount(0);
        }
        await shot(actorPage, expectation.screenshot);
        await actorPage.goto(expectation.allowed);
        await expect(actorPage).not.toHaveURL(/access=denied/);
        if (expectation.denied && expectation.deniedShot) {
          await actorPage.goto(expectation.denied);
          await expect(actorPage).toHaveURL(/\/workbench\?access=denied/);
          await expect(
            actorPage.getByRole("alert").filter({ hasText: "当前角色无权访问" })
          ).toContainText("当前角色无权访问");
          await shot(actorPage, expectation.deniedShot);
        }
      } finally {
        await context.close();
      }
    }
  });

  test("04 scope change and deactivation revoke only the current organization", async ({
    browser,
    page,
  }) => {
    const { context: targetContext, page: targetPage } = await login(browser, fixture.targetEmail);
    try {
      await targetPage.goto("/workbench");
      if (
        (await targetPage.getByLabel("当前经营主体").inputValue()) !== fixture.defaultOrganizationId
      ) {
        await selectContextOption(targetPage, "当前经营主体", fixture.defaultOrganizationId);
      }
      await expect(targetPage.getByLabel("当前店铺")).toHaveCount(1);
      await shot(targetPage, "04-01-member-scope-before-change-rc1.png");

      await page.goto("/settings/team");
      const memberRow = page.getByRole("row").filter({ hasText: fixture.targetEmail });
      await expect(memberRow).toContainText("打包/发货");
      await expect(memberRow).toContainText(fixture.extraStoreName);
      await memberRow.getByRole("button", { name: "权限" }).click();
      await shot(page, "04-02-owner-role-scope-before-change-rc1.png");

      await page.getByLabel("角色", { exact: true }).last().selectOption("WAREHOUSE");
      await page.getByLabel(fixture.extraStoreName).uncheck();
      await page.getByRole("button", { name: "保存权限" }).click();
      await expect(page.getByRole("status")).toContainText("成员权限已更新");
      await shot(page, "04-03-owner-updated-role-and-scope-rc1.png");

      await targetPage.reload();
      await expect(targetPage.getByLabel("当前店铺")).toHaveCount(0);
      await expect(
        targetPage.getByRole("complementary").getByText("采购单据", { exact: true })
      ).toHaveCount(0);
      await shot(targetPage, "04-04-member-warehouse-scope-result-rc1.png");

      await targetPage.goto(`/inventory/items/${fixture.removedItemId}`);
      await shot(targetPage, "04-05-removed-store-direct-item-blocked-rc1.png");
      await expect(targetPage.getByRole("heading", { name: "RC 范围隔离商品" })).toHaveCount(0);
      await expect(targetPage.getByRole("heading", { name: "没有找到这个页面" })).toBeVisible();

      await page.goto("/settings/team");
      await page
        .getByRole("row")
        .filter({ hasText: fixture.targetEmail })
        .getByRole("button", { name: "停用" })
        .click();
      await expect(page.getByRole("status")).toContainText("成员已停用");
      await shot(page, "04-06-owner-deactivated-member-rc1.png");

      await targetPage.goto("/settings/personal");
      await expect(targetPage.getByText(fixture.secondOrganizationName)).toBeVisible();
      await expect(targetPage.getByText("E2E 默认经营主体")).toHaveCount(0);
      await shot(targetPage, "04-07-other-organization-remains-active-rc1.png");

      await targetPage.goto(`/inventory/items/${fixture.removedItemId}`);
      await shot(targetPage, "04-08-deactivated-organization-object-blocked-rc1.png");
      await expect(targetPage.getByRole("heading", { name: "RC 范围隔离商品" })).toHaveCount(0);
      await expect(targetPage.getByRole("heading", { name: "没有找到这个页面" })).toBeVisible();
    } finally {
      await targetContext.close();
    }
  });
});
