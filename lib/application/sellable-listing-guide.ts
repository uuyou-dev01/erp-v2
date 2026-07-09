import type {
  ListingCoveragePlatform,
  ListingCoverageProduct,
} from "@/lib/application/listing-coverage";
import {
  inferMarketFromLocation,
  isPlatformTargetForMarket,
} from "@/lib/application/sellable-market";

/** 可售但尚未有任何上架记录 */
export function isAwaitingFirstListing(product: ListingCoverageProduct) {
  return product.sellableQty > 0 && product.records.length === 0;
}

/** 已有上架，但仍有平台未覆盖 */
export function getMissingPlatforms(
  product: ListingCoverageProduct,
  options?: { listingScope?: "SKU" | "ITEM_UNIT"; itemUnitId?: string }
): ListingCoveragePlatform[] {
  if (options?.listingScope === "ITEM_UNIT") {
    const unit = product.itemUnits.find((item) => item.id === options.itemUnitId);
    if (!unit) return [];

    const unitMarket = inferMarketFromLocation({
      region: unit.locationRegion,
      name: unit.locationName,
    });
    const targetPlatforms = product.allPlatforms.filter((platform) =>
      isPlatformTargetForMarket(platform, unitMarket)
    );
    const displayPlatforms = targetPlatforms.length > 0 ? targetPlatforms : product.allPlatforms;
    const activePlatformIds = new Set(
      product.records
        .filter(
          (record) =>
            record.listingScope === "ITEM_UNIT" &&
            record.itemUnitId === unit.id &&
            record.state === "active"
        )
        .map((record) => record.platformId)
    );

    return displayPlatforms.filter((platform) => !activePlatformIds.has(platform.id));
  }

  if (options?.listingScope === "SKU") {
    const activePlatformIds = new Set(
      product.records
        .filter(
          (record) =>
            record.listingScope === "SKU" &&
            record.skuId === product.skuId &&
            record.state === "active"
        )
        .map((record) => record.platformId)
    );
    return product.platforms.filter((platform) => !activePlatformIds.has(platform.id));
  }

  return product.platforms.filter((platform) => platform.state === "missing");
}

export function canExpandToMorePlatforms(product: ListingCoverageProduct) {
  const hasActive = product.records.some((record) => record.state === "active");
  return hasActive && getMissingPlatforms(product).length > 0;
}

export function buildListingCreateHref(
  product: ListingCoverageProduct,
  platformId?: string,
  options?: { listingScope?: "SKU" | "ITEM_UNIT"; itemUnitId?: string }
) {
  const params = new URLSearchParams();
  const scope =
    options?.listingScope ??
    (product.hasItemUnits && !product.hasLotStock ? "ITEM_UNIT" : "SKU");
  params.set("listingType", scope);
  params.set("skuId", product.skuId);
  if (scope === "ITEM_UNIT" && options?.itemUnitId) {
    params.set("itemUnitId", options.itemUnitId);
  }
  if (platformId) params.set("platformId", platformId);
  return `/listing/new?${params.toString()}`;
}

export interface SellableGuideSummary {
  awaitingFirstListing: number;
  expandablePlatform: number;
  unlistedProducts: ListingCoverageProduct[];
  expandableProducts: ListingCoverageProduct[];
}

export function summarizeSellableGuides(
  sellableProducts: ListingCoverageProduct[]
): SellableGuideSummary {
  const unlistedProducts = sellableProducts.filter(isAwaitingFirstListing);
  const expandableProducts = sellableProducts.filter(canExpandToMorePlatforms);
  return {
    awaitingFirstListing: unlistedProducts.length,
    expandablePlatform: expandableProducts.length,
    unlistedProducts,
    expandableProducts,
  };
}
