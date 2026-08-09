import { describe, expect, it } from "vitest";
import { SYSTEM_PRODUCT_CATEGORIES } from "@/lib/application/product-category-defaults";
import {
  buildCategoryChildrenMap,
  categorySearchText,
  type ProductCategoryOption,
} from "@/lib/application/product-categories";

function asOption(seed: (typeof SYSTEM_PRODUCT_CATEGORIES)[number]): ProductCategoryOption {
  return {
    ...seed,
    scope: "SYSTEM",
    organizationId: null,
    canonicalCategoryId: null,
    aliases: seed.aliases ?? [],
    path: seed.name,
    level: 0,
    status: "ACTIVE",
  };
}

describe("product category master data", () => {
  it("ships a unique, connected system taxonomy", () => {
    const ids = new Set(SYSTEM_PRODUCT_CATEGORIES.map((category) => category.id));
    const codes = new Set(SYSTEM_PRODUCT_CATEGORIES.map((category) => category.code));

    expect(ids.size).toBe(SYSTEM_PRODUCT_CATEGORIES.length);
    expect(codes.size).toBe(SYSTEM_PRODUCT_CATEGORIES.length);
    expect(
      SYSTEM_PRODUCT_CATEGORIES.every(
        (category) => !category.parentId || ids.has(category.parentId)
      )
    ).toBe(true);
  });

  it("contains the agreed foundational business categories", () => {
    const names = new Set(SYSTEM_PRODUCT_CATEGORIES.map((category) => category.name));
    for (const name of ["鞋服", "首饰配件", "生活用品", "玩具与收藏", "数码家电"]) {
      expect(names.has(name)).toBe(true);
    }
  });

  it("searches canonical names, paths and aliases", () => {
    const apparel = asOption(
      SYSTEM_PRODUCT_CATEGORIES.find((category) => category.id === "syscat_apparel")!
    );
    apparel.path = "鞋服 / 服装";

    expect(categorySearchText(apparel)).toContain("服饰");
    expect(categorySearchText(apparel)).toContain("鞋服 / 服装");
  });

  it("builds children in stable business order", () => {
    const options = SYSTEM_PRODUCT_CATEGORIES.map(asOption);
    const children = buildCategoryChildrenMap(options);
    expect(children.get("syscat_toys_collectibles")?.map((item) => item.name)).toEqual([
      "潮玩",
      "盲盒",
      "手办与模型",
      "卡牌",
      "毛绒玩具",
    ]);
  });
});
