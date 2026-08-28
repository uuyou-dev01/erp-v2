import { mkdirSync } from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { hashPassword } from "@/lib/auth/password";
import { organizationPairKey } from "@/lib/application/organization-connections";
import { prisma } from "@/lib/prisma";

const STORE_ID = "store_1";
const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL ?? "e2e-owner@example.invalid";
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD ?? "e2e-owner-password-7fd243e68c2d4b33";
const ACTOR_PASSWORD = "e2e-release-actor-password-37f3ad92503f";
const EVIDENCE_DIR = path.join(process.cwd(), "docs/testing/releases/v0.9.0/screenshots");

mkdirSync(EVIDENCE_DIR, { recursive: true });

type Identity = {
  organizationId: string;
  storeId: string;
  userId: string;
  email: string;
};

const fixture = {
  ownerOrganizationId: "",
  ownerUserId: "",
  inventoryPoolId: "",
  locationId: "",
  partnerBId: "",
  organizationConnectionId: "",
  b: null as Identity | null,
  c: null as Identity | null,
  sharedOfferId: "",
  sharedListingId: "",
  exactUnitListingId: "",
  exactUnitCode: "",
  alternateUnitCode: "",
  fxOffers: {} as Record<"valid" | "missing" | "future" | "expired", string>,
};

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, name),
    fullPage: true,
    animations: "disabled",
  });
}

async function expectOfferMetric(page: Page, label: string, value: string) {
  const card = page.locator(".rounded-lg.border").filter({
    has: page.getByText(label, { exact: true }),
  });
  await expect(card.getByText(value, { exact: true })).toBeVisible();
}

async function login(page: Page, email: string, password = ACTOR_PASSWORD) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();
}

async function createIdentity(label: string, runId: string): Promise<Identity> {
  const organization = await prisma.organization.create({
    data: {
      code: `${label}_${runId}`.toUpperCase(),
      name: `RC ${label} 经营主体`,
    },
  });
  const store = await prisma.store.create({
    data: {
      organizationId: organization.id,
      code: `${label}_STORE_${runId}`.toUpperCase(),
      name: `RC ${label} 店铺`,
      currency: "CNY",
    },
  });
  const email = `${label.toLowerCase()}-${runId}@example.invalid`;
  const user = await prisma.user.create({
    data: {
      email,
      name: `RC ${label} 管理员`,
      password: await hashPassword(ACTOR_PASSWORD),
      role: "OWNER",
      storeId: store.id,
      memberships: {
        create: {
          organizationId: organization.id,
          role: "OWNER",
          status: "ACTIVE",
        },
      },
      storeAccesses: {
        create: { storeId: store.id, role: "OWNER" },
      },
    },
  });
  return {
    organizationId: organization.id,
    storeId: store.id,
    userId: user.id,
    email,
  };
}

async function createDirectedOffer(input: {
  title: string;
  currency: string;
  unitPrice: string;
  skuId?: string;
  itemUnitId?: string;
  quantity?: string;
}) {
  const quantity = input.quantity ?? "1";
  return prisma.supplyOffer.create({
    data: {
      storeId: STORE_ID,
      organizationId: fixture.ownerOrganizationId,
      inventoryPoolId: fixture.inventoryPoolId,
      providerOrganizationId: fixture.ownerOrganizationId,
      title: input.title,
      visibility: "PARTNER_ONLY",
      status: "PUBLISHED",
      sourceType: input.itemUnitId ? "ITEM_UNIT" : input.skuId ? "SKU" : "MANUAL",
      sourceSkuId: input.skuId ?? null,
      sourceItemUnitId: input.itemUnitId ?? null,
      inventoryPolicy: "SHARED_POOL",
      publishedQty: quantity,
      availableQty: quantity,
      unitPrice: input.unitPrice,
      currency: input.currency,
      settlementCurrency: input.currency,
      commissionType: "MARGIN",
      agreementTerms: "货主收取已确认供货价，代卖方保留供销差价。",
      agreementRule: { kind: "MARGIN" },
      agreementStatus: "CONFIRMED",
      agreementConfirmedAt: new Date(),
      fulfillmentMode: "SUPPLIER_SHIPS",
      createdById: fixture.ownerUserId,
      updatedById: fixture.ownerUserId,
      items: {
        create: {
          skuId: input.skuId ?? null,
          itemUnitId: input.itemUnitId ?? null,
          title: input.title,
          quantityAvailable: quantity,
          unitPrice: input.unitPrice,
          currency: input.currency,
        },
      },
      visibilityRules: {
        create: {
          scope: "PARTNER",
          partnerId: fixture.partnerBId,
          viewerOrganizationId: fixture.b!.organizationId,
          organizationConnectionId: fixture.organizationConnectionId,
        },
      },
    },
    include: { items: true },
  });
}

async function fillOfferForPublish(
  page: Page,
  input: { title: string; visibility: "PUBLIC" | "PARTNER_ONLY" }
) {
  await page.goto("/marketplace/new");
  await expect(page.getByRole("heading", { name: "发布货盘", exact: true })).toBeVisible();
  await page.getByRole("button").filter({ hasText: "E2E QA 基础库存商品" }).click();

  const visibilityPanel = page.locator("div.rounded-lg").filter({ hasText: "谁可以卖" }).first();
  await visibilityPanel.getByRole("combobox").selectOption(input.visibility);
  if (input.visibility === "PARTNER_ONLY") {
    await visibilityPanel.getByLabel("RC B 经营主体").check();
  }
  await page
    .getByPlaceholder(/用双方都听得懂的话写清/)
    .fill("货主收取已确认供货价，代卖方保留供销差价；成交后由货主发货。");
  await page.getByText("更多限制与备注（可选）", { exact: true }).click();
  await page.getByLabel("货盘名称（可选）").fill(input.title);
}

async function fillFulfillmentOrder(
  page: Page,
  listingId: string,
  index: number,
  options: { fillQuantity?: boolean } = {}
) {
  await page.goto(`/fulfillment/requests/new?resaleListingId=${listingId}`);
  await expect(page.getByRole("heading", { name: "登记售出并创建履约" })).toBeVisible();
  if (options.fillQuantity !== false) {
    await page.getByLabel("履约数量").fill("1");
  }
  await page.getByLabel("客户/收件人").fill(`共享库存买家 ${index}`);
  await page.getByLabel("外部订单号").fill(`RC-SHARED-${index}`);
  await page.getByLabel("收件地址").fill(`上海市 E2E 验收路 ${index} 号`);
  await page.getByLabel("国家/地区").fill("CN");
}

test.describe.configure({ mode: "serial" });

test.describe("release scenarios 07, 08 and 14", () => {
  const runId = Date.now().toString(36);

  test.beforeAll(async () => {
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: OWNER_EMAIL },
      include: {
        memberships: { where: { status: "ACTIVE" } },
      },
    });
    fixture.ownerUserId = owner.id;
    fixture.ownerOrganizationId = owner.memberships[0].organizationId;

    const inventoryPool = await prisma.inventoryPool.findUniqueOrThrow({
      where: { legacyStoreId: STORE_ID },
    });
    fixture.inventoryPoolId = inventoryPool.id;
    const location = await prisma.location.findFirstOrThrow({
      where: { storeId: STORE_ID, code: "E2E-WH-CN" },
    });
    fixture.locationId = location.id;
    await prisma.sKU.update({
      where: { storeId_code: { storeId: STORE_ID, code: "E2E-QA-STOCK-001" } },
      data: { imageUrl: "/platform-icons/mercari.svg" },
    });

    fixture.b = await createIdentity("B", runId);
    fixture.c = await createIdentity("C", runId);
    const partnerB = await prisma.partner.create({
      data: {
        storeId: STORE_ID,
        organizationId: fixture.b.organizationId,
        code: `RC_B_${runId}`.toUpperCase(),
        name: "RC B 经营主体",
        type: "RESELLER",
        status: "ACTIVE",
        defaultCurrency: "CNY",
      },
    });
    fixture.partnerBId = partnerB.id;
    const organizationConnection = await prisma.organizationConnection.create({
      data: {
        requesterOrganizationId: fixture.ownerOrganizationId,
        targetOrganizationId: fixture.b.organizationId,
        initiatingPartnerId: partnerB.id,
        pairKey: organizationPairKey(fixture.ownerOrganizationId, fixture.b.organizationId),
        status: "ACTIVE",
        requestedById: fixture.ownerUserId,
        respondedById: fixture.b.userId,
        respondedAt: new Date(),
      },
    });
    fixture.organizationConnectionId = organizationConnection.id;
    await prisma.serviceAgreement.create({
      data: {
        clientOrganizationId: fixture.b.organizationId,
        providerOrganizationId: fixture.ownerOrganizationId,
        inventoryPoolId: fixture.inventoryPoolId,
        locationId: fixture.locationId,
        serviceTypes: ["FULFILLMENT"],
        settlementCurrency: "CNY",
        status: "ACTIVE",
        effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
        acceptedById: fixture.ownerUserId,
        acceptedAt: new Date(),
      },
    });

    const bPlatform = await prisma.platform.create({
      data: {
        storeId: fixture.b.storeId,
        code: `RC_PLATFORM_${runId}`.toUpperCase(),
        name: "RC 日本销售账号",
        country: "JP",
        defaultCurrency: "JPY",
        defaultFeeRate: "0.1",
      },
    });

    const sharedSku = await prisma.sKU.create({
      data: {
        storeId: STORE_ID,
        inventoryPoolId: fixture.inventoryPoolId,
        code: `RC_SHARED_${runId}`.toUpperCase(),
        name: "RC 五件共享库存商品",
        imageUrl: "/platform-icons/mercari.svg",
      },
    });
    const sharedLot = await prisma.inventoryLot.create({
      data: {
        storeId: STORE_ID,
        inventoryPoolId: fixture.inventoryPoolId,
        skuId: sharedSku.id,
        locationId: fixture.locationId,
        unitCost: "100",
        costCurrency: "CNY",
        sourceType: "E2E_FIXTURE",
        sourceId: `RC_SHARED_${runId}`,
        receivedAt: new Date("2026-08-28T00:00:00.000Z"),
        status: "ACTIVE",
      },
    });
    await prisma.stockLedger.create({
      data: {
        storeId: STORE_ID,
        inventoryPoolId: fixture.inventoryPoolId,
        entityType: "LOT",
        entityId: sharedLot.id,
        locationId: fixture.locationId,
        deltaQty: "5",
        reason: "INBOUND_PURCHASE",
        refType: "E2E_FIXTURE",
        refId: `RC_SHARED_${runId}`,
      },
    });
    const sharedOffer = await createDirectedOffer({
      title: "RC 五件共享库存货盘",
      currency: "CNY",
      unitPrice: "120",
      skuId: sharedSku.id,
      quantity: "5",
    });
    fixture.sharedOfferId = sharedOffer.id;
    const sharedListing = await prisma.resaleListing.create({
      data: {
        storeId: fixture.b.storeId,
        sellerOrganizationId: fixture.b.organizationId,
        supplyOfferId: sharedOffer.id,
        supplyOfferItemId: sharedOffer.items[0].id,
        platformId: bPlatform.id,
        title: "RC 五件共享库存代卖",
        targetPrice: "18000",
        currency: "JPY",
        quantityPlanned: "6",
        supplyUnitPrice: "120",
        supplyCurrency: "CNY",
        commissionType: "MARGIN",
        agreementTermsSnapshot: sharedOffer.agreementTerms,
        agreementRuleSnapshot:
          sharedOffer.agreementRule === null
            ? Prisma.JsonNull
            : (sharedOffer.agreementRule as Prisma.InputJsonValue),
        agreementVersion: 1,
        agreementAcceptedAt: new Date(),
        platformFeeRate: "0.1",
        fulfillmentMode: "SUPPLIER_SHIPS",
        status: "ACTIVE",
        listedAt: new Date(),
        createdById: fixture.b.userId,
        updatedById: fixture.b.userId,
      },
    });
    fixture.sharedListingId = sharedListing.id;

    const itemSku = await prisma.sKU.create({
      data: {
        storeId: STORE_ID,
        inventoryPoolId: fixture.inventoryPoolId,
        code: `RC_UNIT_${runId}`.toUpperCase(),
        name: "RC 单件身份相机",
      },
    });
    fixture.exactUnitCode = `RC-CAMERA-${runId}-A`.toUpperCase();
    fixture.alternateUnitCode = `RC-CAMERA-${runId}-B`.toUpperCase();
    const exactUnit = await prisma.itemUnit.create({
      data: {
        storeId: STORE_ID,
        inventoryPoolId: fixture.inventoryPoolId,
        skuId: itemSku.id,
        locationId: fixture.locationId,
        unitCost: "12000",
        costCurrency: "JPY",
        unitCode: fixture.exactUnitCode,
        labelCode: `${fixture.exactUnitCode}-LABEL`,
        conditionGrade: "A",
        functionStatus: "NORMAL",
        sourceType: "E2E_FIXTURE",
        sourceId: `${runId}-unit-a`,
        status: "RETURN_CHECK",
      },
    });
    await prisma.itemUnit.create({
      data: {
        storeId: STORE_ID,
        inventoryPoolId: fixture.inventoryPoolId,
        skuId: itemSku.id,
        locationId: fixture.locationId,
        unitCost: "9800",
        costCurrency: "JPY",
        unitCode: fixture.alternateUnitCode,
        labelCode: `${fixture.alternateUnitCode}-LABEL`,
        conditionGrade: "B",
        functionStatus: "NORMAL",
        sourceType: "E2E_FIXTURE",
        sourceId: `${runId}-unit-b`,
        status: "AVAILABLE",
      },
    });
    const unitOffer = await createDirectedOffer({
      title: "RC 指定单件身份货盘",
      currency: "JPY",
      unitPrice: "16000",
      skuId: itemSku.id,
      itemUnitId: exactUnit.id,
    });
    const unitListing = await prisma.resaleListing.create({
      data: {
        storeId: fixture.b.storeId,
        sellerOrganizationId: fixture.b.organizationId,
        supplyOfferId: unitOffer.id,
        supplyOfferItemId: unitOffer.items[0].id,
        platformId: bPlatform.id,
        title: "RC 指定单件代卖",
        targetPrice: "20000",
        currency: "JPY",
        quantityPlanned: "1",
        supplyUnitPrice: "16000",
        supplyCurrency: "JPY",
        commissionType: "MARGIN",
        agreementTermsSnapshot: unitOffer.agreementTerms,
        agreementRuleSnapshot:
          unitOffer.agreementRule === null
            ? Prisma.JsonNull
            : (unitOffer.agreementRule as Prisma.InputJsonValue),
        agreementVersion: 1,
        agreementAcceptedAt: new Date(),
        platformFeeRate: "0.1",
        fulfillmentMode: "SUPPLIER_SHIPS",
        status: "ACTIVE",
        listedAt: new Date(),
        createdById: fixture.b.userId,
        updatedById: fixture.b.userId,
      },
    });
    fixture.exactUnitListingId = unitListing.id;

    await prisma.fxRate.createMany({
      data: [
        {
          fromCurrency: "CAD",
          toCurrency: "JPY",
          rate: "110",
          effectiveDate: new Date("2026-08-29T00:00:00.000Z"),
        },
        {
          fromCurrency: "EUR",
          toCurrency: "JPY",
          rate: "160",
          effectiveDate: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    });
    for (const [key, currency] of Object.entries({
      valid: "CNY",
      missing: "GBP",
      future: "CAD",
      expired: "EUR",
    }) as Array<[keyof typeof fixture.fxOffers, string]>) {
      const offer = await createDirectedOffer({
        title: `RC FX ${key.toUpperCase()} ${currency}→JPY`,
        currency,
        unitPrice: "500",
      });
      fixture.fxOffers[key] = offer.id;
    }
  });

  test("07 public and directed offer visibility keeps cost private", async ({ page }) => {
    test.setTimeout(120_000);
    const publicTitle = `RC 公开货盘 ${runId}`;
    const directedTitle = `RC 定向货盘 ${runId}`;

    await login(page, OWNER_EMAIL, OWNER_PASSWORD);
    await fillOfferForPublish(page, { title: publicTitle, visibility: "PUBLIC" });
    await shot(page, "07-01-owner-public-offer-filled-rc1.png");
    await page.getByRole("button", { name: "确认发布" }).click();
    await expect(page).toHaveURL(/\/marketplace\/my-offers\/[^/]+$/);
    await expect(page.getByText("公开", { exact: true })).toBeVisible();
    await shot(page, "07-02-owner-public-offer-result-rc1.png");
    const publicOfferId = page.url().split("/").pop()!;

    await login(page, fixture.b!.email);
    await page.goto("/marketplace");
    await expect(page.getByText(publicTitle, { exact: true })).toBeVisible();
    await shot(page, "07-03-partner-public-offer-visible-rc1.png");

    await login(page, OWNER_EMAIL, OWNER_PASSWORD);
    await page.goto(`/marketplace/my-offers/${publicOfferId}`);
    await page.getByRole("button", { name: "下架" }).click();
    await page.getByRole("button", { name: "确认下架" }).click();
    await expect(page.getByText("已下架", { exact: true })).toBeVisible();
    await shot(page, "07-04-owner-public-offer-delisted-rc1.png");

    await fillOfferForPublish(page, { title: directedTitle, visibility: "PARTNER_ONLY" });
    await shot(page, "07-05-owner-directed-offer-filled-rc1.png");
    await page.getByRole("button", { name: "确认发布" }).click();
    await expect(page).toHaveURL(/\/marketplace\/my-offers\/[^/]+$/);
    await expect(page.getByText("合作方可见", { exact: true })).toBeVisible();
    await shot(page, "07-06-owner-directed-offer-result-rc1.png");
    const directedOfferId = page.url().split("/").pop()!;

    await login(page, fixture.b!.email);
    await page.goto("/marketplace");
    await expect(page.getByText(directedTitle, { exact: true })).toBeVisible();
    await expect(page.getByText(publicTitle, { exact: true })).toHaveCount(0);
    await shot(page, "07-07-partner-directed-offer-visible-rc1.png");
    await page.getByRole("link", { name: directedTitle }).click();
    await expect(page.getByRole("heading", { name: directedTitle })).toBeVisible();
    await expect(page.getByText("内部成本", { exact: true })).toHaveCount(0);
    await expect(page.getByText("CNY 100.00", { exact: true })).toHaveCount(0);
    await shot(page, "07-08-partner-detail-cost-hidden-rc1.png");

    await login(page, fixture.c!.email);
    await page.goto("/marketplace");
    await expect(page.getByRole("heading", { name: "暂无可见货盘" })).toBeVisible();
    await expect(page.getByText(directedTitle, { exact: true })).toHaveCount(0);
    await shot(page, "07-09-outsider-no-visible-offers-rc1.png");
    const response = await page.goto(`/marketplace/${directedOfferId}`);
    expect(response?.status()).toBe(404);
    await expect(page.getByText(/could not be found|没有找到|找不到/i)).toBeVisible();
    await shot(page, "07-10-outsider-direct-url-denied-rc1.png");
  });

  test("08 shared stock reserves five, blocks six, releases cancellation and preserves exact item identity", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await login(page, fixture.b!.email);

    const requestIds: string[] = [];
    for (let index = 1; index <= 5; index += 1) {
      await fillFulfillmentOrder(page, fixture.sharedListingId, index);
      if (index === 1) {
        await shot(page, "08-01-first-order-filled-rc1.png");
      }
      await page.getByRole("button", { name: "登记售出并创建履约" }).click();
      await expect(page).not.toHaveURL(/\/fulfillment\/requests\/new(?:[/?#]|$)/);
      await expect(page).toHaveURL(/\/fulfillment\/requests\/[^/?#]+$/);
      requestIds.push(new URL(page.url()).pathname.split("/").pop()!);
      if (index === 1) {
        await shot(page, "08-02-first-order-result-rc1.png");
      }
    }

    // A fully reserved offer is intentionally removed from the buyer-facing market.
    // Use the owner's detail view for the counters, then return to B for the
    // sixth-order negative path.
    await login(page, OWNER_EMAIL, OWNER_PASSWORD);
    await page.goto(`/marketplace/my-offers/${fixture.sharedOfferId}`);
    await expectOfferMetric(page, "当前可接单", "0");
    await expectOfferMetric(page, "已预留", "5");
    await shot(page, "08-03-five-orders-reserved-rc1.png");

    await login(page, fixture.b!.email);
    await fillFulfillmentOrder(page, fixture.sharedListingId, 6, {
      fillQuantity: false,
    });
    await expect(page.getByText(/当前无可供数量/)).toBeVisible();
    await expect(page.getByLabel("履约数量")).toHaveValue("0");
    await shot(page, "08-04-sixth-order-filled-rc1.png");
    const blockedSharedSubmit = page.getByRole("button", {
      name: "登记售出并创建履约",
    });
    await expect(blockedSharedSubmit).toBeDisabled();
    await blockedSharedSubmit.scrollIntoViewIfNeeded();
    await shot(page, "08-05-sixth-order-blocked-rc1.png");

    await page.goto(`/fulfillment/requests/${requestIds[0]}`);
    await page.getByRole("button", { name: "取消", exact: true }).click();
    await expect
      .poll(async () => {
        const request = await prisma.fulfillmentRequest.findUnique({
          where: { id: requestIds[0] },
          select: { status: true },
        });
        return request?.status;
      })
      .toBe("CANCELLED");
    await page.goto("/fulfillment/requests");
    await expect(page.getByText("已取消", { exact: true }).first()).toBeVisible();
    await shot(page, "08-06-first-order-cancelled-rc1.png");

    await login(page, OWNER_EMAIL, OWNER_PASSWORD);
    await page.goto(`/marketplace/my-offers/${fixture.sharedOfferId}`);
    await expectOfferMetric(page, "当前可接单", "1");
    await expectOfferMetric(page, "已预留", "4");
    await shot(page, "08-07-cancellation-released-stock-rc1.png");

    const sharedOffer = await prisma.supplyOffer.findUniqueOrThrow({
      where: { id: fixture.sharedOfferId },
    });
    expect(sharedOffer.reservedQty.toString()).toBe("4");
    expect(
      await prisma.fulfillmentRequest.count({
        where: { supplyOfferId: fixture.sharedOfferId },
      })
    ).toBe(5);

    await page.goto(`/inventory/items?q=${encodeURIComponent("RC 单件身份相机")}`);
    await expect(page.getByText(fixture.exactUnitCode, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(fixture.alternateUnitCode, { exact: true }).first()).toBeVisible();
    await shot(page, "08-08-owner-item-identities-rc1.png");

    await login(page, fixture.b!.email);
    await fillFulfillmentOrder(page, fixture.exactUnitListingId, 7, {
      fillQuantity: false,
    });
    await expect(page.getByText(/指定单件当前不可履约/)).toBeVisible();
    await shot(page, "08-09-exact-item-order-filled-rc1.png");
    const blockedExactItemSubmit = page.getByRole("button", {
      name: "登记售出并创建履约",
    });
    await expect(blockedExactItemSubmit).toBeDisabled();
    await blockedExactItemSubmit.scrollIntoViewIfNeeded();
    await shot(page, "08-10-exact-item-substitution-blocked-rc1.png");
    expect(
      await prisma.fulfillmentRequest.count({
        where: { resaleListingId: fixture.exactUnitListingId },
      })
    ).toBe(0);
    const alternateUnit = await prisma.itemUnit.findFirstOrThrow({
      where: { storeId: STORE_ID, unitCode: fixture.alternateUnitCode },
    });
    expect(alternateUnit.status).toBe("AVAILABLE");
  });

  test("14 FX valid, missing, future and stale states plus repeat-click idempotency", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await login(page, fixture.b!.email);

    await page.goto(`/resale/new?supplyOfferId=${fixture.fxOffers.valid}`);
    await expect(page.getByRole("heading", { name: "创建代卖上架" })).toBeVisible();
    await page.getByLabel("代卖售价").fill("16000");
    await page.getByLabel("计划数量").fill("1");
    await page.getByLabel("外部编号").fill(`RC-FX-IDEMPOTENT-${runId}`);
    await shot(page, "14-01-valid-fx-listing-filled-rc1.png");
    await page.getByRole("button", { name: "创建代卖草稿" }).dblclick();
    await expect(page).toHaveURL(/\/resale\/[^/]+$/);
    await expect(page.getByRole("heading", { name: /RC FX VALID/ })).toBeVisible();
    await expect(page.getByText("JPY", { exact: false }).first()).toBeVisible();
    await shot(page, "14-02-valid-fx-result-single-create-rc1.png");
    expect(
      await prisma.resaleListing.count({
        where: {
          storeId: fixture.b!.storeId,
          externalListingNo: `RC-FX-IDEMPOTENT-${runId}`,
        },
      })
    ).toBe(1);

    for (const scenario of [
      {
        key: "missing" as const,
        title: "MISSING",
        filled: "14-03-missing-fx-filled-rc1.png",
        result: "14-04-missing-fx-blocked-rc1.png",
        message: /缺少 GBP→JPY/,
      },
      {
        key: "future" as const,
        title: "FUTURE",
        filled: "14-05-future-fx-filled-rc1.png",
        result: "14-06-future-fx-blocked-rc1.png",
        message: /缺少 CAD→JPY/,
      },
      {
        key: "expired" as const,
        title: "EXPIRED",
        filled: "14-07-expired-fx-filled-rc1.png",
        result: "14-08-expired-fx-blocked-rc1.png",
        message: /EUR→JPY 最近汇率距业务日期.*超过允许的 31 天/,
      },
    ]) {
      await page.goto(`/resale/new?supplyOfferId=${fixture.fxOffers[scenario.key]}`);
      await expect(page.getByRole("heading", { name: "创建代卖上架" })).toBeVisible();
      await page.getByLabel("代卖售价").fill("16000");
      await page.getByLabel("计划数量").fill("1");
      await page.getByLabel("外部编号").fill(`RC-FX-${scenario.title}-${runId}`);
      await shot(page, scenario.filled);
      await page.getByRole("button", { name: "创建代卖草稿" }).click();
      await expect(page.getByText(scenario.message)).toBeVisible();
      await shot(page, scenario.result);
      expect(
        await prisma.resaleListing.count({
          where: {
            storeId: fixture.b!.storeId,
            externalListingNo: `RC-FX-${scenario.title}-${runId}`,
          },
        })
      ).toBe(0);
    }
  });
});
