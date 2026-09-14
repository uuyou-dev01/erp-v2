import { describe, expect, it } from "vitest";
import { summarizeListingPlatforms } from "@/lib/application/listing-platform-summary";
import type { ListingCoverageVariantView } from "@/lib/application/listing-coverage";

function variant(overrides: Partial<ListingCoverageVariantView> = {}): ListingCoverageVariantView {
  return {
    skuId: "sku",
    skuCode: "SKU",
    skuName: "商品",
    imageUrl: null,
    sellableQty: 4,
    sellableLotQty: 4,
    sellableItemUnitCount: 0,
    inTransitQty: 0,
    sellableLocations: [],
    inTransitLocations: [],
    scopedSellableQty: 4,
    scopedSellableLotQty: 4,
    scopedSellableItemUnitCount: 0,
    scopedInTransitQty: 0,
    scopedSellableLocations: [],
    scopedInTransitLocations: [],
    scopedRecords: [],
    scopedSkuRecords: [],
    scopedItemUnitRecords: [],
    scopedItemUnits: [],
    scopedPlatforms: [
      { id: "m", code: "MERCARI", name: "Mercari" },
    ] as ListingCoverageVariantView["scopedPlatforms"],
    ...overrides,
  };
}
const records = (...states: string[]) =>
  states.map((state) => ({
    platformId: "m",
    state,
  })) as ListingCoverageVariantView["scopedSkuRecords"];

describe("platform on-sale summary", () => {
  it("counts each in-stock SKU once and excludes ended listings and transit-only stock", () => {
    const [summary] = summarizeListingPlatforms([
      variant({ scopedSkuRecords: records("active", "active") }),
      variant({ scopedSkuRecords: records("sold_out", "delisted") }),
      variant({
        scopedSellableQty: 0,
        scopedSellableLotQty: 0,
        scopedInTransitQty: 5,
        scopedSkuRecords: records("active"),
      }),
    ]);
    expect(summary).toMatchObject({ skuTotal: 2, skuListed: 1, unitTotal: 0 });
  });

  it("keeps individual items separate and only counts active listings for sellable items", () => {
    const [summary] = summarizeListingPlatforms([
      variant({
        scopedSellableLotQty: 0,
        scopedItemUnits: [
          { id: "a", sellable: true },
          { id: "b", sellable: true },
          { id: "c", sellable: false },
        ] as ListingCoverageVariantView["scopedItemUnits"],
        scopedItemUnitRecords: [
          { platformId: "m", itemUnitId: "a", state: "active" },
          { platformId: "m", itemUnitId: "a", state: "active" },
          { platformId: "m", itemUnitId: "b", state: "sold_out" },
          { platformId: "m", itemUnitId: "c", state: "active" },
        ] as ListingCoverageVariantView["scopedItemUnitRecords"],
      }),
    ]);
    expect(summary).toMatchObject({ skuTotal: 0, skuListed: 0, unitTotal: 2, unitListed: 1 });
  });

  it("uses only the platforms applicable to each SKU in the current scope", () => {
    const summary = summarizeListingPlatforms([variant(), variant({ scopedPlatforms: [] })]);
    expect(summary).toHaveLength(1);
    expect(summary[0].skuTotal).toBe(1);
    expect(summarizeListingPlatforms([variant({ scopedSellableQty: 0 })])).toEqual([]);
  });
});
