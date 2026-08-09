import { expect, test } from "@playwright/test";

test("publishes from inventory on the simplified shared-stock page", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  await page.goto("/marketplace/new");
  await expect(page.getByRole("heading", { name: "发布货盘", exact: true })).toBeVisible();
  await expect(page.getByText("发布不占用库存", { exact: true })).toBeVisible();
  await expect(
    page.getByText("多个账号和代卖方可以同时上架；订单成交后才锁定真实库存。")
  ).toBeVisible();

  const inventoryChoice = page
    .getByRole("button")
    .filter({ has: page.getByRole("checkbox", { name: /^选择 / }) })
    .first();
  await expect(inventoryChoice).toBeVisible();
  await inventoryChoice.click();
  await expect(page.getByRole("heading", { name: "供货商品与价格" })).toBeVisible();
  await expect(page.getByText("内部成本", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("建议供货价", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("实际供货价 *", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "下一步" })).toHaveCount(0);
  await expect(page.getByText("内部销售账号")).toHaveCount(0);

  await page.getByText("高级设置", { exact: true }).click();
  await expect(
    page.getByText("销售平台和具体账号由代卖方在创建上架时选择，不在这里配置。")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "确认发布" })).toBeVisible();

  expect(
    runtimeErrors.filter((line) =>
      /Runtime Error|Application error|Internal Server Error|Prisma|Unhandled/i.test(line)
    )
  ).toEqual([]);
});
