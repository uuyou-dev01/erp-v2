import { describe, expect, it } from "vitest";
import {
  buildCatalogReadiness,
  buildInventoryDashboardSummary,
  buildProductInventoryEntryHref,
  buildProductStocktakeHref,
} from "@/lib/application/inventory-dashboard";
import type { ListingCoverageProduct } from "@/lib/application/listing-coverage";

function product(
  input: Partial<ListingCoverageProduct> & Pick<ListingCoverageProduct, "key" | "skuId" | "skuCode">
): ListingCoverageProduct {
  return {
    key: input.key,
    listingType: "SKU",
    skuId: input.skuId,
    itemUnitId: null,
    skuCode: input.skuCode,
    skuName: input.skuName ?? input.skuCode,
    imageUrl: "imageUrl" in input ? input.imageUrl! : "https://example.test/item.png",
    conditionGrade: null,
    locationName: null,
    sellableQty: input.sellableQty ?? 0,
    sellableLotQty: input.sellableLotQty ?? input.sellableQty ?? 0,
    sellableItemUnitCount: input.sellableItemUnitCount ?? 0,
    variantRows: input.variantRows ?? [
      {
        skuId: input.skuId,
        skuCode: input.skuCode,
        skuName: input.skuName ?? input.skuCode,
        imageUrl: "imageUrl" in input ? input.imageUrl! : null,
        sellableQty: input.sellableQty ?? 0,
        sellableLotQty: input.sellableLotQty ?? input.sellableQty ?? 0,
        sellableItemUnitCount: input.sellableItemUnitCount ?? 0,
        inTransitQty: input.inTransitQty ?? 0,
        sellableLocations: input.sellableLocations ?? [],
        inTransitLocations: input.inTransitLocations ?? [],
      },
    ],
    inTransitQty: input.inTransitQty ?? 0,
    sellableLocations: input.sellableLocations ?? [],
    inTransitLocations: input.inTransitLocations ?? [],
    itemUnits: input.itemUnits ?? [],
    primaryMarket: "CN",
    marketLabel: "中国市场",
    marketSummaries: [],
    newStockSummary: input.newStockSummary ?? {
      sellableQty: input.sellableLotQty ?? input.sellableQty ?? 0,
      activeListingCount: 0,
      pendingListingCount: 0,
    },
    itemUnitSummary: input.itemUnitSummary ?? {
      sellableCount: input.sellableItemUnitCount ?? 0,
      activeListingCount: 0,
      pendingListingCount: 0,
      pendingPhotoCount: 0,
      pendingLabelCount: 0,
    },
    hasLotStock: input.hasLotStock ?? true,
    hasItemUnits: input.hasItemUnits ?? false,
    records: input.records ?? [],
    platforms: input.platforms ?? [],
    allPlatforms: input.allPlatforms ?? [],
    aggregateRisks: input.aggregateRisks ?? [],
    latestListedAt: null,
    latestUpdatedAt: null,
    brand: "brand" in input ? input.brand! : "联寓",
    category: "category" in input ? input.category! : "家居",
    productKind: input.productKind ?? "NEW",
    referencePrice: "referencePrice" in input ? input.referencePrice! : "99",
    referenceCurrency: "CNY",
    catalogStatus: input.catalogStatus ?? "active",
  };
}

describe("inventory dashboard helpers", () => {
  it("summarizes unique inventory operations metrics without repeating product counts", () => {
    const products = [
      product({
        key: "SKU:a",
        skuId: "a",
        skuCode: "SKU-A",
        sellableQty: 12,
        sellableLotQty: 10,
        sellableItemUnitCount: 2,
        inTransitQty: 3,
        sellableLocations: [
          { locationId: "cn-a", code: "A", name: "A仓", region: "CN_SH", type: "WAREHOUSE", qty: 8 },
          { locationId: "cn-b", code: "B", name: "B仓", region: "CN_SH", type: "WAREHOUSE", qty: 4 },
        ],
        newStockSummary: {
          sellableQty: 10,
          activeListingCount: 1,
          pendingListingCount: 2,
        },
        itemUnitSummary: {
          sellableCount: 2,
          activeListingCount: 1,
          pendingListingCount: 1,
          pendingPhotoCount: 0,
          pendingLabelCount: 0,
        },
      }),
      product({
        key: "SKU:b",
        skuId: "b",
        skuCode: "SKU-B",
        sellableQty: 0,
        sellableLotQty: 0,
        inTransitQty: 5,
        sellableLocations: [],
        newStockSummary: {
          sellableQty: 0,
          activeListingCount: 0,
          pendingListingCount: 0,
        },
      }),
    ];

    expect(buildInventoryDashboardSummary(products)).toEqual({
      productCount: 2,
      sellableQty: 12,
      inTransitQty: 8,
      sellableLotQty: 10,
      sellableItemUnitCount: 2,
      locationCount: 2,
      readySkuCount: 1,
      platformGapCount: 2,
      itemUnitGapCount: 1,
      listingGapCount: 3,
      catalogIssueCount: 0,
    });
  });

  it("counts ready SKU variants instead of product cards", () => {
    const summary = buildInventoryDashboardSummary([
      product({
        key: "SKU:multi",
        skuId: "multi",
        skuCode: "SKU-MULTI",
        sellableQty: 7,
        variantRows: [
          {
            skuId: "red",
            skuCode: "SKU-RED",
            skuName: "红色",
            imageUrl: null,
            sellableQty: 3,
            sellableLotQty: 3,
            sellableItemUnitCount: 0,
            inTransitQty: 0,
            sellableLocations: [],
            inTransitLocations: [],
          },
          {
            skuId: "blue",
            skuCode: "SKU-BLUE",
            skuName: "蓝色",
            imageUrl: null,
            sellableQty: 4,
            sellableLotQty: 4,
            sellableItemUnitCount: 0,
            inTransitQty: 0,
            sellableLocations: [],
            inTransitLocations: [],
          },
        ],
      }),
    ]);

    expect(summary.productCount).toBe(1);
    expect(summary.readySkuCount).toBe(2);
  });

  it("counts scoped sellable variant quantities when the page is filtered by warehouse", () => {
    const summary = buildInventoryDashboardSummary([
      product({
        key: "SKU:scoped",
        skuId: "scoped",
        skuCode: "SKU-SCOPED",
        sellableQty: 0,
        variantRows: [
          {
            skuId: "global-stock",
            skuCode: "SKU-GLOBAL",
            skuName: "其他仓有货",
            imageUrl: null,
            sellableQty: 9,
            sellableLotQty: 9,
            sellableItemUnitCount: 0,
            inTransitQty: 0,
            sellableLocations: [],
            inTransitLocations: [],
            scopedSellableQty: 0,
          } as ListingCoverageProduct["variantRows"][number] & { scopedSellableQty: number },
          {
            skuId: "current-stock",
            skuCode: "SKU-CURRENT",
            skuName: "当前仓有货",
            imageUrl: null,
            sellableQty: 2,
            sellableLotQty: 2,
            sellableItemUnitCount: 0,
            inTransitQty: 0,
            sellableLocations: [],
            inTransitLocations: [],
            scopedSellableQty: 2,
          } as ListingCoverageProduct["variantRows"][number] & { scopedSellableQty: number },
        ],
      }),
    ]);

    expect(summary.readySkuCount).toBe(1);
  });

  it("keeps transit-only products in the dashboard summary", () => {
    const summary = buildInventoryDashboardSummary([
      product({
        key: "SKU:transit",
        skuId: "transit",
        skuCode: "SKU-TRANSIT",
        sellableQty: 0,
        sellableLotQty: 0,
        inTransitQty: 5,
      }),
    ]);

    expect(summary.productCount).toBe(1);
    expect(summary.sellableQty).toBe(0);
    expect(summary.inTransitQty).toBe(5);
    expect(summary.readySkuCount).toBe(0);
  });

  it("reports catalog readiness issues that block confident listing", () => {
    const readiness = buildCatalogReadiness(
      product({
        key: "SKU:missing",
        skuId: "missing",
        skuCode: "SKU-MISSING",
        imageUrl: null,
        referencePrice: null,
        catalogStatus: "disabled",
        brand: null,
        category: null,
      })
    );

    expect(readiness.status).toBe("needsWork");
    expect(readiness.label).toBe("主档待补");
    expect(readiness.issues).toEqual(["缺图", "缺参考价", "停用", "缺品牌/类目"]);
  });

  it("builds a stocktake link that searches by the visible SKU code", () => {
    expect(
      buildProductStocktakeHref(
        product({
          key: "SKU:space",
          skuId: "space",
          skuCode: "SKU SPACE/001",
        }),
        "loc_cn_a"
      )
    ).toBe("/inventory/stocktake?q=SKU+SPACE%2F001&locationId=loc_cn_a");
  });

  it("builds an inventory entry link that presets the SKU and return context", () => {
    expect(
      buildProductInventoryEntryHref(
        product({
          key: "SKU:entry",
          skuId: "sku entry/001",
          skuCode: "SKU-ENTRY-001",
        }),
        "/inventory/sellable?market=JP"
      )
    ).toBe(
      "/inventory/lots/new?skuId=sku+entry%2F001&returnTo=%2Finventory%2Fsellable%3Fmarket%3DJP"
    );
  });
});
