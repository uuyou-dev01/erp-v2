import type { ListingCoverageProduct } from "@/lib/application/listing-coverage";

export interface InventoryDashboardSummary {
  productCount: number;
  sellableQty: number;
  inTransitQty: number;
  sellableLotQty: number;
  sellableItemUnitCount: number;
  locationCount: number;
  readySkuCount: number;
  platformGapCount: number;
  itemUnitGapCount: number;
  listingGapCount: number;
  catalogIssueCount: number;
}

export interface CatalogReadiness {
  status: "ready" | "needsWork";
  label: string;
  issues: string[];
}

export function buildCatalogReadiness(product: ListingCoverageProduct): CatalogReadiness {
  const issues: string[] = [];

  if (!product.imageUrl) issues.push("缺图");
  if (!product.referencePrice) issues.push("缺参考价");
  if (product.catalogStatus !== "active") issues.push("停用");
  if (!product.brand || !product.category) issues.push("缺品牌/类目");

  return {
    status: issues.length > 0 ? "needsWork" : "ready",
    label: issues.length > 0 ? "主档待补" : "主档就绪",
    issues,
  };
}

export function buildInventoryDashboardSummary(
  products: ListingCoverageProduct[]
): InventoryDashboardSummary {
  const locationIds = new Set<string>();
  let sellableQty = 0;
  let inTransitQty = 0;
  let sellableLotQty = 0;
  let sellableItemUnitCount = 0;
  let readySkuCount = 0;
  let platformGapCount = 0;
  let itemUnitGapCount = 0;
  let catalogIssueCount = 0;

  for (const product of products) {
    sellableQty += product.sellableQty;
    inTransitQty += product.inTransitQty;
    sellableLotQty += product.sellableLotQty;
    sellableItemUnitCount += product.sellableItemUnitCount;
    platformGapCount += product.newStockSummary.pendingListingCount;
    itemUnitGapCount += product.itemUnitSummary.pendingListingCount;

    for (const location of product.sellableLocations) {
      locationIds.add(location.locationId);
    }

    readySkuCount += product.variantRows.filter((variant) => scopedSellableQty(variant) > 0).length;

    if (buildCatalogReadiness(product).issues.length > 0) {
      catalogIssueCount += 1;
    }
  }

  return {
    productCount: products.length,
    sellableQty,
    inTransitQty,
    sellableLotQty,
    sellableItemUnitCount,
    locationCount: locationIds.size,
    readySkuCount,
    platformGapCount,
    itemUnitGapCount,
    listingGapCount: platformGapCount + itemUnitGapCount,
    catalogIssueCount,
  };
}

function scopedSellableQty(variant: ListingCoverageProduct["variantRows"][number]) {
  const scoped = (variant as typeof variant & { scopedSellableQty?: number }).scopedSellableQty;
  return scoped ?? variant.sellableQty;
}

export function buildProductStocktakeHref(
  product: Pick<ListingCoverageProduct, "skuCode">,
  locationId?: string
) {
  const params = new URLSearchParams({ q: product.skuCode });
  if (locationId) params.set("locationId", locationId);
  return `/inventory/stocktake?${params.toString()}`;
}
