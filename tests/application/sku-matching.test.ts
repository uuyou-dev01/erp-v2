import { describe, expect, it } from "vitest";
import { normalizeSkuMatchText, scoreSkuCandidate } from "@/lib/capture/sku-matching";

const sku = {
  id: "sku-1",
  code: "NIKE-SB-CAT-2011-BK-M",
  name: "Nike SB 短袖 2011 小花猫 黑色 · M",
  brand: "Nike SB",
  manufacturerCode: "CAT-2011",
  variantLabel: "M",
  imageUrl: null,
  attributes: { barcode: "4901234567894" },
  parentSku: { name: "Nike SB 短袖 2011 小花猫 黑色" },
  aliases: [{ alias: "小花猫黑色M" }],
};

describe("SKU deterministic matching", () => {
  it("normalizes multilingual separators and width", () => {
    expect(normalizeSkuMatchText("Ｎｉｋｅ・SB  黑色 · M")).toBe("nike sb 黑色 m");
  });

  it("ranks an exact SKU code as a deterministic match", () => {
    const result = scoreSkuCandidate(sku, { query: "nike-sb-cat-2011-bk-m" });
    expect(result?.score).toBe(0.99);
    expect(result?.reasons).toContain("SKU 编码完全一致");
  });

  it("prioritizes an exact barcode over text similarity", () => {
    const result = scoreSkuCandidate(sku, { barcode: "4901234567894", query: "完全不同的名称" });
    expect(result?.score).toBe(1);
    expect(result?.reasons).toContain("条码完全一致");
  });

  it("uses learned aliases without silently changing the selected SKU", () => {
    const result = scoreSkuCandidate(sku, { query: "小花猫黑色M" });
    expect(result?.score).toBe(0.97);
    expect(result?.skuId).toBe("sku-1");
  });
});
