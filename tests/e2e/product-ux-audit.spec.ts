import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "@/lib/prisma";

const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL ?? "e2e-owner@example.invalid";
const EVIDENCE_ROOT = path.join(
  process.cwd(),
  "docs/testing/releases/v0.9.0/product-ux-audit/screenshots"
);
const AFTER_DIR = path.join(EVIDENCE_ROOT, "after");

mkdirSync(AFTER_DIR, { recursive: true });

const auditFixture = {
  skuId: "",
};

async function screenshot(page: Page, name: string, fullPage = true) {
  await page.screenshot({
    path: path.join(AFTER_DIR, name),
    fullPage,
    animations: "disabled",
  });
}

test.describe.configure({ mode: "serial" });

test.describe("v0.9.0 product UX fixed-state evidence", () => {
  test.beforeAll(async () => {
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: OWNER_EMAIL },
      include: { memberships: { where: { status: "ACTIVE" }, take: 1 } },
    });
    const mainOrganizationId = owner.memberships[0].organizationId;

    const secondStore = await prisma.store.upsert({
      where: { code: "E2E_UX_SECOND_STORE" },
      update: {
        organizationId: mainOrganizationId,
        name: "E2E 华东备用店铺",
        currency: "CNY",
      },
      create: {
        organizationId: mainOrganizationId,
        code: "E2E_UX_SECOND_STORE",
        name: "E2E 华东备用店铺",
        currency: "CNY",
      },
    });
    await prisma.storeAccess.upsert({
      where: { storeId_userId: { storeId: secondStore.id, userId: owner.id } },
      update: { role: "OWNER" },
      create: { storeId: secondStore.id, userId: owner.id, role: "OWNER" },
    });

    const secondOrganization = await prisma.organization.upsert({
      where: { code: "E2E_UX_SECOND_ORG" },
      update: { name: "E2E 日本业务主体" },
      create: { code: "E2E_UX_SECOND_ORG", name: "E2E 日本业务主体" },
    });
    await prisma.membership.upsert({
      where: {
        organizationId_userId: {
          organizationId: secondOrganization.id,
          userId: owner.id,
        },
      },
      update: { role: "OWNER", status: "ACTIVE" },
      create: {
        organizationId: secondOrganization.id,
        userId: owner.id,
        role: "OWNER",
        status: "ACTIVE",
      },
    });
    const japanStore = await prisma.store.upsert({
      where: { code: "E2E_UX_JAPAN_STORE" },
      update: {
        organizationId: secondOrganization.id,
        name: "E2E 日本业务店铺",
        currency: "JPY",
      },
      create: {
        organizationId: secondOrganization.id,
        code: "E2E_UX_JAPAN_STORE",
        name: "E2E 日本业务店铺",
        currency: "JPY",
      },
    });
    await prisma.storeAccess.upsert({
      where: { storeId_userId: { storeId: japanStore.id, userId: owner.id } },
      update: { role: "OWNER" },
      create: { storeId: japanStore.id, userId: owner.id, role: "OWNER" },
    });

    const sku = await prisma.sKU.findUniqueOrThrow({
      where: { storeId_code: { storeId: "store_1", code: "E2E-QA-STOCK-001" } },
      select: { id: true },
    });
    auditFixture.skuId = sku.id;
    await prisma.notification.upsert({
      where: {
        recipientId_dedupeKey: {
          recipientId: owner.id,
          dedupeKey: "e2e-product-ux-audit-deep-link",
        },
      },
      update: {
        organizationId: mainOrganizationId,
        storeId: "store_1",
        type: "PRODUCT_RECORD_READY",
        title: "商品资料已完成复核",
        body: "E2E QA 基础库存商品已完成复核，可打开商品档案继续查看库存。",
        refType: "SKU",
        refId: sku.id,
        actionUrl: `/inventory/skus/${sku.id}`,
        readAt: null,
        resolvedAt: null,
      },
      create: {
        organizationId: mainOrganizationId,
        storeId: "store_1",
        recipientId: owner.id,
        type: "PRODUCT_RECORD_READY",
        title: "商品资料已完成复核",
        body: "E2E QA 基础库存商品已完成复核，可打开商品档案继续查看库存。",
        refType: "SKU",
        refId: sku.id,
        actionUrl: `/inventory/skus/${sku.id}`,
        dedupeKey: "e2e-product-ux-audit-deep-link",
      },
    });
  });

  test("desktop structure, navigation grouping and global entry points", async ({ page }) => {
    await page.goto("/workbench");
    await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();
    await expect(page.locator("header").getByText("企业", { exact: true })).toBeVisible();
    await expect(page.locator("header").getByText("店铺", { exact: true })).toBeVisible();
    await screenshot(page, "01-desktop-workbench-navigation.png");

    await page.getByRole("button", { name: "个人与账号设置" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await screenshot(page, "02-desktop-account-context-menu.png", false);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "打开全局搜索" }).click();
    await expect(page.getByRole("dialog", { name: "全局搜索与快捷操作" })).toBeVisible();
    await expect(page.getByRole("button", { name: "关闭全局搜索" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "快速录入 采购 / 物流 / 上架 / 售出" })
    ).toBeVisible();
    await screenshot(page, "03-desktop-command-palette.png", false);
  });

  test("list to detail to contextual action result", async ({ page }) => {
    await page.goto("/inventory/skus");
    await expect(page.getByRole("heading", { name: "商品档案" })).toBeVisible();
    await screenshot(page, "04-desktop-inventory-list.png");

    await page.getByRole("link", { name: "E2E QA 基础库存商品", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/inventory/skus/${auditFixture.skuId}`));
    await expect(page.getByRole("heading", { name: "E2E QA 基础库存商品" })).toBeVisible();
    await screenshot(page, "05-desktop-inventory-detail.png");

    await page.getByRole("link", { name: /库存与上架/ }).click();
    await expect(page.getByRole("link", { name: /库存与上架/ })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await screenshot(page, "06-desktop-inventory-action-result.png");
  });

  test("notification deep link and settings discoverability", async ({ page }) => {
    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: "通知" })).toBeVisible();
    await expect(page.getByText("E2E 默认经营主体 · 商品资料")).toBeVisible();
    await screenshot(page, "07-desktop-notifications.png");

    await page.getByRole("link", { name: "商品资料已完成复核" }).click();
    await expect(page).toHaveURL(new RegExp(`/inventory/skus/${auditFixture.skuId}`));
    await screenshot(page, "08-desktop-notification-deep-link.png");

    await page.getByRole("button", { name: "个人与账号设置" }).click();
    await page.getByRole("menuitem", { name: "企业设置" }).click();
    await expect(page.getByRole("heading", { name: "企业设置" })).toBeVisible();
    await screenshot(page, "09-desktop-settings-hub.png");
  });

  test("empty and not-found states", async ({ page }) => {
    await page.goto("/marketplace");
    await expect(page.getByRole("heading", { name: "货盘市场" })).toBeVisible();
    await screenshot(page, "10-desktop-empty-marketplace.png");

    await page.goto("/inventory/skus/not-a-real-sku");
    await expect(page.getByRole("heading", { name: "没有找到这个页面" })).toBeVisible();
    await expect(page.getByRole("link", { name: "返回工作台" })).toBeVisible();
    await screenshot(page, "11-desktop-error-404.png", false);
  });

  test("small dashboard navigation and account context", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/workbench");
    await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();

    await page.getByRole("button", { name: "个人与账号设置" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page.getByLabel("移动端当前经营主体")).toBeVisible();
    await expect(page.getByLabel("移动端当前店铺")).toBeVisible();
    await screenshot(page, "12-small-dashboard-account-menu.png", false);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "打开主导航" }).click();
    await expect(page.getByRole("dialog", { name: "主导航" })).toBeVisible();
    await expect(page.getByRole("button", { name: "关闭侧边栏" })).toBeVisible();
    await expect(page.getByRole("button", { name: "关闭侧边栏" })).toBeFocused();
    await expect(page.getByText("跨境贸易 ERP", { exact: true }).last()).toBeVisible();
    await screenshot(page, "13-small-dashboard-sidebar.png", false);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "主导航" })).toBeHidden();
    await expect(page.getByRole("button", { name: "打开主导航" })).toBeFocused();
  });

  test("mobile home, identity context and notification state", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/m");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("E2E 默认经营主体 · E2E 默认店铺")).toBeVisible();
    const viewportContent = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(viewportContent).not.toContain("maximum-scale");
    await screenshot(page, "14-mobile-home.png", false);

    await page.goto("/m/me");
    await expect(page.getByRole("heading", { name: "我的" })).toBeVisible();
    await expect(page.getByText(/E2E 默认经营主体 · STORE_1/)).toBeVisible();
    await expect(page.getByRole("button", { name: "保存提醒设置" })).toBeVisible();
    await screenshot(page, "15-mobile-me-context.png", false);

    await page.goto("/m/notifications");
    await expect(page.getByRole("heading", { name: "消息" })).toBeVisible();
    await expect(page.getByText("E2E 默认经营主体 · E2E 默认店铺")).toBeVisible();
    await expect(page.getByRole("link", { name: /商品资料已完成复核/ })).toHaveAttribute(
      "href",
      /\/notifications\/open\//
    );
    await screenshot(page, "16-mobile-notifications.png", false);
  });
});
