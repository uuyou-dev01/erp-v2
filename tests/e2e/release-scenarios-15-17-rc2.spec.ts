import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { createPublicCode } from "@/lib/auth/invitation-token";
import { ACTIVE_ORGANIZATION_COOKIE, ACTIVE_STORE_COOKIE } from "@/lib/auth/user-context";

const RUN_ID = Date.now().toString(36);
const PASSWORD = "e2e-notify-rc2-password-8c3fdbcd";
const ORIGIN = `http://127.0.0.1:${process.env.E2E_PORT ?? "3104"}`;
const EVIDENCE_DIR = path.join(process.cwd(), "docs/testing/releases/v0.9.0/screenshots");

mkdirSync(EVIDENCE_DIR, { recursive: true });

type Identity = {
  organizationId: string;
  storeId: string;
  userId: string;
  email: string;
};

const fixture = {
  a: null as Identity | null,
  b: null as Identity | null,
  c: null as Identity | null,
  member: null as Identity | null,
  bName: `RC 通知接收企业 ${RUN_ID}`,
  cName: `RC 相邻企业 ${RUN_ID}`,
  partnerName: `RC 定向合作方 ${RUN_ID}`,
  partnerId: "",
  collaborationCode: "",
  privateItemId: "",
  oldItemNotificationId: "",
};

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, name),
    fullPage: true,
    animations: "disabled",
  });
}

async function login(page: Page, email: string, password = PASSWORD) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();
}

async function setActiveContext(context: BrowserContext, organizationId: string, storeId: string) {
  await context.addCookies([
    {
      name: ACTIVE_ORGANIZATION_COOKIE,
      value: organizationId,
      url: ORIGIN,
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: ACTIVE_STORE_COOKIE,
      value: storeId,
      url: ORIGIN,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

function notificationRow(page: Page, title: string) {
  return page.locator("div.flex.items-start").filter({ hasText: title }).first();
}

async function createOrganization(input: { name: string; label: string; ownerEmail: string }) {
  const organization = await prisma.organization.create({
    data: {
      name: input.name,
      code: `RC_NOTIFY_${input.label}_${RUN_ID}`.toUpperCase(),
      collaborationCode: createPublicCode("ORG"),
    },
  });
  const store = await prisma.store.create({
    data: {
      organizationId: organization.id,
      name: `${input.name} 主店`,
      code: `RC_NOTIFY_${input.label}_STORE_${RUN_ID}`.toUpperCase(),
      currency: "CNY",
    },
  });
  const user = await prisma.user.create({
    data: {
      email: input.ownerEmail,
      name: `${input.name} 所有者`,
      password: await hashPassword(PASSWORD),
      role: "OWNER",
      storeId: store.id,
      emailVerifiedAt: new Date(),
      memberships: {
        create: { organizationId: organization.id, role: "OWNER", status: "ACTIVE" },
      },
      storeAccesses: { create: { storeId: store.id, role: "OWNER" } },
    },
  });
  return {
    organization,
    identity: {
      organizationId: organization.id,
      storeId: store.id,
      userId: user.id,
      email: user.email,
    } satisfies Identity,
  };
}

async function renderTextPng(
  page: Page,
  text: string,
  fontSize = 150,
  font = "Arial,sans-serif",
  weight = 700
) {
  await page.setViewportSize({ width: 1100, height: 420 });
  await page.setContent(
    `<main style="width:1100px;height:420px;background:#fff;color:#000;display:grid;place-items:center;font:${weight} ${fontSize}px ${font};letter-spacing:4px">${text}</main>`
  );
  return page.screenshot({ type: "png" });
}

async function uploadAndOcr(page: Page, buffer: Buffer, language: "chi_sim" | "jpn" | "eng") {
  const preparedResponse = await page.request.post("/api/v1/mobile/assets/presign", {
    data: {
      mimeType: "image/png",
      byteSize: buffer.byteLength,
      originalName: `${language}-${RUN_ID}.png`,
      purpose: "INTELLIGENCE_IMAGE",
      visibility: "ORGANIZATION_PRIVATE",
    },
  });
  expect(preparedResponse.ok()).toBe(true);
  const prepared = (await preparedResponse.json()) as { assetId: string; uploadUrl: string };
  const upload = await page.request.put(prepared.uploadUrl, {
    data: buffer,
    headers: { "content-type": "image/png" },
  });
  expect(upload.ok()).toBe(true);
  const response = await page.request.post("/api/v1/mobile/ocr", {
    data: { assetId: prepared.assetId, language },
    timeout: 75_000,
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as {
    text: string;
    priceCandidates: Array<{ value: string }>;
  };
}

test.describe.configure({ mode: "serial" });

test.describe("release scenarios 15-17 RC2", () => {
  test.beforeAll(async () => {
    const ownerA = await prisma.user.findUniqueOrThrow({
      where: { email: process.env.E2E_OWNER_EMAIL ?? "e2e-owner@example.invalid" },
      include: {
        memberships: { where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" } },
      },
    });
    fixture.a = {
      organizationId: ownerA.memberships[0].organizationId,
      storeId: "store_1",
      userId: ownerA.id,
      email: ownerA.email,
    };

    const b = await createOrganization({
      name: fixture.bName,
      label: "B",
      ownerEmail: `notify-b-owner-${RUN_ID}@example.invalid`,
    });
    fixture.b = b.identity;
    fixture.collaborationCode = b.organization.collaborationCode;

    const c = await createOrganization({
      name: fixture.cName,
      label: "C",
      ownerEmail: `notify-c-owner-${RUN_ID}@example.invalid`,
    });
    fixture.c = c.identity;

    await prisma.membership.create({
      data: {
        organizationId: fixture.c.organizationId,
        userId: fixture.b.userId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });
    await prisma.storeAccess.create({
      data: { storeId: fixture.c.storeId, userId: fixture.b.userId, role: "OWNER" },
    });

    const member = await prisma.user.create({
      data: {
        email: `notify-member-${RUN_ID}@example.invalid`,
        name: `RC 通知普通成员 ${RUN_ID}`,
        password: await hashPassword(PASSWORD),
        role: "WAREHOUSE",
        storeId: fixture.b.storeId,
        emailVerifiedAt: new Date(),
        memberships: {
          create: [
            { organizationId: fixture.b.organizationId, role: "WAREHOUSE", status: "ACTIVE" },
            { organizationId: fixture.c.organizationId, role: "VIEWER", status: "ACTIVE" },
          ],
        },
        storeAccesses: {
          create: [
            { storeId: fixture.b.storeId, role: "WAREHOUSE" },
            { storeId: fixture.c.storeId, role: "VIEWER" },
          ],
        },
      },
    });
    fixture.member = {
      organizationId: fixture.b.organizationId,
      storeId: fixture.b.storeId,
      userId: member.id,
      email: member.email,
    };

    const inventoryPool = await prisma.inventoryPool.findUniqueOrThrow({
      where: { legacyStoreId: fixture.b.storeId },
    });
    const location = await prisma.location.create({
      data: {
        storeId: fixture.b.storeId,
        operatorOrganizationId: fixture.b.organizationId,
        code: `RC_NOTIFY_WH_${RUN_ID}`.toUpperCase(),
        name: `RC 通知私有仓 ${RUN_ID}`,
        type: "WAREHOUSE",
        region: "CN_SHANGHAI",
      },
    });
    const sku = await prisma.sKU.create({
      data: {
        storeId: fixture.b.storeId,
        inventoryPoolId: inventoryPool.id,
        code: `RC_NOTIFY_SKU_${RUN_ID}`.toUpperCase(),
        name: `RC 停用后不可见单件 ${RUN_ID}`,
      },
    });
    const item = await prisma.itemUnit.create({
      data: {
        storeId: fixture.b.storeId,
        inventoryPoolId: inventoryPool.id,
        skuId: sku.id,
        locationId: location.id,
        unitCost: "88",
        costCurrency: "CNY",
        sourceType: "E2E_FIXTURE",
        sourceId: `RC_NOTIFY_ITEM_${RUN_ID}`,
        status: "AVAILABLE",
      },
    });
    fixture.privateItemId = item.id;

    const oldNotification = await prisma.notification.create({
      data: {
        organizationId: fixture.b.organizationId,
        storeId: fixture.b.storeId,
        recipientId: fixture.member.userId,
        refType: "ITEM_UNIT",
        refId: item.id,
        type: "LOCATION_ACCESS_ADDED",
        title: `查看企业私有单件 ${RUN_ID}`,
        body: "该入口只应在企业成员身份有效时切换到所属企业。",
        actionUrl: `/inventory/items/${encodeURIComponent(item.id)}`,
        dedupeKey: `rc2-old-item:${RUN_ID}`,
      },
    });
    fixture.oldItemNotificationId = oldNotification.id;

    const partner = await prisma.partner.create({
      data: {
        storeId: fixture.a.storeId,
        code: `RC_NOTIFY_PARTNER_${RUN_ID}`.toUpperCase(),
        name: fixture.partnerName,
        type: "RESELLER",
        status: "ACTIVE",
        defaultCurrency: "CNY",
      },
    });
    fixture.partnerId = partner.id;
  });

  test("通知矩阵保持收件人、企业上下文、深链、去重、已读与处理状态一致", async ({
    page,
    browser,
  }) => {
    test.setTimeout(210_000);
    const bContext = await browser.newContext();
    const memberContext = await browser.newContext();
    const bPage = await bContext.newPage();
    const memberPage = await memberContext.newPage();
    await login(bPage, fixture.b!.email);
    await login(memberPage, fixture.member!.email);

    await page.goto("/settings/connections");
    await page.getByRole("button", { name: "发起连接" }).click();
    await page.getByLabel("从哪个合作方建立连接").selectOption(fixture.partnerId);
    await page.getByLabel("对方企业协作码").fill(fixture.collaborationCode);
    await page.getByRole("button", { name: "查找" }).click();
    await expect(page.getByText(fixture.bName)).toBeVisible();
    await page.getByRole("button", { name: "发送连接请求" }).click();
    await expect(page.getByText(`已向 ${fixture.bName} 发出连接请求`)).toBeVisible();

    const connection = await prisma.organizationConnection.findFirstOrThrow({
      where: {
        requesterOrganizationId: fixture.a!.organizationId,
        targetOrganizationId: fixture.b!.organizationId,
      },
      select: { id: true },
    });
    const requestTitle = "E2E 默认经营主体 发来企业连接请求";
    await expect
      .poll(() =>
        prisma.notification.count({
          where: {
            recipientId: fixture.b!.userId,
            refType: "ORGANIZATION_CONNECTION",
            refId: connection.id,
            type: "ORGANIZATION_CONNECTION_REQUEST",
          },
        })
      )
      .toBe(1);
    expect(
      await prisma.notification.count({
        where: {
          recipientId: fixture.member!.userId,
          refId: connection.id,
          type: "ORGANIZATION_CONNECTION_REQUEST",
        },
      })
    ).toBe(0);

    const requestNotification = await prisma.notification.findFirstOrThrow({
      where: {
        recipientId: fixture.b!.userId,
        refId: connection.id,
        type: "ORGANIZATION_CONNECTION_REQUEST",
      },
      include: { outbox: true },
    });
    await expect
      .poll(
        async () =>
          (
            await prisma.notificationOutbox.findUniqueOrThrow({
              where: { notificationId: requestNotification.id },
            })
          ).status
      )
      .toBe("SKIPPED");

    await setActiveContext(bContext, fixture.c!.organizationId, fixture.c!.storeId);
    await bPage.goto("/notifications");
    const requestRow = notificationRow(bPage, requestTitle);
    await expect(requestRow).toContainText(fixture.bName);
    await expect(requestRow.getByText("待处理", { exact: true })).toBeVisible();
    await shot(bPage, "15-01-connection-request-recipient-context-rc2.png");

    await requestRow.getByRole("button", { name: `将“${requestTitle}”标记为已读` }).click();
    await expect(requestRow.getByText("未读", { exact: true })).toHaveCount(0);
    expect(
      (
        await prisma.notification.findUniqueOrThrow({
          where: { id: requestNotification.id },
          select: { readAt: true },
        })
      ).readAt
    ).not.toBeNull();
    await shot(bPage, "15-02-connection-request-marked-read-rc2.png");

    await requestRow.getByRole("link", { name: requestTitle }).click();
    await expect(bPage).toHaveURL(/\/settings\/connections$/);
    await expect(bPage.getByLabel("当前经营主体")).toHaveValue(fixture.b!.organizationId);
    await expect(bPage.getByText("E2E 默认经营主体", { exact: true })).toBeVisible();
    await shot(bPage, "15-03-notification-deep-link-switches-organization-rc2.png");
    await bPage.getByRole("button", { name: "接受" }).click();
    await expect(bPage.getByText("企业连接已建立")).toBeVisible();

    await bPage.goto("/notifications");
    await expect(
      notificationRow(bPage, requestTitle).getByText("已接受", { exact: true })
    ).toBeVisible();
    await shot(bPage, "15-04-connection-request-reconciled-handled-rc2.png");

    const offerTitle = `RC 通知定向货盘 ${RUN_ID}`;
    await page.goto("/marketplace/new");
    await expect(page.getByRole("heading", { name: "发布货盘", exact: true })).toBeVisible();
    await page.getByRole("button").filter({ hasText: "E2E QA 基础库存商品" }).click();
    const visibilityPanel = page.locator("div.rounded-lg").filter({ hasText: "谁可以卖" }).first();
    await visibilityPanel.getByRole("combobox").selectOption("PARTNER_ONLY");
    await visibilityPanel.getByLabel(fixture.partnerName).check();
    await page
      .getByPlaceholder(/用双方都听得懂的话写清/)
      .fill("供货价锁定，代卖方保留供销差价；成交后由货主发货。");
    await page.getByText("更多限制与备注（可选）", { exact: true }).click();
    await page.getByLabel("货盘名称（可选）").fill(offerTitle);
    await page.getByRole("button", { name: "确认发布" }).click();
    await expect(page).toHaveURL(/\/marketplace\/my-offers\//);

    const offer = await prisma.supplyOffer.findFirstOrThrow({
      where: { title: offerTitle },
      select: { id: true },
    });
    const offerNotification = await prisma.notification.findFirstOrThrow({
      where: {
        recipientId: fixture.b!.userId,
        refType: "SUPPLY_OFFER",
        refId: offer.id,
        type: "SUPPLY_OFFER_STATUS_CHANGED",
      },
      include: { outbox: true },
    });
    expect(offerNotification.resolutionCode).toBe("INFORMATIONAL");
    await expect
      .poll(
        async () =>
          (
            await prisma.notificationOutbox.findUniqueOrThrow({
              where: { notificationId: offerNotification.id },
            })
          ).status
      )
      .toBe("SKIPPED");

    await bPage.goto("/notifications");
    const offerRow = notificationRow(bPage, offerNotification.title);
    await expect(offerRow).toContainText("结果通知");
    await shot(bPage, "15-05-directed-offer-notification-and-outbox-rc2.png");
    await offerRow.getByRole("link", { name: "查看相关记录" }).click();
    await expect(bPage).toHaveURL(new RegExp(`/marketplace/${offer.id}$`));
    await expect(bPage.getByRole("heading", { name: offerTitle })).toBeVisible();
    await shot(bPage, "15-06-directed-offer-notification-deep-link-rc2.png");

    await bPage.goto("/settings/connections");
    await bPage.getByRole("tab", { name: "已连接企业" }).click();
    await bPage.getByRole("button", { name: "解除连接" }).click();
    await expect(bPage.getByText(/企业连接已解除/)).toBeVisible();
    await shot(bPage, "17-01-organization-connection-ended-rc2.png");

    const revokedOfferResponse = await bPage.goto(
      `/notifications/open/${encodeURIComponent(offerNotification.id)}`
    );
    expect(revokedOfferResponse?.status()).toBe(404);
    await expect(bPage.getByRole("heading", { name: "没有找到这个页面" })).toBeVisible();
    await shot(bPage, "17-02-old-offer-notification-denied-after-disconnect-rc2.png");

    await page.goto("/notifications");
    const endedTitle = `${fixture.bName} 已解除企业连接`;
    await expect(notificationRow(page, endedTitle)).toContainText("结果通知");
    await shot(page, "15-07-connection-ended-counterparty-notification-rc2.png");

    await setActiveContext(memberContext, fixture.c!.organizationId, fixture.c!.storeId);
    await memberPage.goto("/notifications");
    const oldItemTitle = `查看企业私有单件 ${RUN_ID}`;
    await notificationRow(memberPage, oldItemTitle)
      .getByRole("link", { name: oldItemTitle })
      .click();
    await expect(memberPage).toHaveURL(new RegExp(`/inventory/items/${fixture.privateItemId}$`));
    await expect(
      memberPage.getByRole("heading", { name: `RC 停用后不可见单件 ${RUN_ID}` })
    ).toBeVisible();
    await shot(memberPage, "17-03-active-member-old-notification-object-visible-rc2.png");

    await bPage.goto("/settings/team");
    const memberRow = bPage.getByRole("row").filter({ hasText: fixture.member!.email });
    await memberRow.getByRole("button", { name: "停用" }).click();
    await expect(bPage.getByText("成员已停用")).toBeVisible();
    await expect(memberRow.getByText("停用", { exact: true })).toBeVisible();
    await shot(bPage, "17-04-member-deactivated-by-owner-rc2.png");

    await memberPage.goto("/notifications");
    await expect(memberPage.getByText("你的企业成员身份已停用", { exact: true })).toBeVisible();
    await shot(memberPage, "17-05-deactivated-member-old-and-new-notifications-rc2.png");
    const oldDeepLinkResponse = await memberPage.goto(
      `/notifications/open/${encodeURIComponent(fixture.oldItemNotificationId)}`
    );
    expect(oldDeepLinkResponse?.status()).toBe(404);
    await expect(memberPage.getByRole("heading", { name: "没有找到这个页面" })).toBeVisible();
    await shot(memberPage, "17-06-old-notification-denied-after-member-deactivation-rc2.png");
    const directItemAttempt = await memberContext.request.get(
      `/inventory/items/${fixture.privateItemId}`,
      { maxRedirects: 0 }
    );
    expect([302, 303, 307, 308]).toContain(directItemAttempt.status());
    expect(directItemAttempt.headers().location).toContain("access=denied");

    const runtimeNotifications = await prisma.notification.findMany({
      where: {
        OR: [
          { refType: "ORGANIZATION_CONNECTION", refId: connection.id },
          { refType: "SUPPLY_OFFER", refId: offer.id },
          {
            recipientId: fixture.member!.userId,
            type: "MEMBERSHIP_DEACTIVATED",
          },
        ],
      },
      include: { outbox: true },
    });
    expect(runtimeNotifications.length).toBeGreaterThanOrEqual(5);
    expect(runtimeNotifications.every((notification) => notification.outbox)).toBe(true);
    await expect
      .poll(async () => {
        const rows = await prisma.notificationOutbox.findMany({
          where: {
            notificationId: { in: runtimeNotifications.map((item) => item.id) },
          },
          select: { status: true, lastError: true },
        });
        return rows.every(
          (row) => row.status === "SKIPPED" && row.lastError === "Web Push 尚未配置"
        );
      })
      .toBe(true);

    await bContext.close();
    await memberContext.close();
  });

  test("移动端真实完成任务、中文日文英文 OCR、网页读取与 Web Push 能力边界", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/m");
    await expect(page.getByRole("heading", { name: /好，E2E/ })).toBeVisible();
    await expect
      .poll(async () => (await page.request.get("/api/v1/mobile/devices")).status())
      .toBe(200);

    await page.goto("/m/capture/purchase");
    await page.getByPlaceholder("卖家备注名").fill(`RC 移动任务卖家 ${RUN_ID}`);
    await page.getByPlaceholder("可留空").fill(`RC-MOBILE-${RUN_ID}`);
    await page.getByLabel("商品 1 名称").fill(`RC 移动购入商品 ${RUN_ID}`);
    await page.getByLabel("商品 1 规格").fill("中日验收版");
    await page.getByLabel("商品 1 数量").fill("1");
    await page.getByLabel("商品 1 单价").fill("399");
    await page.getByRole("button", { name: "这是新商品，创建待整理 SKU" }).click();
    await page.getByRole("button", { name: "确认已经购买" }).click();
    await expect(page.getByText("购入已登记，后续物流节点已进入待办")).toBeVisible();
    await page.goto("/m/tasks");
    const task = page
      .locator("a")
      .filter({ hasText: `RC 移动任务卖家 ${RUN_ID}` })
      .first();
    await expect(task).toBeVisible();
    await shot(page, "16-01-mobile-task-created-and-visible-rc2.png");
    await task.click();
    await expect(page.getByText("填写物流", { exact: true }).first()).toBeVisible();
    await page.getByPlaceholder("扫描或粘贴单号").fill(`SF${RUN_ID.toUpperCase()}987654`);
    const destination = page
      .locator("select")
      .filter({ has: page.locator("option", { hasText: "选择仓库或集运点" }) });
    await destination.selectOption({ index: 1 });
    await shot(page, "16-02-mobile-task-logistics-before-submit-rc2.png");
    await page.getByRole("button", { name: "填写物流" }).click();
    await expect(page).toHaveURL(/\/m$/);

    const renderPage = await page.context().newPage();
    const chinesePng = await renderTextPng(renderPage, "售价 1288 元", 140);
    const japanesePng = await renderTextPng(
      renderPage,
      "2980 円",
      180,
      "'Courier New',monospace",
      400
    );
    const englishPng = await renderTextPng(renderPage, "PRICE 39.99 USD", 130);
    await renderPage.close();

    await page.goto("/m/capture/price");
    await page.locator('input[type="file"]').setInputFiles({
      name: `chi-${RUN_ID}.png`,
      mimeType: "image/png",
      buffer: chinesePng,
    });
    await expect(page.getByText("已添加 1 张")).toBeVisible();
    await page.getByRole("button", { name: "识别最近一张截图" }).click();
    await expect(page.getByText(/识别到|已识别文字/)).toBeVisible({ timeout: 75_000 });
    await expect(page.getByPlaceholder("0.00")).toHaveValue(/1288/);
    await shot(page, "16-03-mobile-chinese-ocr-result-rc2.png");

    const japaneseResult = await uploadAndOcr(page, japanesePng, "jpn");
    expect(japaneseResult.text.length).toBeGreaterThan(0);
    expect(japaneseResult.text).toContain("円");
    const englishResult = await uploadAndOcr(page, englishPng, "eng");
    expect(englishResult.text).toMatch(/39[.,]99/);
    expect(englishResult.priceCandidates.length).toBeGreaterThan(0);

    await page
      .getByPlaceholder("粘贴 Mercari、闲鱼等商品链接")
      .fill("https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html");
    await page.getByRole("button", { name: "读取商品链接" }).click();
    await expect(page.getByText(/已读取商品/)).toBeVisible({ timeout: 60_000 });
    await shot(page, "17-07-mobile-web-product-link-preview-rc2.png");

    const pushConfig = await page.request.get("/api/v1/mobile/push-subscriptions");
    expect(pushConfig.ok()).toBe(true);
    expect((await pushConfig.json()) as { enabled: boolean }).toMatchObject({ enabled: false });
    await page.goto("/m/me");
    await expect(page.getByRole("heading", { name: "我的" })).toBeVisible();
    await expect(page.getByRole("button", { name: "待配置" })).toBeVisible();
    await expect(page.getByText("提醒节奏")).toBeVisible();
    await shot(page, "17-08-mobile-push-unconfigured-boundary-rc2.png");
  });
});
