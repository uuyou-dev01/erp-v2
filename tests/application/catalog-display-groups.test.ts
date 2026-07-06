import { describe, expect, it } from "vitest";
import {
  buildInventoryLotDisplayGroups,
  buildSkuCatalogDisplayGroups,
} from "@/lib/application/catalog-display-groups";
import type { SkuCatalogListItem } from "@/lib/application/sku-catalog";
import type { getInventoryLots } from "@/app/actions/inventory-lots";

function sku(input: Partial<SkuCatalogListItem> & Pick<SkuCatalogListItem, "id" | "code" | "name">): SkuCatalogListItem {
  return {
    brand: null,
    category: null,
    imageUrl: null,
    parentSkuId: null,
    variantCount: 0,
    catalogStatus: "active",
    productKind: "NEW",
    referencePrice: null,
    currency: null,
    series: null,
    business: {
      sellableQty: "0",
      inTransitQty: "0",
      activeListingCount: 0,
      latestSalePrice: null,
      averageSalePrice: null,
      salesCurrency: null,
      salesCount: 0,
      salesAmount: "0.00",
      lastSoldAt: null,
      averagePurchasePrice: null,
      purchaseCurrency: null,
      grossProfitPerUnit: null,
      grossMarginRate: null,
      primaryPlatformName: null,
      primaryPlatformCode: null,
    },
    ...input,
  };
}

type LotRow = Awaited<ReturnType<typeof getInventoryLots>>[number];

function lot(input: Partial<LotRow> & Pick<LotRow, "id" | "skuId">): LotRow {
  const { id, skuId, ...rest } = input;
  return {
    ...rest,
    id,
    storeId: "store_test",
    skuId,
    locationId: "loc_test",
    batchLabel: null,
    unitCost: "45",
    costCurrency: "CNY",
    sourceType: "TEST",
    sourceId: "source_test",
    receivedAt: new Date("2026-06-23T00:00:00.000Z"),
    status: "ACTIVE",
    createdAt: new Date("2026-06-23T00:00:00.000Z"),
    updatedAt: new Date("2026-06-23T00:00:00.000Z"),
    sku: {
      id: skuId,
      storeId: "store_test",
      code: input.sku?.code ?? skuId,
      name: input.sku?.name ?? skuId,
      parentSkuId: input.sku?.parentSkuId ?? null,
      category: null,
      brand: null,
      attributes: {},
      description: null,
      imageUrl: null,
      isAutoCreated: false,
      mergeStatus: null,
      createdAt: new Date("2026-06-23T00:00:00.000Z"),
      updatedAt: new Date("2026-06-23T00:00:00.000Z"),
      parentSku: input.sku?.parentSku ?? null,
    },
    location: {
      id: "loc_test",
      storeId: "store_test",
      code: "WH",
      name: "Warehouse",
      type: "WAREHOUSE",
      region: "JP",
      address: null,
      isSellableDefault: true,
      createdAt: new Date("2026-06-23T00:00:00.000Z"),
      updatedAt: new Date("2026-06-23T00:00:00.000Z"),
    },
    onHandQuantity: input.onHandQuantity ?? "1",
    inventoryValue: input.inventoryValue ?? "45.00",
    inventoryValueCurrency: "CNY",
  } as unknown as LotRow;
}

describe("catalog display grouping", () => {
  it("groups child SKUs under the parent series in the SKU catalog", () => {
    const parent = sku({
      id: "parent_naruto",
      code: "NARUTO-AKATSUKI",
      name: "火影忍者 晓组织",
      variantCount: 2,
      brand: "POP MART",
      business: {
        sellableQty: "7",
        inTransitQty: "0",
        activeListingCount: 1,
        latestSalePrice: null,
        averageSalePrice: null,
        salesCurrency: null,
        salesCount: 0,
        salesAmount: "0.00",
        lastSoldAt: null,
        averagePurchasePrice: null,
        purchaseCurrency: null,
        grossProfitPerUnit: null,
        grossMarginRate: null,
        primaryPlatformName: null,
        primaryPlatformCode: null,
      },
    });
    const pain = sku({
      id: "child_pain",
      code: "NARUTO-AKATSUKI-PAIN",
      name: "火影忍者 晓组织 佩恩",
      parentSkuId: parent.id,
      brand: "POP MART",
    });
    const konan = sku({
      id: "child_konan",
      code: "NARUTO-AKATSUKI-KONAN",
      name: "火影忍者 晓组织 小南",
      parentSkuId: parent.id,
      brand: "POP MART",
    });

    const groups = buildSkuCatalogDisplayGroups([pain, parent, konan]);

    expect(groups).toHaveLength(1);
    expect(groups[0].head.id).toBe(parent.id);
    expect(groups[0].variantItems.map((item) => item.code)).toEqual([
      pain.code,
      konan.code,
    ]);
    expect(groups[0].variantLabel).toBe("2 个子 SKU");
  });

  it("creates a display group for loose sibling SKUs that do not yet have a parent", () => {
    const pain = sku({
      id: "loose_pain",
      code: "NARUTO-AKATSUKI-PAIN",
      name: "火影忍者 晓组织 佩恩",
      brand: "POP MART",
    });
    const konan = sku({
      id: "loose_konan",
      code: "NARUTO-AKATSUKI-KONAN",
      name: "火影忍者 晓组织 小南",
      brand: "POP MART",
    });

    const groups = buildSkuCatalogDisplayGroups([pain, konan]);

    expect(groups).toHaveLength(1);
    expect(groups[0].isDisplayGroup).toBe(true);
    expect(groups[0].displayName).toBe("火影忍者 晓组织");
    expect(groups[0].variantItems.map((item) => item.code)).toEqual([
      pain.code,
      konan.code,
    ]);
  });

  it("groups lot rows by parent SKU and then by child variant", () => {
    const rows = [
      lot({
        id: "lot_pain_1",
        skuId: "child_pain",
        onHandQuantity: "6",
        sku: {
          code: "NARUTO-AKATSUKI-PAIN",
          name: "火影忍者 晓组织 佩恩",
          parentSkuId: "parent_naruto",
          parentSku: { code: "NARUTO-AKATSUKI", name: "火影忍者 晓组织" },
        } as LotRow["sku"],
      }),
      lot({
        id: "lot_konan_1",
        skuId: "child_konan",
        onHandQuantity: "1",
        sku: {
          code: "NARUTO-AKATSUKI-KONAN",
          name: "火影忍者 晓组织 小南",
          parentSkuId: "parent_naruto",
          parentSku: { code: "NARUTO-AKATSUKI", name: "火影忍者 晓组织" },
        } as LotRow["sku"],
      }),
    ];

    const groups = buildInventoryLotDisplayGroups(rows);

    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe("火影忍者 晓组织");
    expect(groups[0].totalOnHand).toBe(7);
    expect(groups[0].variants.map((variant) => variant.skuCode)).toEqual([
      "NARUTO-AKATSUKI-PAIN",
      "NARUTO-AKATSUKI-KONAN",
    ]);
    expect(groups[0].variants[0].lots).toHaveLength(1);
  });

  it("groups lot rows for loose sibling SKUs by display family", () => {
    const rows = [
      lot({
        id: "lot_loose_pain",
        skuId: "loose_pain",
        onHandQuantity: "6",
        sku: {
          code: "NARUTO-AKATSUKI-PAIN",
          name: "火影忍者 晓组织 佩恩",
          brand: "POP MART",
          parentSkuId: null,
          parentSku: null,
        } as LotRow["sku"],
      }),
      lot({
        id: "lot_loose_konan",
        skuId: "loose_konan",
        onHandQuantity: "1",
        sku: {
          code: "NARUTO-AKATSUKI-KONAN",
          name: "火影忍者 晓组织 小南",
          brand: "POP MART",
          parentSkuId: null,
          parentSku: null,
        } as LotRow["sku"],
      }),
    ];

    const groups = buildInventoryLotDisplayGroups(rows);

    expect(groups).toHaveLength(1);
    expect(groups[0].displayOnly).toBe(true);
    expect(groups[0].title).toBe("火影忍者 晓组织");
    expect(groups[0].totalOnHand).toBe(7);
  });
});
