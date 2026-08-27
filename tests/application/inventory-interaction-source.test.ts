import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const inventoryInteractionFiles = [
  "components/inventory/sku-form.tsx",
  "components/inventory/stocktake-grid.tsx",
  "components/inventory/lot-split-form.tsx",
];

describe("inventory interaction source hygiene", () => {
  it("does not use browser-native dialogs or console errors in high-frequency inventory actions", () => {
    for (const file of inventoryInteractionFiles) {
      const source = readFileSync(join(process.cwd(), file), "utf8");

      expect(source, file).not.toMatch(/\balert\(/);
      expect(source, file).not.toMatch(/\bconfirm\(/);
      expect(source, file).not.toMatch(/\bwindow\.confirm\(/);
      expect(source, file).not.toMatch(/\bconsole\.error\(/);
    }
  });

  it("uses structured action results for stocktake submissions", () => {
    const stocktakeActionSource = readFileSync(
      join(process.cwd(), "app/actions/stocktake.ts"),
      "utf8"
    );
    const stocktakeGridSource = readFileSync(
      join(process.cwd(), "components/inventory/stocktake-grid.tsx"),
      "utf8"
    );

    expect(stocktakeActionSource).toMatch(
      /export async function submitSkuLocationStocktakeAdjustmentsAction/
    );
    expect(stocktakeGridSource).toMatch(/submitSkuLocationStocktakeAdjustmentsAction/);
    expect(stocktakeGridSource).not.toMatch(/submitSkuLocationStocktakeAdjustments,\n/);
    expect(stocktakeGridSource).not.toMatch(/new Decimal\(draft\./);
  });

  it("uses structured action results for lot split submissions", () => {
    const actionSource = readFileSync(join(process.cwd(), "app/actions/inventory-lots.ts"), "utf8");
    const splitFormSource = readFileSync(
      join(process.cwd(), "components/inventory/lot-split-form.tsx"),
      "utf8"
    );

    expect(actionSource).toMatch(/export async function convertLotToItemUnitAction/);
    expect(actionSource).toContain("return actionSuccess");
    expect(actionSource).toContain("return toActionFailure");

    expect(splitFormSource).toMatch(/convertLotToItemUnitAction/);
    expect(splitFormSource).not.toMatch(/await convertLotToItemUnit\(/);
    expect(splitFormSource).toContain('role="alert"');
  });

  it("keeps product-group and variant image ownership explicit without duplicate actions", () => {
    const formSource = readFileSync(
      join(process.cwd(), "components/inventory/sku-form.tsx"),
      "utf8"
    );
    const actionSource = readFileSync(
      join(process.cwd(), "components/inventory/sku-detail-actions.tsx"),
      "utf8"
    );
    const detailPageSource = readFileSync(
      join(process.cwd(), "app/(dashboard)/inventory/skus/[id]/page.tsx"),
      "utf8"
    );

    expect(formSource).toContain('isVariant ? "当前变体图片" : isGroup ? "商品组主图"');
    expect(formSource.indexOf("当前变体图片")).toBeLessThan(formSource.indexOf("价格与识别"));
    expect(formSource).toContain("未上传时使用所属商品组主图");
    expect(formSource).toContain("images: catalog.images");
    expect(formSource).toContain("sticky bottom-0");
    expect(actionSource).toContain("编辑当前变体");
    expect(actionSource).toContain("编辑商品组档案");
    expect(actionSource).not.toContain("修改商品组图片");
    expect(actionSource).not.toContain("修改变体图片");
    expect(detailPageSource).toContain("const selectedVariant = variantId");
    expect(detailPageSource).toContain('"变体图"');
    expect(detailPageSource).toContain('"商品组图"');
    expect(detailPageSource).toContain("当前变体未设置图片，正在沿用商品组主图");
    expect(detailPageSource).toContain("groupImageEditHref=");
  });

  it("left-aligns destructive dialogs and guides blocked SKU deletion", () => {
    const dialogSource = readFileSync(
      join(process.cwd(), "components/shared/confirm-dialog.tsx"),
      "utf8"
    );
    const skuActionsSource = readFileSync(
      join(process.cwd(), "components/inventory/sku-catalog-row-actions.tsx"),
      "utf8"
    );

    expect(dialogSource).toContain("max-w-md text-left");
    expect(dialogSource).toContain("hideConfirm");
    expect(skuActionsSource).toContain("getSKUDeletionImpactAction");
    expect(skuActionsSource).toContain("为什么不能删除");
    expect(skuActionsSource).toContain("改为停用 SKU");
    expect(skuActionsSource).toContain("deleteImpact.references.map");
  });

  it("connects SKU deletion guidance to searchable and actionable inventory lots", () => {
    const lotPageSource = readFileSync(
      join(process.cwd(), "app/(dashboard)/inventory/lots/page.tsx"),
      "utf8"
    );
    const lotDeleteSource = readFileSync(
      join(process.cwd(), "components/inventory/inventory-lot-delete-button.tsx"),
      "utf8"
    );

    expect(lotPageSource).toContain("searchParams");
    expect(lotPageSource).toContain("InventoryLotDeleteButton");
    expect(lotPageSource).toContain("搜索 SKU、商品或仓库");
    expect(lotPageSource).not.toContain("批次信息密度");
    expect(lotPageSource).not.toContain("open={detailedView}");
    expect(lotPageSource).toContain("group-open:rotate-180");
    expect(lotPageSource).toContain("个库存位置");
    expect(lotPageSource).toContain("展开详情");
    expect(lotPageSource).toContain("规格概览");
    expect(lotPageSource).toContain("compactVariantName");
    expect(lotDeleteSource).toContain("getInventoryLotDeletionImpactAction");
    expect(lotDeleteSource).toContain("为什么不能删除");
    expect(lotDeleteSource).toContain("返回商品档案并停用 SKU");
  });
});
