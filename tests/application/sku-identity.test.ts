import { describe, expect, it } from "vitest";
import {
  buildSkuDisplayName,
  deriveCatalogRole,
  generateSkuCodeCandidate,
  normalizeVariantLabel,
} from "@/lib/application/sku-identity";

describe("sku identity model", () => {
  it("treats explicit roles as authoritative and keeps legacy parent-child fallback", () => {
    expect(deriveCatalogRole({ catalogRole: "GROUP", parentSkuId: null, childCount: 0 })).toBe("GROUP");
    expect(deriveCatalogRole({ catalogRole: "VARIANT", parentSkuId: "parent", childCount: 0 })).toBe("VARIANT");
    expect(deriveCatalogRole({ catalogRole: "SIMPLE", parentSkuId: null, childCount: 2 })).toBe("GROUP");
    expect(deriveCatalogRole({ catalogRole: "SIMPLE", parentSkuId: "parent", childCount: 0 })).toBe("VARIANT");
    expect(deriveCatalogRole({ catalogRole: null, parentSkuId: "parent", childCount: 0 })).toBe("VARIANT");
    expect(deriveCatalogRole({ catalogRole: null, parentSkuId: null, childCount: 2 })).toBe("GROUP");
    expect(deriveCatalogRole({ catalogRole: null, parentSkuId: null, childCount: 0 })).toBe("SIMPLE");
  });

  it("generates group and variant codes from brand style number when available", () => {
    expect(
      generateSkuCodeCandidate({
        role: "GROUP",
        name: "AJ1 芝加哥 2015",
        brand: "Nike",
        manufacturerCode: "555088-101",
        sequence: 7,
      })
    ).toBe("NIKE-555088-101");

    expect(
      generateSkuCodeCandidate({
        role: "VARIANT",
        parentCode: "NIKE-555088-101",
        variantLabel: "42码",
        sequence: 3,
      })
    ).toBe("NIKE-555088-101-42");
  });

  it("falls back to sequence codes for Chinese-only catalog groups", () => {
    expect(
      generateSkuCodeCandidate({
        role: "GROUP",
        name: "火影忍者 晓组织系列",
        sequence: 12,
      })
    ).toBe("PG-00012");
  });

  it("builds short variant labels and full display names without asking users to type long names", () => {
    expect(normalizeVariantLabel({ variantLabel: " 42码 " })).toBe("42码");
    expect(
      normalizeVariantLabel({
        variantValues: {
          颜色: "黑色",
          尺码: "M",
        },
      })
    ).toBe("黑色 / M");
    expect(
      buildSkuDisplayName({
        role: "VARIANT",
        parentName: "Nike SB 短袖 2011 小花猫 黑色",
        variantLabel: "M",
      })
    ).toBe("Nike SB 短袖 2011 小花猫 黑色 · M");
  });
});
