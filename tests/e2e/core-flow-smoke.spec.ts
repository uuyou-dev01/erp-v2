import { expect, test } from "@playwright/test";

const routes = [
  { path: "/workbench", heading: "工作台" },
  { path: "/procurement", heading: "采购管理" },
  { path: "/logistics/consolidations", heading: "集运批次" },
  { path: "/inventory/sellable", heading: "库存看板" },
  { path: "/inventory/skus", heading: "商品档案" },
  { path: "/listing", heading: "Listing 分类" },
  { path: "/sales", heading: "销售订单" },
  { path: "/reports", heading: "报表分析" },
];

test.describe("core ERP modules", () => {
  for (const route of routes) {
    test(`${route.path} renders without runtime errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));

      await page.goto(route.path);
      await expect(page.locator("main")).toBeVisible();
      await expect(
        page.getByRole("heading", { name: route.heading, exact: true }),
      ).toBeVisible();

      expect(
        errors.filter((line) =>
          /Runtime Error|Application error|Internal Server Error|Prisma|Unhandled/i.test(line),
        ),
      ).toEqual([]);
    });
  }
});
