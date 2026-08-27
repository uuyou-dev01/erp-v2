import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

const STORE_ID = "store_1";
const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL ?? "e2e-owner@example.invalid";
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD ?? "e2e-owner-password-7fd243e68c2d4b33";
const ACTOR_PASSWORD = "e2e-release-collaboration-password-11-13";
const EVIDENCE_DIR = path.join(process.cwd(), "docs/testing/releases/v0.9.0/screenshots");

mkdirSync(EVIDENCE_DIR, { recursive: true });

type Identity = {
  organizationId: string;
  storeId: string;
  userId: string;
  email: string;
  name: string;
};

const fixture = {
  ownerOrganizationId: "",
  ownerUserId: "",
  inventoryPoolId: "",
  locationId: "",
  inventorySkuName: "",
  partnerBId: "",
  b: null as Identity | null,
  c: null as Identity | null,
  executor: null as Identity | null,
  intruder: null as Identity | null,
};

async function shot(page: Page, name: string) {
  await expect(page.getByText("加载工作台...")).toHaveCount(0);
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, name),
    fullPage: true,
    animations: "disabled",
  });
}

async function login(page: Page, email: string, password = ACTOR_PASSWORD) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();
}

async function createOrganizationOwner(label: string, runId: string): Promise<Identity> {
  const organization = await prisma.organization.create({
    data: {
      code: `RC_${label}_${runId}`.toUpperCase(),
      name: `RC ${label} 经营主体`,
    },
  });
  const store = await prisma.store.create({
    data: {
      organizationId: organization.id,
      code: `RC_${label}_STORE_${runId}`.toUpperCase(),
      name: `RC ${label} 店铺`,
      currency: "CNY",
    },
  });
  const name = `RC ${label} 管理员`;
  const emailKey =
    label
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.join("-") ?? "owner";
  const email = `rc-${emailKey}-${runId}@example.invalid`;
  const user = await prisma.user.create({
    data: {
      email,
      name,
      password: await hashPassword(ACTOR_PASSWORD),
      role: "OWNER",
      storeId: store.id,
      memberships: {
        create: { organizationId: organization.id, role: "OWNER", status: "ACTIVE" },
      },
      storeAccesses: { create: { storeId: store.id, role: "OWNER" } },
    },
  });
  return { organizationId: organization.id, storeId: store.id, userId: user.id, email, name };
}

async function createProviderMember(
  label: string,
  emailKey: string,
  runId: string,
  provider: Identity
): Promise<Identity> {
  const name = `RC ${label}`;
  const email = `rc-${emailKey}-${runId}@example.invalid`;
  const user = await prisma.user.create({
    data: {
      email,
      name,
      password: await hashPassword(ACTOR_PASSWORD),
      role: "FULFILLMENT",
      storeId: provider.storeId,
      memberships: {
        create: {
          organizationId: provider.organizationId,
          role: "FULFILLMENT",
          status: "ACTIVE",
        },
      },
      storeAccesses: {
        create: { storeId: provider.storeId, role: "FULFILLMENT" },
      },
      locationAccesses: {
        create: {
          locationId: fixture.locationId,
          role: "FULFILLMENT",
          permissions: { ship: true },
        },
      },
    },
  });
  return {
    organizationId: provider.organizationId,
    storeId: provider.storeId,
    userId: user.id,
    email,
    name,
  };
}

test.describe.configure({ mode: "serial" });

test.describe("release scenarios 11 and 13", () => {
  const runId = Date.now().toString(36);

  test.beforeAll(async () => {
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: OWNER_EMAIL },
      include: { memberships: { where: { status: "ACTIVE" } } },
    });
    fixture.ownerUserId = owner.id;
    fixture.ownerOrganizationId = owner.memberships[0].organizationId;
    fixture.inventoryPoolId = (
      await prisma.inventoryPool.findUniqueOrThrow({ where: { legacyStoreId: STORE_ID } })
    ).id;
    fixture.locationId = (
      await prisma.location.findFirstOrThrow({ where: { storeId: STORE_ID, code: "E2E-WH-CN" } })
    ).id;

    fixture.b = await createOrganizationOwner("11-13 B", runId);
    fixture.c = await createOrganizationOwner("11-13 C", runId);
    fixture.executor = await createProviderMember("指定代发执行人", "assignee", runId, fixture.c);
    fixture.intruder = await createProviderMember(
      "同企业非指派人",
      "non-assignee",
      runId,
      fixture.c
    );

    const partnerB = await prisma.partner.create({
      data: {
        storeId: STORE_ID,
        organizationId: fixture.b.organizationId,
        code: `RC_11_13_B_${runId}`.toUpperCase(),
        name: fixture.b.name.replace("管理员", "经营主体"),
        type: "RESELLER",
        status: "ACTIVE",
        defaultCurrency: "CNY",
      },
    });
    fixture.partnerBId = partnerB.id;

    await prisma.organizationConnection.create({
      data: {
        requesterOrganizationId: fixture.ownerOrganizationId,
        targetOrganizationId: fixture.b.organizationId,
        initiatingPartnerId: partnerB.id,
        pairKey: [fixture.ownerOrganizationId, fixture.b.organizationId].sort().join(":"),
        status: "ACTIVE",
        requestedById: fixture.ownerUserId,
        respondedById: fixture.b.userId,
        respondedAt: new Date(),
      },
    });

    await prisma.serviceAgreement.createMany({
      data: [
        {
          clientOrganizationId: fixture.ownerOrganizationId,
          providerOrganizationId: fixture.c.organizationId,
          inventoryPoolId: fixture.inventoryPoolId,
          locationId: fixture.locationId,
          serviceTypes: ["FULFILLMENT"],
          settlementCurrency: "CNY",
          status: "ACTIVE",
          effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
          acceptedById: fixture.c.userId,
          acceptedAt: new Date(),
        },
        {
          clientOrganizationId: fixture.b.organizationId,
          providerOrganizationId: fixture.c.organizationId,
          inventoryPoolId: fixture.inventoryPoolId,
          locationId: fixture.locationId,
          serviceTypes: ["FULFILLMENT"],
          settlementCurrency: "CNY",
          status: "ACTIVE",
          effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
          acceptedById: fixture.c.userId,
          acceptedAt: new Date(),
        },
      ],
    });

    await prisma.platform.create({
      data: {
        storeId: fixture.b.storeId,
        code: `RC_11_13_PLATFORM_${runId}`.toUpperCase(),
        name: "RC 11/13 CNY 销售平台",
        country: "CN",
        defaultCurrency: "CNY",
        defaultFeeRate: "0",
      },
    });

    fixture.inventorySkuName = `RC 11/13 全链路商品 ${runId}`;
    const sku = await prisma.sKU.create({
      data: {
        storeId: STORE_ID,
        inventoryPoolId: fixture.inventoryPoolId,
        code: `RC_11_13_SKU_${runId}`.toUpperCase(),
        name: fixture.inventorySkuName,
        imageUrl: "/platform-icons/mercari.svg",
      },
    });
    const lot = await prisma.inventoryLot.create({
      data: {
        storeId: STORE_ID,
        inventoryPoolId: fixture.inventoryPoolId,
        skuId: sku.id,
        locationId: fixture.locationId,
        unitCost: "100",
        costCurrency: "CNY",
        sourceType: "E2E_FIXTURE",
        sourceId: `RC_11_13_${runId}`,
        receivedAt: new Date("2026-08-28T00:00:00.000Z"),
        status: "ACTIVE",
      },
    });
    await prisma.stockLedger.create({
      data: {
        storeId: STORE_ID,
        inventoryPoolId: fixture.inventoryPoolId,
        entityType: "LOT",
        entityId: lot.id,
        locationId: fixture.locationId,
        deltaQty: "3",
        reason: "INBOUND_PURCHASE",
        refType: "E2E_FIXTURE",
        refId: `RC_11_13_${runId}`,
      },
    });
  });

  test("11/13 third-party fulfillment enforces assignment and settles the full collaboration chain", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const offerTitle = `RC 11/13 第三方代发货盘 ${runId}`;
    const resaleTitle = `RC 11/13 代卖 ${runId}`;

    await login(page, OWNER_EMAIL, OWNER_PASSWORD);
    await page.goto("/marketplace/new");
    await expect(page.getByRole("heading", { name: "发布货盘", exact: true })).toBeVisible();
    await page.getByRole("button").filter({ hasText: fixture.inventorySkuName }).click();
    const collaborationPanel = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "发布给谁、谁发货、怎么分钱" }) });
    const choices = collaborationPanel.getByRole("combobox");
    await choices.nth(0).selectOption("PARTNER_ONLY");
    await collaborationPanel.getByLabel(fixture.b!.name.replace("管理员", "经营主体")).check();
    await choices.nth(1).selectOption("THIRD_PARTY_SHIPS");
    await choices.nth(2).selectOption(fixture.c!.organizationId);
    await collaborationPanel.getByPlaceholder("每件发货费").fill("25");
    await collaborationPanel.getByPlaceholder("币种").fill("CNY");
    await collaborationPanel
      .getByPlaceholder(/用双方都听得懂的话写清/)
      .fill(
        "供货价 CNY 120；代卖方保留供销差价；第三方服务方每件代发费 CNY 25。所有款项线下结清。"
      );
    await page.getByText("更多限制与备注（可选）", { exact: true }).click();
    await page.getByLabel("货盘名称（可选）").fill(offerTitle);
    await shot(page, "13-01-supplier-offer-third-party-filled-rc1.png");
    await page.getByRole("button", { name: "确认发布" }).click();
    await expect(page).toHaveURL(/\/marketplace\/my-offers\/[^/]+$/);
    await expect(page.getByRole("heading", { name: offerTitle })).toBeVisible();
    await expect(page.getByText("第三方代发", { exact: false })).toBeVisible();
    const offerId = page.url().split("/").pop()!;
    await shot(page, "13-02-supplier-offer-published-rc1.png");

    await login(page, fixture.b!.email);
    await page.goto(`/marketplace/${offerId}`);
    await expect(page.getByRole("heading", { name: offerTitle })).toBeVisible();
    await page.getByRole("link", { name: "创建代卖上架" }).click();
    await expect(page.getByRole("heading", { name: "创建代卖上架" })).toBeVisible();
    await page.getByLabel("代卖标题").fill(resaleTitle);
    await page.getByLabel("代卖售价").fill("180");
    await page.getByLabel("计划数量").fill("1");
    await page.getByLabel("外部编号").fill(`RC-11-13-${runId}`);
    await shot(page, "13-03-reseller-listing-filled-rc1.png");
    await page.getByRole("button", { name: "创建代卖草稿" }).click();
    await expect(page).toHaveURL(/\/resale\/(?!new(?:[/?]|$))[^/?]+$/);
    const listingId = page.url().split("/").pop()!;
    await page.getByRole("button", { name: "启用" }).click();
    await expect(page.getByText("代卖中", { exact: true })).toBeVisible();
    await shot(page, "13-04-reseller-listing-active-rc1.png");

    await page.getByRole("link", { name: "创建履约请求" }).click();
    await expect(page.getByRole("heading", { name: "登记售出并创建履约" })).toBeVisible();
    await page.getByLabel("履约数量").fill("1");
    await page.getByLabel("客户/收件人").fill("RC 场景 11 收件人");
    await page.getByLabel("电话").fill("13800001113");
    await page.getByLabel("外部订单号").fill(`ORDER-11-13-${runId}`);
    await page.getByLabel("收件地址").fill("上海市验收路 11 号");
    await page.getByLabel("国家/地区").fill("CN");
    await shot(page, "11-01-requester-fulfillment-filled-rc1.png");
    await page.getByRole("button", { name: "登记售出并创建履约" }).click();
    await expect(page).toHaveURL(/\/fulfillment\/requests\/(?!new(?:[/?]|$))[^/?]+$/);
    await expect(page.getByText("已请求", { exact: true })).toBeVisible();
    const requestId = page.url().split("/").pop()!;
    await shot(page, "11-02-requester-request-created-rc1.png");

    await login(page, fixture.executor!.email);
    await page.goto(`/fulfillment/requests/${requestId}`);
    await expect(page.getByText("已请求", { exact: true })).toBeVisible();
    await shot(page, "11-03-provider-assignee-before-accept-rc1.png");
    await page.getByRole("button", { name: "接受", exact: true }).click();
    await expect(page.getByText("已接受", { exact: true })).toBeVisible();
    await shot(page, "11-04-provider-assignee-accepted-rc1.png");

    await login(page, fixture.intruder!.email);
    await page.goto(`/fulfillment/requests/${requestId}`);
    await expect(page.getByText("已接受", { exact: true })).toBeVisible();
    await page.getByPlaceholder("承运商").fill("RC Logistics");
    await page.getByPlaceholder("物流单号").fill(`BLOCKED-${runId}`);
    await shot(page, "11-05-non-assignee-before-ship-attempt-rc1.png");
    await page.getByRole("button", { name: "标记发货" }).click();
    await expect(page.getByText("只有被指派的执行人可以完成发货或签收")).toBeVisible();
    await expect(page.getByText("已接受", { exact: true })).toBeVisible();
    await shot(page, "11-06-non-assignee-ship-blocked-rc1.png");

    await login(page, fixture.executor!.email);
    await page.goto(`/fulfillment/requests/${requestId}`);
    await page.getByPlaceholder("承运商").fill("RC Logistics");
    await page.getByPlaceholder("物流单号").fill(`TRACK-11-13-${runId}`);
    await page.getByPlaceholder("代发服务费（选填）").fill("25");
    await page.getByPlaceholder("币种").fill("CNY");
    await shot(page, "11-07-assignee-shipping-filled-rc1.png");
    await page.getByRole("button", { name: "标记发货" }).click();
    await expect(page.getByText("已发货", { exact: true })).toBeVisible();
    await expect(page.getByText(/结算/)).toBeVisible();
    await shot(page, "11-08-assignee-shipped-rc1.png");

    await login(page, fixture.b!.email);
    await page.goto(`/fulfillment/requests/${requestId}`);
    await expect(page.getByText("已发货", { exact: true })).toBeVisible();
    await expect(page.getByText(`TRACK-11-13-${runId}`, { exact: true })).toBeVisible();
    await expect(page.getByText(/代发服务费/)).toBeVisible();
    await shot(page, "11-09-requester-shipped-counterparty-view-rc1.png");

    await page.goto("/finance/settlements");
    const supplySettlementRow = page.locator(".grid.gap-3.py-4").filter({
      has: page.getByText(/CNY 120(?:\.0+)?$/),
    });
    await expect(supplySettlementRow).toHaveCount(1);
    await supplySettlementRow.getByRole("link").first().click();
    await expect(page.getByText("供货货款", { exact: true })).toBeVisible();
    await shot(page, "13-05-reseller-supply-settlement-draft-rc1.png");
    await page.getByRole("button", { name: "确认", exact: true }).click();
    await expect(page.getByText("已确认", { exact: true })).toBeVisible();
    await shot(page, "13-06-reseller-supply-settlement-confirmed-rc1.png");
    await page.getByRole("button", { name: "标记线下已结清" }).click();
    await expect(page.getByText("已线下结清", { exact: true })).toBeVisible();
    await shot(page, "13-07-reseller-supply-settlement-paid-rc1.png");

    await page.goto("/finance/wallet");
    await expect(page.getByRole("heading", { name: "我的收益" })).toBeVisible();
    await expect(page.getByText("代卖佣金", { exact: true })).toBeVisible();
    await expect(page.getByText("已线下结清", { exact: true }).first()).toBeVisible();
    await shot(page, "13-08-reseller-wallet-commission-settled-rc1.png");

    await page.goto(`/fulfillment/requests/${requestId}`);
    const serviceCharge = page.locator(".grid.gap-3.py-4").filter({
      has: page.getByText(/代发服务费/),
    });
    await expect(serviceCharge.getByText("待付款方确认", { exact: true })).toBeVisible();
    await shot(page, "13-09-requester-service-charge-submitted-rc1.png");
    await serviceCharge.getByRole("button", { name: "确认", exact: true }).click();
    await expect(serviceCharge.getByText("已更新", { exact: true })).toBeVisible();
    await page.reload();
    await expect(serviceCharge.getByText("已确认待结清", { exact: true })).toBeVisible();
    await serviceCharge.getByRole("button", { name: "整理线下结算" }).click();
    await expect(serviceCharge.getByText("已更新", { exact: true })).toBeVisible();
    await shot(page, "13-10-requester-service-charge-confirmed-rc1.png");

    await page.goto("/finance/settlements");
    const serviceSettlementRow = page.locator(".grid.gap-3.py-4").filter({
      has: page.getByText(/CNY 25(?:\.0+)?$/),
    });
    await expect(serviceSettlementRow).toHaveCount(1);
    await serviceSettlementRow.getByRole("link").first().click();
    await expect(page.getByText(/履约 .* 代发服务费/)).toBeVisible();
    await page.getByRole("button", { name: "确认", exact: true }).click();
    await expect(page.getByText("已确认", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "标记线下已结清" }).click();
    await expect(page.getByText("已线下结清", { exact: true })).toBeVisible();
    await shot(page, "13-11-requester-service-settlement-paid-rc1.png");

    await login(page, fixture.executor!.email);
    await page.goto("/finance/wallet");
    const serviceEarningRow = page.locator(".grid.gap-3.py-4").filter({
      has: page.getByText("代发服务", { exact: true }),
    });
    await expect(serviceEarningRow.getByText("已线下结清", { exact: true })).toBeVisible();
    await expect(serviceEarningRow.getByText(/(?:CN¥|¥)25\.00/)).toBeVisible();
    await shot(page, "13-12-assignee-wallet-service-fee-settled-rc1.png");

    await page.goto("/reports/workload?scope=mine");
    await expect(page.getByRole("heading", { name: "工作量中心" })).toBeVisible();
    await expect(page.getByText("代发出库", { exact: true })).toBeVisible();
    await expect(page.getByText("1 件", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("cell", { name: fixture.executor!.name, exact: true })
    ).toBeVisible();
    await shot(page, "13-13-assignee-workload-shipment-rc1.png");

    await login(page, fixture.b!.email);
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "报表分析" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "代卖结算" })).toBeVisible();
    await expect(page.getByText("已付 2 单", { exact: true })).toBeVisible();
    await shot(page, "13-14-reseller-report-paid-settlements-rc1.png");

    const request = await prisma.fulfillmentRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { reservation: true, inventoryAllocations: true },
    });
    expect(request.status).toBe("SHIPPED");
    expect(request.assignedToId).toBe(fixture.executor!.userId);
    expect(request.trackingNo).toBe(`TRACK-11-13-${runId}`);
    expect(request.reservation?.status).toBe("CONSUMED");
    expect(request.inventoryAllocations).toHaveLength(1);
    expect(request.inventoryAllocations[0].status).toBe("SHIPPED");

    const settlements = await prisma.settlement.findMany({
      where: {
        OR: [
          { fulfillmentRequestId: requestId },
          {
            items: {
              some: { chargeEvent: { sourceType: "FULFILLMENT_REQUEST", sourceId: requestId } },
            },
          },
        ],
      },
      include: { lines: true, items: { include: { chargeEvent: true } } },
    });
    expect(settlements).toHaveLength(2);
    expect(settlements.every((settlement) => settlement.status === "PAID")).toBe(true);
    expect(settlements.some((settlement) => settlement.totalAmount.toString() === "120")).toBe(
      true
    );
    expect(settlements.some((settlement) => settlement.totalAmount.toString() === "25")).toBe(true);
    const supplySettlement = settlements.find((settlement) =>
      settlement.lines.some((line) => line.lineType === "SUPPLY_COST")
    );
    expect(supplySettlement?.totalAmount.toString()).toBe("120");
    expect(supplySettlement?.lines.find((line) => line.lineType === "COMMISSION")?.direction).toBe(
      "INFORMATIONAL"
    );
    const commissionLine = supplySettlement?.lines.find((line) => line.lineType === "COMMISSION");
    expect(commissionLine?.sourceType).toBe("RESALE_LISTING");
    expect(commissionLine?.sourceId).toBe(listingId);

    const resaleEarning = await prisma.earningEvent.findUniqueOrThrow({
      where: {
        storeId_userId_sourceType_sourceId_earningType: {
          storeId: fixture.b!.storeId,
          userId: fixture.b!.userId,
          sourceType: "SETTLEMENT",
          sourceId: supplySettlement!.id,
          earningType: "RESALE_COMMISSION",
        },
      },
      include: { ledgerEntries: true },
    });
    expect(resaleEarning.status).toBe("SETTLED");
    expect(resaleEarning.earningAmount.toString()).toBe("60");
    expect(resaleEarning.ledgerEntries).toHaveLength(1);
    expect(resaleEarning.ledgerEntries[0].status).toBe("POSTED");

    const serviceEarning = await prisma.earningEvent.findUniqueOrThrow({
      where: {
        storeId_userId_sourceType_sourceId_earningType: {
          storeId: fixture.c!.storeId,
          userId: fixture.executor!.userId,
          sourceType: "FULFILLMENT_REQUEST",
          sourceId: requestId,
          earningType: "FULFILLMENT_SERVICE_FEE",
        },
      },
      include: { ledgerEntries: true },
    });
    expect(serviceEarning.status).toBe("SETTLED");
    expect(serviceEarning.earningAmount.toString()).toBe("25");
    expect(serviceEarning.ledgerEntries).toHaveLength(1);
    expect(serviceEarning.ledgerEntries[0].status).toBe("POSTED");

    const workRecords = await prisma.workRecord.findMany({
      where: { sourceType: "FULFILLMENT_REQUEST", sourceId: requestId },
      include: { workType: true },
    });
    expect(workRecords).toHaveLength(1);
    expect(workRecords[0].userId).toBe(fixture.executor!.userId);
    expect(workRecords[0].workType.code).toBe("FULFILLMENT_SHIPMENT");
    expect(workRecords[0].quantity.toString()).toBe("1");

    const fulfillmentNotifications = await prisma.notification.findMany({
      where: { refType: "FULFILLMENT_REQUEST", refId: requestId },
    });
    expect(fulfillmentNotifications.length).toBeGreaterThanOrEqual(3);
    expect(
      fulfillmentNotifications.every(
        (notification) =>
          notification.actionUrl === `/fulfillment/requests/${requestId}` &&
          Boolean(notification.dedupeKey)
      )
    ).toBe(true);
  });
});
