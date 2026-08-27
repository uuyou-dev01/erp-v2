import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test as setup } from "@playwright/test";

const authFile = process.env.E2E_AUTH_FILE ?? ".data/e2e-auth-3100.json";

setup("authenticate synthetic E2E owner through the login UI", async ({ page }) => {
  const email = process.env.E2E_OWNER_EMAIL ?? "e2e-owner@example.invalid";
  const password =
    process.env.E2E_OWNER_PASSWORD ?? "e2e-owner-password-7fd243e68c2d4b33";

  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();

  mkdirSync(dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
