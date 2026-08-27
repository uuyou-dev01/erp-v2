import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "@/lib/prisma";

const runId = Date.now().toString(36);
const memberEmail = `member-${runId}@example.test`;
const revokedEmail = `revoked-${runId}@example.test`;
const expiredEmail = `expired-${runId}@example.test`;
const evidenceDir = path.join(process.cwd(), "docs/testing/releases/v0.9.0/screenshots");
mkdirSync(evidenceDir, { recursive: true });

async function shot(page: Page, name: string, mask = page.locator("__never__")) {
  await page.screenshot({
    path: path.join(evidenceDir, name),
    fullPage: true,
    animations: "disabled",
    mask: [mask],
  });
}

test.describe("internal account onboarding", () => {
  test.afterAll(async () => {
    await prisma.organizationInvitation.deleteMany({
      where: { email: { in: [memberEmail, revokedEmail, expiredEmail] } },
    });
    await prisma.user.deleteMany({ where: { email: memberEmail } });
  });

  test("registers a member only through a copied administrator invitation", async ({
    page,
    browser,
  }) => {
    await page.goto("/settings/team");
    await page.getByRole("button", { name: "邀请成员" }).click();
    await page.getByLabel("成员邮箱").fill(memberEmail);
    await shot(page, "01-01-owner-invitation-filled-rc1.png");
    await page.getByRole("button", { name: "生成链接" }).click();
    const invitationUrl = await page.locator("code").textContent();
    expect(invitationUrl).toContain("/invite/team/");
    await shot(page, "01-02-owner-invitation-created-redacted-rc1.png", page.locator("code"));

    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    await memberPage.goto(`/register?next=${encodeURIComponent(new URL(invitationUrl!).pathname)}`);
    await memberPage.getByLabel("姓名").fill("内部成员");
    await expect(memberPage.getByLabel("邮箱")).toHaveValue(memberEmail);
    await expect(memberPage.getByLabel("邮箱")).toHaveAttribute("readonly", "");
    await memberPage.getByLabel("密码", { exact: true }).fill("internal-member-password");
    await memberPage.getByLabel("确认密码").fill("internal-member-password");
    await shot(memberPage, "01-03-invitee-email-locked-registration-rc1.png");
    await memberPage.getByRole("button", { name: "创建账号" }).click();
    await expect(memberPage.getByRole("heading", { name: "加入企业" })).toBeVisible();
    await memberPage.getByRole("button", { name: "确认加入企业" }).click();
    await expect(memberPage.getByRole("heading", { name: "工作台" })).toBeVisible();
    await shot(memberPage, "01-04-invitee-joined-workbench-rc1.png");

    const membership = await prisma.membership.findFirst({
      where: {
        user: { email: memberEmail },
        organization: { code: "e2e-main" },
        status: "ACTIVE",
      },
      select: { role: true },
    });
    expect(membership?.role).toBe("FULFILLMENT");

    await page.reload();
    const memberRow = page.getByRole("row").filter({ hasText: memberEmail });
    await memberRow.getByRole("button", { name: "重置密码" }).click();
    await expect(page.getByText("一次性密码重置链接已生成")).toBeVisible();
    const resetUrl = await page.locator("code").textContent();
    expect(resetUrl).toContain("/reset-password/");
    await shot(page, "01-05-owner-reset-link-redacted-rc1.png", page.locator("code"));

    const resetContext = await browser.newContext();
    const resetPage = await resetContext.newPage();
    await resetPage.goto(new URL(resetUrl!).pathname);
    await resetPage.getByLabel("新密码", { exact: true }).fill("internal-member-password-v2");
    await resetPage.getByLabel("确认新密码").fill("internal-member-password-v2");
    await shot(resetPage, "01-06-member-reset-form-rc1.png");
    await resetPage.getByRole("button", { name: "重置密码" }).click();
    await expect(resetPage.getByRole("heading", { name: "登录 ERP" })).toBeVisible();
    await resetPage.getByLabel("邮箱").fill(memberEmail);
    await resetPage.getByLabel("密码", { exact: true }).fill("internal-member-password-v2");
    await resetPage.getByRole("button", { name: "登录" }).click();
    await expect(resetPage.getByRole("heading", { name: "工作台" })).toBeVisible();
    await shot(resetPage, "01-07-reset-password-login-success-rc1.png");

    const invalidatedSessionResponse = await memberPage.request.get("/api/v1/mobile/home");
    expect(invalidatedSessionResponse.status()).toBe(401);
    await memberPage.goto("/login");
    await expect(memberPage.getByRole("heading", { name: "登录 ERP" })).toBeVisible();
    await shot(memberPage, "01-08-old-session-rejected-rc1.png");
    await resetContext.close();
    await memberContext.close();

    await page.goto("/settings/team");
    await page.getByRole("button", { name: "邀请成员" }).click();
    await page.getByLabel("成员邮箱").fill(revokedEmail);
    await page.getByRole("button", { name: "生成链接" }).click();
    const revokedUrl = await page.locator("code").textContent();
    await page.getByRole("tab", { name: /待处理邀请/ }).click();
    await page
      .getByRole("row")
      .filter({ hasText: revokedEmail })
      .getByRole("button", { name: "撤销" })
      .click();
    await expect(page.getByText("邀请已撤销")).toBeVisible();
    await shot(page, "01-09-owner-revoked-invitation-rc1.png");
    const revokedContext = await browser.newContext();
    const revokedPage = await revokedContext.newPage();
    await revokedPage.goto(new URL(revokedUrl!).pathname);
    await expect(revokedPage.getByText("此邀请已失效或已被使用")).toBeVisible();
    await shot(revokedPage, "01-10-revoked-invitation-blocked-rc1.png");
    await revokedContext.close();

    if (!(await page.getByLabel("成员邮箱").isVisible())) {
      await page.getByRole("button", { name: "邀请成员" }).click();
    }
    await page.getByLabel("成员邮箱").fill(expiredEmail);
    await page.getByRole("button", { name: "生成链接" }).click();
    const expiredUrl = await page.locator("code").textContent();
    await prisma.organizationInvitation.updateMany({
      where: { email: expiredEmail, status: "PENDING" },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const expiredContext = await browser.newContext();
    const expiredPage = await expiredContext.newPage();
    await expiredPage.goto(new URL(expiredUrl!).pathname);
    await expect(expiredPage.getByText("此邀请已失效或已被使用")).toBeVisible();
    await shot(expiredPage, "01-11-expired-invitation-blocked-rc1.png");
    await expiredContext.close();
  });
});
