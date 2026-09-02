import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  safeSkuReturnPath,
  skuReturnPathWithCreatedId,
} from "@/lib/application/sku-create-navigation";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("SKU creation return navigation", () => {
  it("accepts only safe internal return paths", () => {
    expect(safeSkuReturnPath("/inventory/opening-stock/new?locationId=loc-1")).toBe(
      "/inventory/opening-stock/new?locationId=loc-1"
    );
    expect(safeSkuReturnPath("//evil.example/path")).toBeNull();
    expect(safeSkuReturnPath("https://evil.example/path")).toBeNull();
    expect(safeSkuReturnPath("inventory/opening-stock/new")).toBeNull();
  });

  it("adds the created SKU without losing the original task context", () => {
    expect(
      skuReturnPathWithCreatedId(
        "/inventory/opening-stock/new?locationId=loc-1&returnTo=%2Fsetup#lines",
        "sku/new 1"
      )
    ).toBe(
      "/inventory/opening-stock/new?locationId=loc-1&returnTo=%2Fsetup&createdSkuId=sku%2Fnew+1#lines"
    );
  });

  it("keeps returnTo through product type selection and group-to-variant creation", () => {
    const newPage = source("app/(dashboard)/inventory/skus/new/page.tsx");
    const form = source("components/inventory/sku-form.tsx");
    const createdPage = source("app/(dashboard)/inventory/skus/[id]/created/page.tsx");

    expect(newPage).toContain("safeSkuReturnPath(returnTo)");
    expect(newPage).toContain("returnTo={safeReturnTo}");
    expect(form).toContain("skuReturnPathWithCreatedId(returnTo, skuId)");
    expect(form).toContain('formData.catalogRole !== "GROUP"');
    expect(createdPage).toContain('variantQuery.set("returnTo", safeReturnTo)');
  });

  it("shows a prerequisite gate instead of a silent empty product selector", () => {
    const openingPage = source("app/(dashboard)/inventory/opening-stock/new/page.tsx");
    const openingForm = source("components/inventory/opening-stock-form.tsx");

    expect(openingPage).toContain("createdSkuId?: string");
    expect(openingPage).toContain("skuCreateReturnTo={prerequisiteReturnTo}");
    expect(openingForm).toContain("开始前，先准备库存位置和商品");
    expect(openingForm).toContain("创建商品并返回");
    expect(openingForm).toContain("确认并生成库存");
  });

  it("allows creating a missing SKU from an existing inventory row", () => {
    const openingForm = source("components/inventory/opening-stock-form.tsx");

    expect(openingForm).toContain('title="新建商品"');
    expect(openingForm).toContain("createSKUAction({");
    expect(openingForm).toContain("创建并选用");
    expect(openingForm).toContain("setSkuOptions");
    expect(openingForm).toContain("window.sessionStorage.setItem");
    expect(openingForm).toContain("当前已填写的库存内容会自动恢复");
  });
});
