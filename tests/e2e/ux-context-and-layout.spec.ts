import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 955, height: 900 } });

test("catalog retains its search through date queries and applies SKU links", async ({ page }) => {
  await page.goto("/inventory/skus");
  await page.getByRole("textbox", { name: "搜索商品", exact: true }).fill("E2E-QA-STOCK-001");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "搜索商品", exact: true })).toHaveValue(
    "E2E-QA-STOCK-001"
  );
  await expect(page).toHaveURL(/q=E2E-QA-STOCK-001/);
  const catalogUrl = page.url();
  await page.getByRole("link", { name: "详情", exact: true }).first().click();
  await expect(page).toHaveURL(/returnTo=/);
  await page.getByRole("link", { name: "入库批次", exact: true }).click();
  await expect(page).toHaveURL(/\/inventory\/lots\?skuId=/);
  await expect(page.getByText("已限定当前商品", { exact: false })).toBeVisible();
  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(catalogUrl);
  await expect(page.getByRole("textbox", { name: "搜索商品", exact: true })).toHaveValue(
    "E2E-QA-STOCK-001"
  );
});

test("quick entry has a compact form and supports keyboard dismissal", async ({ page }) => {
  await page.goto("/workbench?action=quickEntry");
  const dialog = page.getByRole("dialog", { name: "快速录入", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "单笔录入", exact: true })).toBeVisible();
  await expect(dialog.getByLabel("商品组 / 商品名", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page).not.toHaveURL(/action=quickEntry/);
  await expect(page.getByRole("navigation", { name: "工作优先级" })).toBeVisible();
});
