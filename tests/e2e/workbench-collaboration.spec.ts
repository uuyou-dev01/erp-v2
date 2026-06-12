import { expect, test } from "@playwright/test";

test("collaboration surfaces render without app errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "选择操作人" })).toBeVisible();

  await page.goto("/workbench");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();
  const sidebar = page.getByRole("complementary");
  await expect(sidebar.getByRole("link", { name: "通知" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "采购单据" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "销售平台" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "团队工作量" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "团队成员" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "店铺管理" })).toBeVisible();

  await page.goto("/notifications");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByRole("heading", { name: "通知" })).toBeVisible();

  await page.goto("/reports/team");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByRole("heading", { name: "团队工作量" })).toBeVisible();

  await page.goto("/settings/team");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByRole("heading", { name: "团队成员" })).toBeVisible();

  await page.goto("/settings/stores");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByRole("heading", { name: "店铺管理" })).toBeVisible();

  expect(
    errors.filter((line) =>
      /Runtime Error|Application error|Internal Server Error|Prisma|Unhandled/i.test(line)
    )
  ).toEqual([]);
});
