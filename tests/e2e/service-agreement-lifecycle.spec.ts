import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { createPublicCode } from "@/lib/auth/invitation-token";

const runId = Date.now().toString(36);
const evidenceDir = path.join(process.cwd(), "docs/testing/releases/v0.9.0/screenshots");
const ownerAEmail = `agreement-client-${runId}@example.test`;
const ownerBEmail = `agreement-provider-${runId}@example.test`;
const password = "agreement-e2e-password";
mkdirSync(evidenceDir, { recursive: true });

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: path.join(evidenceDir, name),
    fullPage: true,
    animations: "disabled",
  });
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();
}

test.describe("service agreement lifecycle evidence", () => {
  let clientOrganizationId = "";
  let providerOrganizationId = "";
  let clientStoreId = "";
  let providerStoreId = "";
  let clientOwnerId = "";
  let providerOwnerId = "";
  let poolId = "";
  let connectionId = "";

  test.beforeAll(async () => {
    const [clientOrganization, providerOrganization] = await Promise.all([
      prisma.organization.create({
        data: {
          name: `协议客户企业 ${runId}`,
          code: `AGR-CLIENT-${runId}`.toUpperCase(),
          collaborationCode: createPublicCode("ORG"),
        },
      }),
      prisma.organization.create({
        data: {
          name: `协议服务企业 ${runId}`,
          code: `AGR-PROVIDER-${runId}`.toUpperCase(),
          collaborationCode: createPublicCode("ORG"),
        },
      }),
    ]);
    clientOrganizationId = clientOrganization.id;
    providerOrganizationId = providerOrganization.id;

    const [clientStore, providerStore] = await Promise.all([
      prisma.store.create({
        data: {
          organizationId: clientOrganization.id,
          name: `协议客户店铺 ${runId}`,
          code: `AGR-CLIENT-STORE-${runId}`.toUpperCase(),
          currency: "CNY",
        },
      }),
      prisma.store.create({
        data: {
          organizationId: providerOrganization.id,
          name: `协议服务店铺 ${runId}`,
          code: `AGR-PROVIDER-STORE-${runId}`.toUpperCase(),
          currency: "JPY",
        },
      }),
    ]);
    clientStoreId = clientStore.id;
    providerStoreId = providerStore.id;

    const [clientOwner, providerOwner] = await Promise.all([
      prisma.user.create({
        data: {
          email: ownerAEmail,
          name: "协议客户管理员",
          password: await hashPassword(password),
          role: "OWNER",
          storeId: clientStore.id,
          emailVerifiedAt: new Date(),
        },
      }),
      prisma.user.create({
        data: {
          email: ownerBEmail,
          name: "协议服务管理员",
          password: await hashPassword(password),
          role: "OWNER",
          storeId: providerStore.id,
          emailVerifiedAt: new Date(),
        },
      }),
    ]);
    clientOwnerId = clientOwner.id;
    providerOwnerId = providerOwner.id;

    await Promise.all([
      prisma.membership.create({
        data: { organizationId: clientOrganization.id, userId: clientOwner.id, role: "OWNER" },
      }),
      prisma.membership.create({
        data: { organizationId: providerOrganization.id, userId: providerOwner.id, role: "OWNER" },
      }),
      prisma.storeAccess.create({
        data: { storeId: clientStore.id, userId: clientOwner.id, role: "OWNER" },
      }),
      prisma.storeAccess.create({
        data: { storeId: providerStore.id, userId: providerOwner.id, role: "OWNER" },
      }),
    ]);

    const pool = await prisma.inventoryPool.update({
      where: { legacyStoreId: clientStore.id },
      data: {
        code: `AGR-POOL-${runId}`.toUpperCase(),
        name: `协议客户货盘 ${runId}`,
        baseCurrency: "CNY",
      },
    });
    poolId = pool.id;
    await prisma.inventoryPoolAccess.upsert({
      where: {
        inventoryPoolId_userId: { inventoryPoolId: pool.id, userId: clientOwner.id },
      },
      update: { role: "OWNER" },
      create: { inventoryPoolId: pool.id, userId: clientOwner.id, role: "OWNER" },
    });

    const pairKey = [clientOrganization.id, providerOrganization.id].sort().join(":");
    const connection = await prisma.organizationConnection.create({
      data: {
        requesterOrganizationId: clientOrganization.id,
        targetOrganizationId: providerOrganization.id,
        pairKey,
        status: "ACTIVE",
        requestedById: clientOwner.id,
        respondedById: providerOwner.id,
        respondedAt: new Date(),
        events: {
          create: {
            eventType: "ACCEPTED",
            actorUserId: providerOwner.id,
            fromStatus: "PENDING",
            toStatus: "ACTIVE",
            metadata: { source: "e2e-base-fixture" },
          },
        },
      },
    });
    connectionId = connection.id;
  });

  test.afterAll(async () => {
    const organizationIds = [clientOrganizationId, providerOrganizationId].filter(Boolean);
    await prisma.notificationOutbox.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.notification.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.serviceAgreement.deleteMany({
      where: {
        OR: [
          { clientOrganizationId: { in: organizationIds } },
          { providerOrganizationId: { in: organizationIds } },
        ],
      },
    });
    if (connectionId) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          "SELECT set_config('erp.allow_audit_event_mutation', 'on', true)"
        );
        await tx.organizationConnectionEvent.deleteMany({ where: { connectionId } });
        await tx.organizationConnection.deleteMany({ where: { id: connectionId } });
      });
    }
    if (poolId) await prisma.inventoryPool.deleteMany({ where: { id: poolId } });
    await prisma.authAuditEvent.deleteMany({
      where: { userId: { in: [clientOwnerId, providerOwnerId].filter(Boolean) } },
    });
    await prisma.user.deleteMany({ where: { email: { in: [ownerAEmail, ownerBEmail] } } });
    await prisma.store.deleteMany({
      where: { id: { in: [clientStoreId, providerStoreId].filter(Boolean) } },
    });
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  test("proposes, confirms, pauses, resumes, revises and ends without overwriting history", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const clientContext = await browser.newContext();
    const providerContext = await browser.newContext();
    const clientPage = await clientContext.newPage();
    const providerPage = await providerContext.newPage();
    await login(clientPage, ownerAEmail);
    await login(providerPage, ownerBEmail);

    await clientPage.goto("/settings/business-structure");
    await clientPage.getByRole("button", { name: /创建服务协议/ }).click();
    await clientPage.getByLabel("服务主体").selectOption(providerOrganizationId);
    await clientPage.getByLabel("客户货盘").selectOption(poolId);
    await clientPage.getByLabel("结算币种").fill("CNY");
    await clientPage.getByLabel("账期（天）").fill("7");
    await clientPage.getByLabel("约定说明").fill("首版：代发与检查服务，按周结算。");
    await shot(clientPage, "06-01-client-agreement-proposal-filled-rc1.png");
    await clientPage.getByRole("button", { name: "创建服务协议", exact: true }).click();
    await expect(clientPage.getByText("服务协议已创建")).toBeVisible();
    await clientPage.reload();
    await expect(clientPage.getByText("PENDING_COUNTERPARTY")).toBeVisible();
    await expect(clientPage.getByRole("button", { name: "对方确认启用" })).toHaveCount(0);
    await shot(clientPage, "06-02-proposer-cannot-self-confirm-rc1.png");

    const firstAgreement = await prisma.serviceAgreement.findFirstOrThrow({
      where: {
        clientOrganizationId,
        providerOrganizationId,
        version: 1,
      },
    });
    await providerPage.goto("/notifications");
    const proposedNotice = providerPage.getByText(/发来服务协议/).first();
    await expect(proposedNotice).toBeVisible();
    await shot(providerPage, "06-03-provider-proposal-notification-rc1.png");
    await proposedNotice.click();
    await expect(providerPage).toHaveURL(new RegExp(`agreement-${firstAgreement.id}$`));
    await expect(providerPage.getByRole("button", { name: "对方确认启用" })).toBeVisible();
    await shot(providerPage, "06-04-provider-confirmation-view-rc1.png");
    await providerPage.getByRole("button", { name: "对方确认启用" }).click();
    await expect(providerPage.getByText("已启用")).toBeVisible();

    await clientPage.goto("/notifications");
    await expect(clientPage.getByText("对方已接受服务协议")).toBeVisible();
    await shot(clientPage, "06-05-client-accepted-notification-rc1.png");
    await clientPage.goto(`/settings/business-structure#agreement-${firstAgreement.id}`);
    await clientPage.getByRole("button", { name: "暂停" }).click();
    await expect(clientPage.getByText("已暂停")).toBeVisible();
    await shot(clientPage, "06-06-client-paused-agreement-rc1.png");

    await providerPage.goto("/notifications");
    await expect(providerPage.getByText(/服务协议 v1 已暂停/)).toBeVisible();
    await shot(providerPage, "06-07-provider-paused-notification-rc1.png");
    await providerPage.goto(`/settings/business-structure#agreement-${firstAgreement.id}`);
    await providerPage.getByRole("button", { name: "对方确认恢复" }).click();
    await expect(providerPage.getByText("已恢复")).toBeVisible();

    await clientPage.goto(
      `/settings/business-structure?state=resume-${runId}#agreement-${firstAgreement.id}`,
    );
    await expect(clientPage.locator(`#agreement-${firstAgreement.id}`).getByText("ACTIVE")).toBeVisible();
    await clientPage.getByRole("button", { name: "创建修订版" }).click();
    const revisionDialog = clientPage.getByRole("dialog", { name: "创建协议修订版 v2" });
    await revisionDialog.getByLabel("结算币种").fill("JPY");
    await revisionDialog.getByLabel("账期（天）").fill("14");
    await revisionDialog.getByLabel("约定说明").fill("第二版：增加退件处理，改为日元双周结算。");
    await revisionDialog.getByText("退件处理").click();
    await shot(clientPage, "06-08-client-revision-filled-rc1.png");
    await revisionDialog.getByRole("button", { name: "发送修订版" }).click();
    await expect(clientPage.getByText("修订版已发送给对方确认")).toBeVisible();

    const secondAgreement = await prisma.serviceAgreement.findFirstOrThrow({
      where: { supersedesAgreementId: firstAgreement.id },
    });
    await providerPage.goto("/notifications");
    await expect(providerPage.getByText("服务协议修订版 v2 待确认")).toBeVisible();
    await shot(providerPage, "06-09-provider-revision-notification-rc1.png");
    await providerPage.goto(`/settings/business-structure#agreement-${secondAgreement.id}`);
    await providerPage.getByRole("button", { name: "对方确认启用" }).click();
    await expect(providerPage.getByText("已启用")).toBeVisible();

    const [oldVersion, activeVersion] = await Promise.all([
      prisma.serviceAgreement.findUniqueOrThrow({ where: { id: firstAgreement.id } }),
      prisma.serviceAgreement.findUniqueOrThrow({ where: { id: secondAgreement.id } }),
    ]);
    expect(oldVersion.status).toBe("ENDED");
    expect(oldVersion.settlementCurrency).toBe("CNY");
    expect(activeVersion.status).toBe("ACTIVE");
    expect(activeVersion.settlementCurrency).toBe("JPY");
    expect(activeVersion.version).toBe(2);

    await clientPage.goto(`/settings/business-structure#agreement-${secondAgreement.id}`);
    clientPage.once("dialog", (dialog) => dialog.accept());
    await clientPage.getByRole("button", { name: "结束" }).first().click();
    await expect(clientPage.getByText("已结束")).toBeVisible();
    await clientPage.reload();
    const versionTwoRow = clientPage.locator(`#agreement-${secondAgreement.id}`);
    await expect(versionTwoRow.getByText("ENDED")).toBeVisible();
    await shot(clientPage, "06-10-client-ended-v2-history-preserved-rc1.png");

    await providerPage.goto("/notifications");
    await expect(providerPage.getByText("服务协议 v2 已结束")).toBeVisible();
    await shot(providerPage, "06-11-provider-ended-notification-rc1.png");

    await clientContext.close();
    await providerContext.close();
  });
});
