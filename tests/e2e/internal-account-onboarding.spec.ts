import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";

const runId = Date.now().toString(36);
const ownerEmail = `owner-${runId}@example.test`;
const memberEmail = `member-${runId}@example.test`;
const organizationName = `内部注册测试 ${runId}`;

test.describe("internal account onboarding", () => {
  test.afterAll(async () => {
    const organization = await prisma.organization.findFirst({
      where: { name: organizationName },
      select: {
        id: true,
        stores: { select: { id: true } },
        inventoryPools: { select: { id: true } },
      },
    });
    if (organization) {
      await prisma.organizationInvitation.deleteMany({
        where: { organizationId: organization.id },
      });
      await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, memberEmail] } } });
      await prisma.inventoryPool.deleteMany({
        where: { id: { in: organization.inventoryPools.map((item) => item.id) } },
      });
      await prisma.store.deleteMany({
        where: { id: { in: organization.stores.map((item) => item.id) } },
      });
      await prisma.organization.delete({ where: { id: organization.id } });
    } else {
      await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, memberEmail] } } });
    }
  });

  test("registers an owner, creates an organization, and accepts a copied invitation", async ({
    page,
    browser,
  }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: "创建个人账号" })).toBeVisible();
    await page.getByLabel("姓名").fill("内部所有者");
    await page.getByLabel("邮箱").fill(ownerEmail);
    await page.getByLabel("密码", { exact: true }).fill("internal-test-password");
    await page.getByLabel("确认密码").fill("internal-test-password");
    await page.getByRole("button", { name: "创建账号" }).click();

    await expect(page.getByRole("heading", { name: /你好，内部所有者/ })).toBeVisible();
    await page.getByLabel("企业或团队名称").fill(organizationName);
    await page.getByLabel("第一个店铺名称").fill("内部主店");
    await page.getByRole("button", { name: "创建企业并开始配置" }).click();
    await expect(page.getByRole("heading", { name: "配置 内部主店" })).toBeVisible();
    await page.getByRole("link", { name: "暂时跳过" }).click();
    await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();

    await page.goto("/settings/team");
    await page.getByRole("button", { name: "邀请成员" }).click();
    await page.getByLabel("成员邮箱").fill(memberEmail);
    await page.getByRole("button", { name: "生成链接" }).click();
    const invitationUrl = await page.locator("code").textContent();
    expect(invitationUrl).toContain("/invite/team/");

    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    await memberPage.goto(`/register?next=${encodeURIComponent(new URL(invitationUrl!).pathname)}`);
    await memberPage.getByLabel("姓名").fill("内部成员");
    await memberPage.getByLabel("邮箱").fill(memberEmail);
    await memberPage.getByLabel("密码", { exact: true }).fill("internal-member-password");
    await memberPage.getByLabel("确认密码").fill("internal-member-password");
    await memberPage.getByRole("button", { name: "创建账号" }).click();
    await expect(memberPage.getByRole("heading", { name: "加入企业" })).toBeVisible();
    await memberPage.getByRole("button", { name: "确认加入企业" }).click();
    await expect(memberPage.getByRole("heading", { name: "工作台" })).toBeVisible();
    await memberContext.close();

    const membership = await prisma.membership.findFirst({
      where: {
        user: { email: memberEmail },
        organization: { name: organizationName },
        status: "ACTIVE",
      },
      select: { role: true },
    });
    expect(membership?.role).toBe("FULFILLMENT");

    await page.goto("/settings/team");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "转为所有者" }).click();
    await expect(page.getByText("企业所有权已转移")).toBeVisible();
    const transferred = await prisma.membership.findFirstOrThrow({
      where: { user: { email: memberEmail }, organization: { name: organizationName } },
      select: { role: true },
    });
    expect(transferred.role).toBe("OWNER");

    await page.goto("/settings/personal");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "退出企业" }).click();
    await expect(page.getByRole("heading", { name: /你好，内部所有者/ })).toBeVisible();
    const formerOwner = await prisma.membership.findFirstOrThrow({
      where: { user: { email: ownerEmail }, organization: { name: organizationName } },
      select: { status: true },
    });
    expect(formerOwner.status).toBe("INACTIVE");
  });
});
