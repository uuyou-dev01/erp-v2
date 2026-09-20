import { describe, expect, it } from "vitest";
import type {
  ListingCoverageProduct,
  ListingCoverageVariantRow,
} from "@/lib/application/listing-coverage";
import { buildReplenishmentDecision } from "@/lib/application/replenishment";
import { buildStockingDecision } from "@/lib/application/stocking-decision";
import {
  buildReplenishmentPoolGroups,
  countReplenishmentPoolGroups,
  formatReplenishmentCoverage,
  isExcludedReplenishmentRow,
  isSlowReplenishmentRow,
  matchesReplenishmentVariant,
  replenishmentCategoryFor,
  type ReplenishmentViewProduct,
  type ReplenishmentViewVariant,
} from "@/lib/application/replenishment-view";

const product: ReplenishmentViewProduct = {
  skuName: "POP MART 怪诞阁楼系列",
  skuCode: "PG-00077",
  brand: "POP MART",
  category: "盲盒",
  productKind: "NEW",
  records: [],
};

function variant(overrides: Partial<ReplenishmentViewVariant> = {}): ReplenishmentViewVariant {
  return {
    skuId: "hidden",
    skuName: "隐藏款-阁楼的秘密",
    skuCode: "PG-00077-02-02",
    productKind: "NEW",
    category: "盲盒",
    sellableLotQty: 0,
    sellableItemUnitCount: 0,
    replenishment: buildReplenishmentDecision({
      sellableQty: 0,
      sales7Qty: 2,
      sales30Qty: 2,
      sales90Qty: 2,
      orderCount30: 2,
    }),
    ...overrides,
  };
}

const sibling = variant({
  skuId: "porcelain",
  skuName: "瓷心人",
  skuCode: "PG-00077-02",
  sellableLotQty: 5,
  replenishment: buildReplenishmentDecision({
    sellableQty: 5,
    sales7Qty: 0,
    sales30Qty: 0,
    sales90Qty: 0,
    orderCount30: 0,
  }),
});

describe("replenishment view scope", () => {
  it("a search for one variant does not include or count its sibling", () => {
    const visible = [variant(), sibling].filter((item) =>
      matchesReplenishmentVariant(product, item, { q: "  阁楼的秘密  " })
    );
    expect(visible.map((item) => item.skuId)).toEqual(["hidden"]);
    expect(matchesReplenishmentVariant(product, sibling, { q: "PG-00077-02-02" })).toBe(false);
  });

  it.each(["怪诞阁楼系列", "pg-00077", "pop mart"])(
    "searching a shared product identity includes all variants: %s",
    (q) => {
      expect(
        [variant(), sibling].every((item) => matchesReplenishmentVariant(product, item, { q }))
      ).toBe(true);
    }
  );

  it("uses each variant's category and kind instead of including the whole group", () => {
    const used = variant({ skuId: "used", category: "手办", productKind: "USED" });
    expect(matchesReplenishmentVariant(product, used, { category: "盲盒" })).toBe(false);
    expect(matchesReplenishmentVariant(product, used, { category: "手办", kind: "USED" })).toBe(
      true
    );
    expect(matchesReplenishmentVariant(product, sibling, { kind: "USED" })).toBe(false);
    expect(
      matchesReplenishmentVariant(
        product,
        variant({ category: undefined, productKind: undefined }),
        { category: "盲盒", kind: "NEW" }
      )
    ).toBe(true);
  });

  it.each(["replenishment", "stockout", "lowStock"])(
    "limits %s warnings to the affected SKU",
    (risk) => {
      expect(matchesReplenishmentVariant(product, variant(), { risk })).toBe(true);
      expect(matchesReplenishmentVariant(product, sibling, { risk })).toBe(false);
    }
  );

  it("limits listing risk and status to records belonging to the selected SKU", () => {
    const withRecords = {
      ...product,
      records: [
        {
          skuId: "hidden",
          status: "ACTIVE",
          risks: [{ key: "stale", label: "长期未更新", tone: "amber" as const }],
        },
      ],
    };
    expect(
      matchesReplenishmentVariant(withRecords, variant(), { risk: "stale", status: "ACTIVE" })
    ).toBe(true);
    expect(matchesReplenishmentVariant(withRecords, sibling, { risk: "stale" })).toBe(false);
    expect(matchesReplenishmentVariant(withRecords, sibling, { status: "ACTIVE" })).toBe(false);
    expect(matchesReplenishmentVariant(product, variant(), { status: "SOLD_OUT" })).toBe(true);
  });

  it("keeps sold-out new SKUs in the lot filter and distinguishes individual and mixed stock", () => {
    expect(matchesReplenishmentVariant(product, variant(), { stockType: "LOT" })).toBe(true);
    expect(matchesReplenishmentVariant(product, variant(), { stockType: "ITEM_UNIT" })).toBe(false);
    const used = variant({ productKind: "USED", sellableItemUnitCount: 1 });
    expect(matchesReplenishmentVariant(product, used, { stockType: "ITEM_UNIT" })).toBe(true);
    expect(matchesReplenishmentVariant(product, used, { stockType: "LOT" })).toBe(false);
    const mixed = variant({ sellableLotQty: 2, sellableItemUnitCount: 1 });
    expect(matchesReplenishmentVariant(product, mixed, { stockType: "MIXED" })).toBe(true);
    expect(matchesReplenishmentVariant(product, mixed, { stockType: "LOT" })).toBe(false);
  });
});

describe("replenishment coverage display", () => {
  const base = buildReplenishmentDecision({
    sellableQty: 10,
    sales7Qty: 7,
    sales30Qty: 30,
    sales90Qty: 90,
    orderCount30: 10,
  });
  it.each([
    [null, "—"],
    [0, "已售罄"],
    [0.9, "不足 1 天"],
    [2.9, "2 天"],
    [365, "365 天"],
    [365.1, ">365 天"],
  ] as const)("shows conservative stock coverage for %s days", (coverageDays, text) => {
    expect(formatReplenishmentCoverage({ ...base, coverageDays })).toBe(text);
  });
  it("does not invent coverage without a decision", () => {
    expect(formatReplenishmentCoverage()).toBe("—");
  });
});

function poolVariant(
  skuId: string,
  sellableQty: number,
  overrides: Partial<ListingCoverageVariantRow> = {}
): ListingCoverageVariantRow {
  return {
    skuId,
    skuCode: skuId,
    skuName: skuId,
    imageUrl: null,
    productKind: "NEW",
    catalogStatus: "active",
    sellableQty,
    sellableLotQty: sellableQty,
    sellableItemUnitCount: 0,
    inTransitQty: 0,
    sellableLocations: [],
    inTransitLocations: [],
    replenishment: buildReplenishmentDecision({
      sellableQty,
      sales7Qty: 7,
      sales30Qty: 30,
      sales90Qty: 90,
      orderCount30: 10,
      now: new Date("2026-09-20T00:00:00Z"),
    }),
    ...overrides,
  };
}

function poolProduct(
  key: string,
  variantRows: ListingCoverageVariantRow[],
  overrides: Partial<ListingCoverageProduct> = {}
): ListingCoverageProduct {
  const sellableQty = variantRows.reduce((sum, row) => sum + row.sellableQty, 0);
  return {
    key,
    listingType: "SKU",
    skuId: variantRows[0]?.skuId ?? key,
    itemUnitId: null,
    skuCode: key,
    skuName: key,
    imageUrl: null,
    conditionGrade: null,
    locationName: null,
    sellableQty,
    sellableLotQty: sellableQty,
    sellableItemUnitCount: 0,
    variantRows,
    inTransitQty: 0,
    sellableLocations: [],
    inTransitLocations: [],
    itemUnits: [],
    primaryMarket: "JP",
    marketLabel: "日本",
    marketSummaries: [],
    newStockSummary: { sellableQty, activeListingCount: 0, pendingListingCount: 0 },
    itemUnitSummary: {
      sellableCount: 0,
      activeListingCount: 0,
      pendingListingCount: 0,
      pendingPhotoCount: 0,
      pendingLabelCount: 0,
    },
    hasLotStock: sellableQty > 0,
    hasItemUnits: false,
    records: [],
    platforms: [],
    allPlatforms: [],
    aggregateRisks: [],
    latestListedAt: null,
    latestUpdatedAt: null,
    brand: null,
    category: null,
    productKind: "NEW",
    referencePrice: null,
    referenceCurrency: null,
    catalogStatus: "active",
    ...overrides,
  };
}

describe("replenishment product groups", () => {
  it("groups siblings by product identity without merging distinct products with the same name", () => {
    const groups = buildReplenishmentPoolGroups([
      poolProduct("first", [poolVariant("size-41", 2), poolVariant("size-42", 3)], {
        skuName: "Nike AJ1 芝加哥 2015",
      }),
      poolProduct("second", [poolVariant("size-43", 4)], {
        skuName: "Nike AJ1 芝加哥 2015",
      }),
      poolProduct("first", [poolVariant("size-44", 5)]),
    ]);
    expect(groups.map((group) => [group.key, group.totalVariantCount])).toEqual([
      ["first", 3],
      ["second", 1],
    ]);
    expect(groups[0].rows.map((row) => row.variant.skuId)).toEqual([
      "size-41",
      "size-42",
      "size-44",
    ]);
  });

  it("keeps a sold-out variant urgent even when its sibling has abundant stock", () => {
    const soldOut = poolVariant("hidden", 0);
    const stocked = poolVariant("porcelain", 200);
    const products = [poolProduct("attic", [stocked, soldOut])];
    const [group] = buildReplenishmentPoolGroups(products);
    expect(group.rows.map(replenishmentCategoryFor)).toEqual(["urgent", "healthy"]);
    expect(group.rows[0].decision).toBe(soldOut.replenishment);
    expect(group.rows[0].decision?.coverageDays).toBe(0);
    expect(countReplenishmentPoolGroups([group])).toMatchObject({ all: 1, urgent: 1, healthy: 1 });
    const [urgentGroup] = buildReplenishmentPoolGroups(products, {}, "urgent");
    expect(urgentGroup.totalVariantCount).toBe(2);
    expect(urgentGroup.rows.map((row) => row.variant.skuId)).toEqual(["hidden"]);
    expect(urgentGroup.rows.reduce((sum, row) => sum + row.variant.sellableQty, 0)).toBe(0);
    expect(urgentGroup.rows.reduce((sum, row) => sum + (row.decision?.sales30Qty ?? 0), 0)).toBe(30);
  });

  it("globally deduplicates SKU rows and uses the entry that has a forecast", () => {
    const withoutDecision = poolVariant("shared", 0, { replenishment: undefined });
    const withDecision = poolVariant("shared", 2);
    const groups = buildReplenishmentPoolGroups([
      poolProduct("fallback", [withoutDecision]),
      poolProduct("actual-group", [withDecision, withDecision]),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("actual-group");
    expect(groups[0].totalVariantCount).toBe(1);
    expect(groups[0].rows[0].decision).toBe(withDecision.replenishment);
  });

  it("scopes both group rows and their counts to matching variants before applying a pool tab", () => {
    const products = [
      poolProduct("attic", [poolVariant("hidden", 0), poolVariant("porcelain", 200)], {
        skuName: "怪诞阁楼系列",
      }),
    ];
    const [group] = buildReplenishmentPoolGroups(products, { q: " porcelain " });
    expect(group.rows.map((row) => row.variant.skuId)).toEqual(["porcelain"]);
    expect(group.totalVariantCount).toBe(1);
    expect(countReplenishmentPoolGroups([group])).toMatchObject({ all: 1, urgent: 0, healthy: 1 });
    expect(buildReplenishmentPoolGroups(products, { q: "porcelain" }, "urgent")).toEqual([]);
    expect(buildReplenishmentPoolGroups(products, { q: "怪诞阁楼" })[0].rows).toHaveLength(2);
    expect(buildReplenishmentPoolGroups(products, { risk: "stockout" })[0].rows).toHaveLength(1);
  });

  it("counts each mixed-status group once per matching tab, regardless of its SKU count", () => {
    const groups = buildReplenishmentPoolGroups([
      poolProduct("mixed", [
        poolVariant("urgent-one", 0),
        poolVariant("urgent-two", 2),
        poolVariant("soon", 25),
        poolVariant("healthy", 100),
        poolVariant("unknown", 10, { replenishment: undefined }),
      ]),
      poolProduct("another", [poolVariant("urgent-three", 3)]),
    ]);
    expect(countReplenishmentPoolGroups(groups)).toEqual({
      all: 2,
      urgent: 2,
      soon: 1,
      healthy: 1,
      slow: 0,
      insufficient: 1,
      excluded: 0,
    });
    expect(countReplenishmentPoolGroups([]).all).toBe(0);
  });

  it("sorts a group by its most urgent visible child and recalculates order for the chosen tab", () => {
    const products = [
      poolProduct("first", [poolVariant("late-first", 100), poolVariant("urgent-first", 0)]),
      poolProduct("second", [poolVariant("early-second", 60), poolVariant("urgent-second", 2)]),
      poolProduct("third", [poolVariant("soon-third", 25)]),
    ];
    expect(buildReplenishmentPoolGroups(products).map((group) => group.key)).toEqual([
      "first",
      "second",
      "third",
    ]);
    expect(buildReplenishmentPoolGroups(products, {}, "healthy").map((group) => group.key)).toEqual([
      "second",
      "first",
    ]);
  });

  it("uses SKU code and then group identity to make equal urgency ordering deterministic", () => {
    const sameCode = { skuCode: "same-code" };
    const products = [
      poolProduct("z-group", [poolVariant("sku-z", 2, sameCode)]),
      poolProduct("a-group", [poolVariant("sku-c", 2, sameCode), poolVariant("sku-a", 2)]),
      poolProduct("b-group", [poolVariant("sku-b", 2, sameCode)]),
    ];
    const groups = buildReplenishmentPoolGroups(products);
    expect(groups.map((group) => group.key)).toEqual(["a-group", "b-group", "z-group"]);
    expect(groups[0].rows.map((row) => row.variant.skuCode)).toEqual(["same-code", "sku-a"]);
  });

  it("keeps all children together when 25 product groups are placed on a page", () => {
    const products = Array.from({ length: 26 }, (_, groupIndex) =>
      poolProduct(
        `group-${String(groupIndex).padStart(2, "0")}`,
        Array.from({ length: groupIndex === 0 ? 30 : 1 }, (_, variantIndex) =>
          poolVariant(`sku-${String(groupIndex).padStart(2, "0")}-${variantIndex}`, 100)
        )
      )
    );
    const groups = buildReplenishmentPoolGroups(products);
    const firstPage = groups.slice(0, 25);
    const secondPage = groups.slice(25, 50);
    expect(groups).toHaveLength(26);
    expect(firstPage).toHaveLength(25);
    expect(firstPage[0].rows).toHaveLength(30);
    expect(secondPage.map((group) => group.key)).toEqual(["group-25"]);
    expect(firstPage.flatMap((group) => group.rows)).toHaveLength(54);
  });

  it("preserves SKU exclusions and lets urgent demand take precedence over old stock", () => {
    const oldStock = buildStockingDecision({
      sellableQty: 2,
      sales30Qty: 0,
      sales90Qty: 2,
      oldestStockAgeDays: 120,
    });
    const [group] = buildReplenishmentPoolGroups([
      poolProduct("group", [
        poolVariant("urgent-old", 2, { stockingDecision: oldStock }),
        poolVariant("used", 1, { productKind: "USED" }),
        poolVariant("disabled", 1, { catalogStatus: "disabled" }),
        poolVariant("slow", 100, { stockingDecision: oldStock }),
      ]),
    ]);
    const bySku = new Map(group.rows.map((row) => [row.variant.skuId, row]));
    expect(isSlowReplenishmentRow(bySku.get("urgent-old")!)).toBe(true);
    expect(replenishmentCategoryFor(bySku.get("urgent-old")!)).toBe("urgent");
    expect(isExcludedReplenishmentRow(bySku.get("used")!)).toBe(true);
    expect(replenishmentCategoryFor(bySku.get("disabled")!)).toBe("excluded");
    expect(replenishmentCategoryFor(bySku.get("slow")!)).toBe("slow");
    expect(countReplenishmentPoolGroups([group])).toMatchObject({ urgent: 1, excluded: 1, slow: 1 });
  });
});
