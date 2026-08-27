import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { createPublicCode } from "@/lib/auth/invitation-token";

const runId = Date.now().toString(36);
const ownerAEmail = `connection-a-${runId}@example.test`;
const ownerBEmail = `connection-b-${runId}@example.test`;
const organizationAName = `连接发起方 ${runId}`;
const organizationBName = `连接接收方 ${runId}`;
const partnerName = `测试供应商 ${runId}`;
const evidenceDir = path.join(process.cwd(), "docs/testing/releases/v0.9.0/screenshots");
mkdirSync(evidenceDir, { recursive: true });

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: path.join(evidenceDir, name),
    fullPage: true,
    animations: "disabled",
  });
}

async function createOrganizationFixture(input: {
  email: string;
  userName: string;
  organizationName: string;
  storeName: string;
  code: string;
}) {
  const organization = await prisma.organization.create({
    data: {
      name: input.organizationName,
      code: input.code,
      collaborationCode: createPublicCode("ORG"),
    },
  });
  const store = await prisma.store.create({
    data: {
      organizationId: organization.id,
      name: input.storeName,
      code: `${input.code}-STORE`,
      currency: "CNY",
    },
  });
  const password = "internal-connection-password";
  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.userName,
      password: await hashPassword(password),
      role: "OWNER",
      storeId: store.id,
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.membership.create({
    data: { organizationId: organization.id, userId: user.id, role: "OWNER" },
  });
  await prisma.storeAccess.create({
    data: { storeId: store.id, userId: user.id, role: "OWNER" },
  });
  return { organization, store, password };
}

async function loginOrganization(page: Page, input: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(input.email);
  await page.getByLabel("密码", { exact: true }).fill(input.password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();
}

test.describe("organization connection flow", () => {
  test.afterAll(async () => {
    const organizations = await prisma.organization.findMany({
      where: { name: { in: [organizationAName, organizationBName] } },
      select: {
        id: true,
        stores: { select: { id: true } },
        inventoryPools: { select: { id: true } },
      },
    });
    const organizationIds = organizations.map((item) => item.id);
    const connectionWhere = {
      OR: [
        { requesterOrganizationId: { in: organizationIds } },
        { targetOrganizationId: { in: organizationIds } },
      ],
    };
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT set_config('erp.allow_audit_event_mutation', 'on', true)");
      await tx.organizationConnectionEvent.deleteMany({
        where: { connection: connectionWhere },
      });
      await tx.organizationConnection.deleteMany({ where: connectionWhere });
    });
    await prisma.notification.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.partner.deleteMany({
      where: { store: { organizationId: { in: organizationIds } } },
    });
    await prisma.organizationInvitation.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.user.deleteMany({ where: { email: { in: [ownerAEmail, ownerBEmail] } } });
    await prisma.inventoryPool.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.store.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  test("requires the target administrator to accept an exact-code request", async ({ browser }) => {
    test.setTimeout(90_000);
    const requesterContext = await browser.newContext();
    const targetContext = await browser.newContext();
    const requesterPage = await requesterContext.newPage();
    const targetPage = await targetContext.newPage();

    const requesterFixture = await createOrganizationFixture({
      email: ownerAEmail,
      userName: "连接发起人",
      organizationName: organizationAName,
      storeName: "发起方主店",
      code: `CONN-A-${runId}`.toUpperCase(),
    });
    const targetFixture = await createOrganizationFixture({
      email: ownerBEmail,
      userName: "连接接收人",
      organizationName: organizationBName,
      storeName: "接收方主店",
      code: `CONN-B-${runId}`.toUpperCase(),
    });
    await loginOrganization(requesterPage, {
      email: ownerAEmail,
      password: requesterFixture.password,
    });
    await loginOrganization(targetPage, {
      email: ownerBEmail,
      password: targetFixture.password,
    });

    const [requesterOrganization, targetOrganization] = await Promise.all([
      prisma.organization.findFirstOrThrow({
        where: { name: organizationAName },
        select: { id: true, stores: { take: 1, select: { id: true } } },
      }),
      prisma.organization.findFirstOrThrow({
        where: { name: organizationBName },
        select: { id: true, collaborationCode: true },
      }),
    ]);
    const partner = await prisma.partner.create({
      data: {
        storeId: requesterOrganization.stores[0].id,
        code: `SUP_${runId.toUpperCase()}`,
        name: partnerName,
        type: "SUPPLIER",
      },
    });

    await requesterPage.goto("/settings/connections");
    await requesterPage.getByRole("button", { name: "发起连接" }).click();
    await requesterPage.getByLabel("从哪个合作方建立连接").selectOption(partner.id);
    await requesterPage.getByLabel("对方企业协作码").fill(targetOrganization.collaborationCode);
    await requesterPage.getByRole("button", { name: "查找" }).click();
    await expect(requesterPage.getByText(organizationBName)).toBeVisible();
    await shot(requesterPage, "05-01-requester-exact-code-match-rc1.png");
    await requesterPage.getByRole("button", { name: "发送连接请求" }).click();
    await expect(requesterPage.getByText(`已向 ${organizationBName} 发出连接请求`)).toBeVisible();
    await shot(requesterPage, "05-02-requester-pending-connection-rc1.png");

    const pending = await prisma.organizationConnection.findFirstOrThrow({
      where: {
        requesterOrganizationId: requesterOrganization.id,
        targetOrganizationId: targetOrganization.id,
      },
      select: { status: true },
    });
    expect(pending.status).toBe("PENDING");

    await targetPage.goto("/settings/connections");
    await expect(targetPage.getByText(organizationAName)).toBeVisible();
    await shot(targetPage, "05-03-target-received-connection-rc1.png");
    await targetPage.getByRole("button", { name: "接受" }).click();
    await expect(targetPage.getByText("企业连接已建立")).toBeVisible();
    await shot(targetPage, "05-04-target-accepted-connection-rc1.png");

    const [active, linkedPartner] = await Promise.all([
      prisma.organizationConnection.findFirstOrThrow({
        where: {
          requesterOrganizationId: requesterOrganization.id,
          targetOrganizationId: targetOrganization.id,
        },
        select: { status: true },
      }),
      prisma.partner.findUniqueOrThrow({
        where: { id: partner.id },
        select: { organizationId: true },
      }),
    ]);
    expect(active.status).toBe("ACTIVE");
    expect(linkedPartner.organizationId).toBe(targetOrganization.id);

    await requesterPage.goto("/notifications");
    await expect(requesterPage.getByText(`${organizationBName} 已接受企业连接`)).toBeVisible();
    await shot(requesterPage, "05-05-requester-accepted-notification-rc1.png");

    await targetPage.goto("/settings/connections");
    await targetPage.getByRole("tab", { name: "已连接企业" }).click();
    await targetPage.getByRole("button", { name: "解除连接" }).click();
    await expect(targetPage.getByText("企业连接已解除")).toBeVisible();
    await targetPage.getByRole("tab", { name: "历史记录" }).click();
    await shot(targetPage, "05-06-target-ended-history-rc1.png");

    async function reconnectFromRequester() {
      await requesterPage.goto("/settings/connections");
      await requesterPage.getByRole("button", { name: "发起连接" }).click();
      await requesterPage.getByLabel("从哪个合作方建立连接").selectOption(partner.id);
      await requesterPage.getByLabel("对方企业协作码").fill(targetOrganization.collaborationCode);
      await requesterPage.getByRole("button", { name: "查找" }).click();
      await requesterPage.getByRole("button", { name: "发送连接请求" }).click();
      await expect(requesterPage.getByText(`已向 ${organizationBName} 发出连接请求`)).toBeVisible();
    }

    await reconnectFromRequester();
    await targetPage.goto("/settings/connections");
    await targetPage.getByRole("button", { name: "拒绝" }).click();
    await expect(targetPage.getByText("连接请求已拒绝")).toBeVisible();
    await targetPage.getByRole("tab", { name: "历史记录" }).click();
    await shot(targetPage, "05-07-target-rejected-history-rc1.png");

    await requesterPage.goto("/notifications");
    await expect(requesterPage.getByText(`${organizationBName} 已拒绝企业连接`)).toBeVisible();
    await shot(requesterPage, "05-08-requester-rejected-notification-rc1.png");

    await reconnectFromRequester();
    await targetPage.goto("/settings/connections");
    await targetPage.getByRole("button", { name: "接受" }).click();
    await expect(targetPage.getByText("企业连接已建立")).toBeVisible();
    await targetPage.getByRole("tab", { name: "已连接企业" }).click();
    await shot(targetPage, "05-09-target-reconnected-active-rc1.png");

    const events = await prisma.organizationConnectionEvent.findMany({
      where: {
        connection: { pairKey: [requesterOrganization.id, targetOrganization.id].sort().join(":") },
      },
      select: { eventType: true },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((event) => event.eventType)).toEqual([
      "REQUESTED",
      "ACCEPTED",
      "ENDED",
      "REOPENED",
      "REJECTED",
      "REOPENED",
      "ACCEPTED",
    ]);

    await requesterContext.close();
    await targetContext.close();
  });
});
