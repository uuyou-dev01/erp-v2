import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";

test("independent SKU starts with product name", async ({ page }) => {
  await page.goto("/inventory/skus/new?mode=simple");
  const name = page.getByLabel("独立 SKU名称 *", { exact: true });
  await expect(name).toBeVisible();
  await expect(page.locator("main form input").first()).toHaveAttribute("id", "name");
  const nameBox = await name.boundingBox();
  const imageBox = await page.getByText("商品图片", { exact: true }).boundingBox();
  expect(nameBox!.y).toBeLessThan(imageBox!.y);
  await name.fill("顺序验证商品");
});

test("create, edit, find and delete categories directly in their tree location", async ({
  page,
}) => {
  const suffix = Date.now();
  const rootName = `树内顶级${suffix}`;
  const childName = `树内子级${suffix}`;
  const leafName = `系统下企业${suffix}`;
  await page.goto("/settings/categories");
  const tree = page.getByRole("region", { name: "品类结构", exact: true });
  const detail = page.getByRole("region", { name: "品类详情", exact: true });
  const create = async (name: string) => {
    await tree.getByRole("textbox", { name: /新增.*品类/ }).fill(name);
    await tree.getByRole("button", { name: "创建品类", exact: true }).click();
    await expect(detail.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(tree.getByText(name, { exact: true })).toBeInViewport();
  };

  await tree.getByRole("button", { name: "新增顶级品类", exact: true }).click();
  await create(rootName);
  await expect(detail.getByLabel("品类名称", { exact: true })).toHaveValue(rootName);
  await tree.getByRole("button", { name: `在${rootName}下新增子品类`, exact: true }).click();
  await create(childName);
  await expect(detail.getByLabel("上级品类")).not.toHaveValue("");
  await tree.getByRole("button", { name: `收起${rootName}`, exact: true }).click();
  await expect(tree.getByText(childName, { exact: true })).toBeHidden();
  await tree.getByRole("button", { name: `展开${rootName}`, exact: true }).click();
  await expect(tree.getByText(childName, { exact: true })).toBeVisible();

  await tree.getByRole("button", { name: `删除${rootName}`, exact: true }).click();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(
    page.getByText("该品类下还有子品类，请先移动或删除子品类", { exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "取消", exact: true }).click();

  await tree.getByRole("button", { name: "在服装下新增子品类", exact: true }).click();
  await create(leafName);
  await expect(detail.getByText(`鞋服 / 服装 / ${leafName}`, { exact: true })).toBeVisible();
  await detail.getByLabel("别名", { exact: true }).fill("快捷搜索别名");
  await detail.getByRole("button", { name: "保存修改" }).click();
  await expect(detail.getByRole("status")).toHaveText("已保存");
  await tree.getByRole("button", { name: "企业自定义", exact: true }).click();
  await tree.getByLabel("搜索品类").fill("快捷搜索别名");
  await expect(tree.getByText(leafName, { exact: true })).toBeVisible();
  await expect(tree.getByText("服装", { exact: true })).toBeVisible();
  await page.reload();
  await tree.getByText(leafName, { exact: true }).click();
  await expect(detail.getByLabel("品类名称", { exact: true })).toHaveValue(leafName);
  await expect(detail.getByLabel("别名", { exact: true })).toHaveValue("快捷搜索别名");

  const category = await prisma.productCategory.findFirstOrThrow({ where: { name: leafName } });
  const sku = await prisma.sKU.create({
    data: {
      storeId: "store_1",
      name: "品类引用测试商品",
      code: `CATREF_${suffix}`,
      categoryId: category.id,
    },
  });
  await tree.getByRole("button", { name: `删除${leafName}`, exact: true }).click();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(
    page.getByText("该品类已被商品引用，请先调整商品分类，或将品类设为停用", { exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await prisma.sKU.delete({ where: { id: sku.id } });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(tree.getByRole("button", { name: `删除${leafName}`, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await page.screenshot({ path: "test-results/category-structure-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "test-results/category-structure-desktop.png", fullPage: true });

  for (const name of [childName, rootName, leafName]) {
    await tree.getByRole("button", { name: `删除${name}`, exact: true }).click();
    await page.getByRole("button", { name: "确认删除", exact: true }).click();
    await expect(tree.getByText(name, { exact: true })).toHaveCount(0);
  }
  await page.reload();
  await expect(tree.getByText(leafName, { exact: true })).toHaveCount(0);
});
