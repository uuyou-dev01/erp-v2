import type { ListingCoverageVariantView } from "./listing-coverage";

/** Counts current, sellable inventory only; ended listings never count as on sale. */
export function summarizeListingPlatforms(variants: ListingCoverageVariantView[]) {
  const platforms = new Map<
    string,
    {
      id: string;
      code: string;
      name: string;
      skuTotal: number;
      skuListed: number;
      unitTotal: number;
      unitListed: number;
    }
  >();
  for (const variant of variants) {
    if (variant.scopedSellableQty <= 0) continue;
    const units = variant.scopedItemUnits.filter((unit) => unit.sellable);
    for (const platform of variant.scopedPlatforms) {
      const row = platforms.get(platform.id) ?? {
        id: platform.id,
        code: platform.code,
        name: platform.name,
        skuTotal: 0,
        skuListed: 0,
        unitTotal: 0,
        unitListed: 0,
      };
      if (variant.scopedSellableLotQty > 0) {
        row.skuTotal += 1;
        if (
          variant.scopedSkuRecords.some(
            (record) => record.platformId === platform.id && record.state === "active"
          )
        ) {
          row.skuListed += 1;
        }
      }
      const listedUnits = new Set(
        variant.scopedItemUnitRecords
          .filter((record) => record.platformId === platform.id && record.state === "active")
          .map((record) => record.itemUnitId)
      );
      row.unitTotal += units.length;
      row.unitListed += units.filter((unit) => listedUnits.has(unit.id)).length;
      platforms.set(platform.id, row);
    }
  }
  return [...platforms.values()].filter((row) => row.skuTotal > 0 || row.unitTotal > 0);
}
