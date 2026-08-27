import { expect, test, type Page } from "@playwright/test";
import { prisma } from "@/lib/prisma";

const runId = Date.now().toString(36);
const ownerAEmail = `connection-a-${runId}@example.test`;
const ownerBEmail = `connection-b-${runId}@example.test`;
const organizationAName = `连接发起方 ${runId}`;
const organizationBName = `连接接收方 ${runId}`;
const partnerName = `测试供应商 ${runId}`;

async function registerOrganization(
  page: Page,
  input: { email: string; userName: string; organizationName: string; storeName: string }
) {
  await page.goto("/register");
  await page.getByLabel("姓名").fill(input.userName);
  await page.getByLabel("邮箱").fill(input.email);
  await page.getByLabel("密码", { exact: true }).fill("internal-connection-password");
  await page.getByLabel("确认密码").fill("internal-connection-password");
  await page.getByRole("button", { name: "创建账号" }).click();
  await page.getByLabel("企业或团队名称").fill(input.organizationName);
  await page.getByLabel("第一个店铺名称").fill(input.storeName);
  await page.getByRole("button", { name: "创建企业并开始配置" }).click();
  await expect(page.getByRole("heading", { name: `配置 ${input.storeName}` })).toBeVisible();
  await page.getByRole("link", { name: "暂时跳过" }).click();
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
    await prisma.organizationConnection.deleteMany({
      where: {
        OR: [
          { requesterOrganizationId: { in: organizationIds } },
          { targetOrganizationId: { in: organizationIds } },
        ],
      },
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
    const requesterContext = await browser.newContext();
    const targetContext = await browser.newContext();
    const requesterPage = await requesterContext.newPage();
    const targetPage = await targetContext.newPage();

    await registerOrganization(requesterPage, {
      email: ownerAEmail,
      userName: "连接发起人",
      organizationName: organizationAName,
      storeName: "发起方主店",
    });
    await registerOrganization(targetPage, {
      email: ownerBEmail,
      userName: "连接接收人",
      organizationName: organizationBName,
      storeName: "接收方主店",
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
    await requesterPage.getByRole("button", { name: "发送连接请求" }).click();
    await expect(requesterPage.getByText(`已向 ${organizationBName} 发出连接请求`)).toBeVisible();

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
    await targetPage.getByRole("button", { name: "接受" }).click();
    await expect(targetPage.getByText("企业连接已建立")).toBeVisible();

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

    await requesterContext.close();
    await targetContext.close();
  });
});
