import { describe, expect, it } from "vitest";
import {
  buildWebLinkPreview,
  suggestInternalCategory,
  type WebLinkDocument,
} from "@/lib/capture/web-link-parser";
import atmosItem from "@/tests/fixtures/web-link/atmos-item.json";
import goofishShare from "@/tests/fixtures/web-link/goofish-share.json";
import mercariPersonalSoldOut from "@/tests/fixtures/web-link/mercari-personal-sold-out.json";
import mercariShopsSoldOut from "@/tests/fixtures/web-link/mercari-shops-sold-out.json";

describe("web product link parser", () => {
  it("extracts the Mercari Shops acceptance fixture", () => {
    const preview = buildWebLinkPreview(mercariShopsSoldOut as WebLinkDocument);

    expect(preview).toMatchObject({
      platformName: "Mercari",
      externalListingId: "PPGnk2WZvc2dY5eViefAJC",
      amount: "84678",
      currency: "JPY",
      pageStatus: "SOLD_OUT",
      brand: "CHROME HEARTS",
      sellerName: "LIFE",
      suggestedInternalCategory: "首饰配件 / 手链手镯",
      adapterCode: "MERCARI",
      adapterVersion: "3",
    });
    expect(preview.description).toContain("腕周り：約18.5cm");
    expect(preview.conditionText).toContain("傷や汚れあり");
    expect(preview.imageUrls).toHaveLength(6);
    expect(preview.extractionClaims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldName: "amount", source: "MERCARI", confidence: 0.93 }),
        expect.objectContaining({ fieldName: "brand", source: "MERCARI" }),
      ])
    );
  });

  it("keeps the structured Mercari sale price instead of a sold item's shipping fee", () => {
    const preview = buildWebLinkPreview(mercariPersonalSoldOut as WebLinkDocument);

    expect(preview).toMatchObject({
      externalListingId: "m17569275815",
      amount: "3999",
      currency: "JPY",
      pageStatus: "SOLD_OUT",
      conditionText: "新品、未使用",
      suggestedInternalCategory: "玩具 / 毛绒玩具",
      adapterCode: "MERCARI",
    });
    expect(preview.amount).not.toBe("455");
    expect(preview.imageUrls).toHaveLength(2);
  });

  it("uses generic JSON-LD before asking for manual fields", () => {
    const preview = buildWebLinkPreview({
      requestedUrl: "https://shop.example.com/products/sku-1?utm_source=test",
      finalUrl: "https://shop.example.com/products/sku-1?utm_source=test",
      extractionMethod: "HTTP",
      jsonLd: [
        {
          "@type": "Product",
          name: "Example Shoe",
          description: "A public product description",
          image: ["https://cdn.example.com/1.jpg"],
          brand: { name: "Example" },
          offers: { price: "199.00", priceCurrency: "USD" },
        },
      ],
    });

    expect(preview.normalizedUrl).toBe("https://shop.example.com/products/sku-1");
    expect(preview.title).toBe("Example Shoe");
    expect(preview.amount).toBe("199.00");
    expect(preview.currency).toBe("USD");
    expect(preview.imageUrls).toEqual(["https://cdn.example.com/1.jpg"]);
    expect(preview.adapterCode).toBe("GENERIC");
    expect(preview.warnings).toContain("该网站尚无专属适配器，请重点核对解析字段");
  });

  it("uses the Atmos adapter to keep the product identity and product-only images", () => {
    const preview = buildWebLinkPreview(atmosItem as WebLinkDocument);

    expect(preview).toMatchObject({
      platformName: "Atmos",
      externalListingId: "mabsu-ac049",
      adapterCode: "ATMOS",
      adapterVersion: "1",
      title: "Monchhichi x atmos 【TENKYU】 キーチェーン BLUE",
      amount: "2640",
      currency: "JPY",
      pageStatus: "ACTIVE",
      sellerName: "atmos",
      suggestedInternalCategory: "首饰配件 / 钥匙扣",
    });
    expect(preview.imageUrls).toHaveLength(3);
    expect(preview.imageUrls.every((url) => url.includes("/items/"))).toBe(true);
  });

  it("expands a Goofish share into identity and shared title without trusting landing-page data", () => {
    const preview = buildWebLinkPreview(goofishShare as WebLinkDocument);

    expect(preview).toMatchObject({
      platformName: "闲鱼",
      externalListingId: "1071257885559",
      adapterCode: "GOOFISH",
      adapterVersion: "1",
      title: "全新未穿 Nike Kobe 8 Protro Laker",
      amount: "",
      currency: "CNY",
      imageUrls: [],
    });
    expect(preview.normalizedUrl).toBe("https://www.goofish.com/item?id=1071257885559");
    expect(preview.description).toContain("n50rgzPeCuc");
    expect(preview.warnings).toContain(
      "闲鱼匿名页面未提供可靠商品详情；已保留分享标题和商品 ID，请手动核对价格与图片"
    );
    expect(preview.extractionClaims.some((claim) => claim.evidenceText === "226")).toBe(false);
  });

  it("keeps category recommendations deterministic and two-level", () => {
    expect(suggestInternalCategory(["おもちゃ", "フィギュア"], "POP MART")).toBe("玩具 / 模型手办");
    expect(suggestInternalCategory(["ぬいぐるみ・マスコット"], "ミッキー")).toBe("玩具 / 毛绒玩具");
    expect(suggestInternalCategory(["ファッション", "スニーカー"], "Nike Dunk")).toBe(
      "鞋服 / 鞋类"
    );
  });
});
