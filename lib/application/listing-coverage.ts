import { prisma } from "@/lib/prisma";
import {
  CORE_SELLING_PLATFORM_CODES,
  isCoreSellingPlatform,
  sortCoreSellingPlatforms,
} from "@/lib/core-platforms";
import { getStoreStockBreakdown, type StockLocationBreakdown } from "@/lib/application/inventory";
import {
  buildSellableMarketSummaries,
  fulfillmentMarketsForLocation,
  isPlatformTargetForMarket,
  locationMatchesMarket,
  locationMatchesPlatformMarket,
  marketLabel,
  type SellableMarketCode,
  type SellableMarketSummary,
} from "@/lib/application/sellable-market";
import {
  parseSkuCatalogMeta,
  resolveCoverImageUrl,
  type CatalogStatus,
  type ProductKind,
} from "@/lib/application/sku-catalog";
import { familyKey, familyNameFromSkuLike } from "@/lib/application/catalog-display-groups";
import { VALID_SALES_STATUSES } from "@/lib/application/sales-metrics";
import { buildStockingDecision, type StockingDecision } from "@/lib/application/stocking-decision";
import { RESERVING_ALLOCATION_STATUSES } from "@/lib/application/order-allocation";

const STALE_DAYS = 30;

export type ListingCoverageProductType = "SKU" | "ITEM_UNIT";
export type ListingCoveragePlatformState = "active" | "delisted" | "sold_out" | "missing";

export interface ListingCoverageRisk {
  key: string;
  label: string;
  tone: "amber" | "red" | "slate";
}

export interface ListingCoveragePlatform {
  id: string;
  name: string;
  code: string;
  country: string | null;
  state: ListingCoveragePlatformState;
  listingId: string | null;
  status: string | null;
  listedPrice: string | null;
  currency: string | null;
  estimatedNet: string | null;
  listedAt: string | null;
  updatedAt: string | null;
  risks: ListingCoverageRisk[];
}

/** 已有上架记录（不含未覆盖平台） */
export interface ListingRecord {
  skuId: string;
  skuCode: string;
  skuName: string;
  imageUrl: string | null;
  listingId: string;
  salesChannelAccountId: string | null;
  /** Linked to the resale workflow and therefore needs per-line resale settlement. */
  hasResaleSource: boolean;
  platformId: string;
  platformName: string;
  platformCode: string;
  platformCountry: string | null;
  state: ListingCoveragePlatformState;
  status: string;
  listedPrice: string | null;
  currency: string | null;
  platformFeeRate: string | null;
  defaultShippingFee: string | null;
  estimatedNet: string | null;
  listedAt: string;
  updatedAt: string;
  risks: ListingCoverageRisk[];
  /** 与 Listing 平台地区匹配的当前可发库存 */
  sellableQty: number;
  /** 与 Listing 平台地区匹配的可发仓位 */
  sellableLocations: StockLocationBreakdown[];
  /** 上架维度：批次 SKU 或中古单件 */
  listingScope: ListingCoverageProductType;
  itemUnitId: string | null;
  itemUnitLabel: string | null;
}

export interface SellableItemUnitRow {
  id: string;
  skuId: string;
  conditionGrade: string | null;
  locationId: string;
  locationName: string;
  locationRegion: string | null;
  fulfillableMarkets?: SellableMarketCode[];
  sellable: boolean;
  inTransit: boolean;
  imageUrl: string | null;
  status: string;
  photoCount: number;
  labelStatus: string;
}

export interface StockChannelSummary {
  sellableQty: number;
  activeListingCount: number;
  pendingListingCount: number;
}

export interface ItemUnitChannelSummary {
  sellableCount: number;
  activeListingCount: number;
  pendingListingCount: number;
  pendingPhotoCount: number;
  pendingLabelCount: number;
}

export interface ListingCoverageVariantRow {
  skuId: string;
  skuCode: string;
  skuName: string;
  imageUrl: string | null;
  brand?: string | null;
  categoryId?: string | null;
  category?: string | null;
  productKind?: ProductKind;
  referencePrice?: string | null;
  referenceCurrency?: string | null;
  catalogStatus?: CatalogStatus;
  sellableQty: number;
  sellableLotQty: number;
  sellableItemUnitCount: number;
  inTransitQty: number;
  sellableLocations: StockLocationBreakdown[];
  inTransitLocations: StockLocationBreakdown[];
}

export interface ListingCoverageVariantView extends ListingCoverageVariantRow {
  scopedSellableQty: number;
  scopedSellableLotQty: number;
  scopedSellableItemUnitCount: number;
  scopedInTransitQty: number;
  scopedSellableLocations: StockLocationBreakdown[];
  scopedInTransitLocations: StockLocationBreakdown[];
  scopedRecords: ListingRecord[];
  scopedSkuRecords: ListingRecord[];
  scopedItemUnitRecords: ListingRecord[];
  scopedItemUnits: SellableItemUnitRow[];
  scopedPlatforms: ListingCoveragePlatform[];
}

export interface ListingCoverageProduct {
  key: string;
  listingType: ListingCoverageProductType;
  skuId: string;
  itemUnitId: string | null;
  skuCode: string;
  skuName: string;
  imageUrl: string | null;
  conditionGrade: string | null;
  locationName: string | null;
  /** 批次可售 + 中古可售件数 */
  sellableQty: number;
  /** 仅 Lot 批次可售 */
  sellableLotQty: number;
  /** 中古单件可售件数 */
  sellableItemUnitCount: number;
  /** 商品组 / 展示分组下的具体规格 SKU */
  variantRows: ListingCoverageVariantRow[];
  inTransitQty: number;
  sellableLocations: StockLocationBreakdown[];
  inTransitLocations: StockLocationBreakdown[];
  itemUnits: SellableItemUnitRow[];
  primaryMarket: SellableMarketCode;
  marketLabel: string;
  marketSummaries: SellableMarketSummary[];
  newStockSummary: StockChannelSummary;
  itemUnitSummary: ItemUnitChannelSummary;
  hasLotStock: boolean;
  hasItemUnits: boolean;
  /** 仅已有上架记录，供可售库存页使用 */
  records: ListingRecord[];
  /** 全平台矩阵，供辅助页或筛选使用 */
  platforms: ListingCoveragePlatform[];
  /** 未按主市场过滤的核心平台矩阵，供跨市场详情和单件行使用 */
  allPlatforms: ListingCoveragePlatform[];
  aggregateRisks: ListingCoverageRisk[];
  latestListedAt: string | null;
  latestUpdatedAt: string | null;
  /** 主数据摘要（来自 SKU.attributes） */
  brand: string | null;
  categoryId?: string | null;
  category: string | null;
  productKind: ProductKind;
  referencePrice: string | null;
  referenceCurrency: string | null;
  catalogStatus: CatalogStatus;
  /** 仅由真实订单、真实库存和轻量参考信号派生，不把档案/情报当成实销。 */
  stockingDecision?: StockingDecision;
}

export interface ListingCoverageStats {
  totalProducts: number;
  activeProducts: number;
  sellableProducts: number;
  incompleteProducts: number;
  riskProducts: number;
  soldOutProducts: number;
}

export interface SellableInventoryStats {
  totalProducts: number;
  withListings: number;
  withoutListings: number;
  activeListingCount: number;
  riskProducts: number;
}

type ProductDraft = Omit<
  ListingCoverageProduct,
  | "platforms"
  | "allPlatforms"
  | "records"
  | "aggregateRisks"
  | "latestListedAt"
  | "latestUpdatedAt"
  | "newStockSummary"
  | "itemUnitSummary"
  | "primaryMarket"
  | "marketLabel"
  | "marketSummaries"
  | "variantRows"
> & {
  listings: ListingRow[];
  variantStats: Map<string, ListingCoverageVariantRow>;
};

type ListingRow = Awaited<ReturnType<typeof getListingRows>>[number];
type StoreStockBreakdown =
  Awaited<ReturnType<typeof getStoreStockBreakdown>> extends Map<string, infer T> ? T : never;

function firstPhoto(value: unknown) {
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return null;
}

function productKey(type: ListingCoverageProductType, id: string) {
  return `${type}:${id}`;
}

function statusToState(status: string): ListingCoveragePlatformState {
  if (status === "ACTIVE") return "active";
  if (status === "SOLD_OUT") return "sold_out";
  return "delisted";
}

function riskKey(risk: ListingCoverageRisk) {
  return `${risk.key}:${risk.label}`;
}

function mergeStockLocationBreakdowns(
  existing: StockLocationBreakdown[],
  next: StockLocationBreakdown[]
) {
  const byLocation = new Map(existing.map((location) => [location.locationId, { ...location }]));
  for (const location of next) {
    const current = byLocation.get(location.locationId);
    if (current) {
      current.qty += location.qty;
    } else {
      byLocation.set(location.locationId, { ...location });
    }
  }
  return [...byLocation.values()].sort((a, b) => b.qty - a.qty);
}

function locationMatchesScope(
  location: Pick<StockLocationBreakdown, "locationId" | "region" | "fulfillableMarkets">,
  market?: SellableMarketCode,
  locationId?: string
) {
  if (market && !locationMatchesMarket(location, market)) return false;
  if (locationId && location.locationId !== locationId) return false;
  return true;
}

function itemUnitMatchesScope(
  unit: Pick<SellableItemUnitRow, "locationId" | "locationRegion" | "fulfillableMarkets">,
  market?: SellableMarketCode,
  locationId?: string
) {
  if (
    market &&
    !locationMatchesMarket(
      { region: unit.locationRegion, fulfillableMarkets: unit.fulfillableMarkets },
      market
    )
  ) {
    return false;
  }
  if (locationId && unit.locationId !== locationId) return false;
  return true;
}

export function buildVariantView(input: {
  variant: ListingCoverageVariantRow;
  records: ListingRecord[];
  itemUnits: SellableItemUnitRow[];
  platforms: ListingCoveragePlatform[];
  market?: SellableMarketCode;
  locationId?: string;
}): ListingCoverageVariantView {
  const scopedSellableLocations = input.variant.sellableLocations.filter((location) =>
    locationMatchesScope(location, input.market, input.locationId)
  );
  const scopedInTransitLocations = input.variant.inTransitLocations.filter((location) =>
    locationMatchesScope(location, input.market, input.locationId)
  );
  const scopedItemUnits = input.itemUnits.filter(
    (unit) =>
      unit.skuId === input.variant.skuId &&
      (unit.sellable || unit.inTransit) &&
      itemUnitMatchesScope(unit, input.market, input.locationId)
  );
  const scopedPlatformIds = new Set(
    (input.market
      ? input.platforms.filter((platform) => isPlatformTargetForMarket(platform, input.market!))
      : input.platforms
    ).map((platform) => platform.id)
  );
  const scopedRecords = input.records.filter(
    (record) => record.skuId === input.variant.skuId && scopedPlatformIds.has(record.platformId)
  );
  const scopedSkuRecords = scopedRecords.filter((record) => record.listingScope !== "ITEM_UNIT");
  const scopedItemUnitIds = new Set(scopedItemUnits.map((unit) => unit.id));
  const scopedItemUnitRecords = scopedRecords.filter(
    (record) =>
      record.listingScope === "ITEM_UNIT" &&
      record.itemUnitId &&
      scopedItemUnitIds.has(record.itemUnitId)
  );
  const scopedPlatforms = input.platforms.filter((platform) => scopedPlatformIds.has(platform.id));
  const scopedSellableQty = scopedSellableLocations.reduce(
    (sum, location) => sum + location.qty,
    0
  );
  const scopedSellableItemUnits = scopedItemUnits.filter((unit) => unit.sellable);

  return {
    ...input.variant,
    scopedSellableQty,
    scopedSellableLotQty: Math.max(0, scopedSellableQty - scopedSellableItemUnits.length),
    scopedSellableItemUnitCount: scopedSellableItemUnits.length,
    scopedInTransitQty: scopedInTransitLocations.reduce((sum, location) => sum + location.qty, 0),
    scopedSellableLocations,
    scopedInTransitLocations,
    scopedRecords,
    scopedSkuRecords,
    scopedItemUnitRecords,
    scopedItemUnits,
    scopedPlatforms,
  };
}

export function buildScopedListingCoverageProduct(
  product: ListingCoverageProduct,
  scope: { market?: SellableMarketCode; locationId?: string }
): ListingCoverageProduct | null {
  if (!scope.market && !scope.locationId) return product;

  const variantViews = product.variantRows
    .map((variant) =>
      buildVariantView({
        variant,
        records: product.records,
        itemUnits: product.itemUnits,
        platforms: scope.market ? product.allPlatforms : product.platforms,
        market: scope.market,
        locationId: scope.locationId,
      })
    )
    .filter((variant) => variant.scopedSellableQty > 0 || variant.scopedInTransitQty > 0);

  if (variantViews.length === 0) return null;

  const recordsById = new Map<string, ListingRecord>();
  const itemUnitsById = new Map<string, SellableItemUnitRow>();
  let sellableQty = 0;
  let sellableLotQty = 0;
  let sellableItemUnitCount = 0;
  let inTransitQty = 0;
  let sellableLocations: StockLocationBreakdown[] = [];
  let inTransitLocations: StockLocationBreakdown[] = [];

  for (const variant of variantViews) {
    sellableQty += variant.scopedSellableQty;
    sellableLotQty += variant.scopedSellableLotQty;
    sellableItemUnitCount += variant.scopedSellableItemUnitCount;
    inTransitQty += variant.scopedInTransitQty;
    sellableLocations = mergeStockLocationBreakdowns(
      sellableLocations,
      variant.scopedSellableLocations
    );
    inTransitLocations = mergeStockLocationBreakdowns(
      inTransitLocations,
      variant.scopedInTransitLocations
    );
    for (const record of variant.scopedRecords) {
      recordsById.set(record.listingId, record);
    }
    for (const unit of variant.scopedItemUnits) {
      itemUnitsById.set(unit.id, unit);
    }
  }

  const records = [...recordsById.values()];
  const itemUnits = [...itemUnitsById.values()];
  const sellableItemUnits = itemUnits.filter((unit) => unit.sellable);
  const targetPlatforms = scope.market
    ? product.allPlatforms.filter((platform) => isPlatformTargetForMarket(platform, scope.market!))
    : product.platforms;
  const targetPlatformIds = new Set(targetPlatforms.map((platform) => platform.id));
  const activeSkuListingPlatformIds = new Set(
    records
      .filter(
        (record) =>
          record.listingScope === "SKU" &&
          record.status === "ACTIVE" &&
          targetPlatformIds.has(record.platformId)
      )
      .map((record) => record.platformId)
  );
  const activeItemUnitListingCount = records.filter(
    (record) => record.listingScope === "ITEM_UNIT" && record.status === "ACTIVE"
  ).length;
  const activeListedItemUnitIds = new Set(
    records
      .filter(
        (record) =>
          record.listingScope === "ITEM_UNIT" && record.status === "ACTIVE" && record.itemUnitId
      )
      .map((record) => record.itemUnitId as string)
  );

  return {
    ...product,
    sellableQty,
    sellableLotQty,
    sellableItemUnitCount,
    inTransitQty,
    sellableLocations,
    inTransitLocations,
    itemUnits,
    variantRows: variantViews,
    records,
    platforms: targetPlatforms,
    newStockSummary: {
      sellableQty: sellableLotQty,
      activeListingCount: activeSkuListingPlatformIds.size,
      pendingListingCount:
        sellableLotQty > 0
          ? Math.max(0, targetPlatforms.length - activeSkuListingPlatformIds.size)
          : 0,
    },
    itemUnitSummary: {
      sellableCount: sellableItemUnits.length,
      activeListingCount: activeItemUnitListingCount,
      pendingListingCount: sellableItemUnits.filter((unit) => !activeListedItemUnitIds.has(unit.id))
        .length,
      pendingPhotoCount: sellableItemUnits.filter((unit) => unit.photoCount === 0).length,
      pendingLabelCount: sellableItemUnits.filter((unit) => unit.labelStatus !== "ATTACHED").length,
    },
    hasLotStock: sellableLotQty > 0 || inTransitQty > 0,
    hasItemUnits: itemUnits.length > 0,
    aggregateRisks: records.flatMap((record) => record.risks),
    latestListedAt:
      records
        .map((record) => record.listedAt)
        .sort()
        .at(-1) ?? null,
    latestUpdatedAt:
      records
        .map((record) => record.updatedAt)
        .sort()
        .at(-1) ?? null,
  };
}

function buildRisks(
  listing: {
    status: string;
    listingType: string;
    listedPrice: { toString(): string } | null;
    listedAt: Date;
  },
  sellableQty: number
): ListingCoverageRisk[] {
  if (listing.status !== "ACTIVE") return [];

  const risks: ListingCoverageRisk[] = [];
  if (sellableQty === 0) {
    risks.push({ key: "lowStock", label: "库存不足", tone: "amber" });
  }
  if (!listing.listedPrice) {
    risks.push({ key: "unpriced", label: "未定价", tone: "red" });
  }
  const ageInDays = (Date.now() - new Date(listing.listedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (ageInDays > STALE_DAYS) {
    risks.push({ key: "stale", label: "长期未售", tone: "slate" });
  }
  return risks;
}

async function getListingRows(storeId: string) {
  return prisma.listing.findMany({
    where: { storeId },
    include: {
      platform: {
        select: {
          id: true,
          name: true,
          code: true,
          country: true,
          defaultFeeRate: true,
          defaultShippingFee: true,
        },
      },
      sku: {
        select: { id: true, parentSkuId: true, code: true, name: true, imageUrl: true },
      },
      itemUnit: {
        include: {
          sku: {
            select: { id: true, parentSkuId: true, code: true, name: true, imageUrl: true },
          },
          location: {
            select: {
              id: true,
              code: true,
              name: true,
              region: true,
              type: true,
              isSellableDefault: true,
              capabilities: { where: { enabled: true }, select: { code: true, enabled: true } },
              shippingLanesFrom: {
                where: { active: true, laneType: "CUSTOMER_DELIVERY" },
                select: { laneType: true, destinationCountry: true, active: true },
              },
            },
          },
        },
      },
      resaleListings: { select: { id: true } },
    },
    orderBy: { listedAt: "desc" },
  });
}

function newestListingForPlatform(listings: ListingRow[], platformId: string) {
  const candidates = listings.filter((listing) => listing.platformId === platformId);
  return (
    candidates.find((listing) => listing.status === "ACTIVE") ??
    candidates.find((listing) => listing.status === "SOLD_OUT") ??
    candidates[0] ??
    null
  );
}

function listingRowToRecord(
  listing: ListingRow,
  stockScope: {
    sellableQty: number;
    sellableLocations: StockLocationBreakdown[];
  }
): ListingRecord {
  const scope: ListingCoverageProductType =
    listing.listingType === "ITEM_UNIT" ? "ITEM_UNIT" : "SKU";
  const listingSku = listing.sku ?? listing.itemUnit?.sku;

  return {
    skuId: listing.skuId ?? listing.itemUnit?.skuId ?? "",
    skuCode: listingSku?.code ?? "",
    skuName: listingSku?.name ?? "",
    imageUrl: listingSku?.imageUrl ?? null,
    listingId: listing.id,
    salesChannelAccountId: listing.salesChannelAccountId,
    hasResaleSource: listing.resaleListings.length > 0,
    platformId: listing.platformId,
    platformName: listing.platform.name,
    platformCode: listing.platform.code,
    platformCountry: listing.platform.country,
    state: statusToState(listing.status),
    status: listing.status,
    listedPrice: listing.listedPrice?.toString() ?? null,
    currency: listing.currency,
    platformFeeRate:
      listing.feeRateOverride?.toString() ?? listing.platform.defaultFeeRate?.toString() ?? null,
    defaultShippingFee:
      listing.shippingFeeOverride?.toString() ??
      listing.platform.defaultShippingFee?.toString() ??
      null,
    estimatedNet: listing.estimatedNet?.toString() ?? null,
    listedAt: listing.listedAt.toISOString(),
    updatedAt: listing.updatedAt.toISOString(),
    risks: buildRisks(listing, stockScope.sellableQty),
    sellableQty: stockScope.sellableQty,
    sellableLocations: stockScope.sellableLocations,
    listingScope: scope,
    itemUnitId: listing.itemUnitId,
    itemUnitLabel: listing.itemUnit?.conditionGrade ?? null,
  };
}

function buildListedRecords(
  draftListings: ListingRow[],
  stockScopeForListing: (listing: ListingRow) => {
    sellableQty: number;
    sellableLocations: StockLocationBreakdown[];
  }
): ListingRecord[] {
  return draftListings
    .map((listing) => listingRowToRecord(listing, stockScopeForListing(listing)))
    .sort((a, b) => {
      if (a.status === "ACTIVE" && b.status !== "ACTIVE") return -1;
      if (b.status === "ACTIVE" && a.status !== "ACTIVE") return 1;
      return new Date(b.listedAt).getTime() - new Date(a.listedAt).getTime();
    });
}

function skuDraftKey(skuId: string) {
  return productKey("SKU", skuId);
}

function marketFromCountry(country?: string | null): SellableMarketCode {
  const normalized = country?.toUpperCase();
  if (normalized === "JP" || normalized === "CN" || normalized === "US" || normalized === "EU") {
    return normalized;
  }
  if (normalized === "GLOBAL") return "GLOBAL";
  return "UNKNOWN";
}

function inferMarketFromActiveListings(listings: ListingRow[]): SellableMarketCode {
  const counts = new Map<SellableMarketCode, number>();
  for (const listing of listings) {
    if (listing.status !== "ACTIVE") continue;
    const market = marketFromCountry(listing.platform.country);
    if (market === "UNKNOWN") continue;
    counts.set(market, (counts.get(market) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "UNKNOWN";
}

function emptyVariantRow(sku: {
  id: string;
  code: string;
  name: string;
  imageUrl?: string | null;
}): ListingCoverageVariantRow {
  return {
    skuId: sku.id,
    skuCode: sku.code,
    skuName: sku.name,
    imageUrl: sku.imageUrl ?? null,
    sellableQty: 0,
    sellableLotQty: 0,
    sellableItemUnitCount: 0,
    inTransitQty: 0,
    sellableLocations: [],
    inTransitLocations: [],
  };
}

export async function getListingCoverageProducts(storeId: string) {
  const now = new Date();
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(now.getDate() - 90);

  const [
    platforms,
    listings,
    skus,
    itemUnits,
    stockBreakdown,
    recentSalesLines,
    activeLots,
    activeFulfillmentItemAllocations,
  ] = await Promise.all([
    prisma.platform.findMany({
      where: { storeId, code: { in: [...CORE_SELLING_PLATFORM_CODES] } },
      select: { id: true, name: true, code: true, country: true },
    }),
    getListingRows(storeId),
    prisma.sKU.findMany({
      where: { storeId },
      select: {
        id: true,
        parentSkuId: true,
        catalogRole: true,
        code: true,
        name: true,
        imageUrl: true,
        brand: true,
        categoryId: true,
        category: true,
        attributes: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.itemUnit.findMany({
      where: { storeId, status: { in: ["AVAILABLE", "CONSUMED"] } },
      include: {
        sku: {
          select: { id: true, code: true, name: true, imageUrl: true },
        },
        location: {
          select: {
            name: true,
            region: true,
            isSellableDefault: true,
            capabilities: { where: { enabled: true }, select: { code: true, enabled: true } },
            shippingLanesFrom: {
              where: { active: true, laneType: "CUSTOMER_DELIVERY" },
              select: { laneType: true, destinationCountry: true, active: true },
            },
          },
        },
        allocations: {
          where: { status: { in: [...RESERVING_ALLOCATION_STATUSES] } },
          select: { id: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    getStoreStockBreakdown(storeId),
    prisma.orderLine.findMany({
      where: {
        sku: { storeId },
        order: {
          orderStatus: { in: [...VALID_SALES_STATUSES] },
          orderDate: { gte: ninetyDaysAgo },
        },
      },
      select: {
        skuId: true,
        quantity: true,
        order: {
          select: {
            orderDate: true,
          },
        },
      },
    }),
    prisma.inventoryLot.findMany({
      where: { storeId, status: "ACTIVE" },
      select: {
        skuId: true,
        receivedAt: true,
      },
    }),
    prisma.fulfillmentInventoryAllocation.findMany({
      where: {
        status: "ALLOCATED",
        itemUnitId: { not: null },
        fulfillmentRequest: { storeId },
      },
      select: { itemUnitId: true },
    }),
  ]);

  const corePlatforms = sortCoreSellingPlatforms(platforms);
  const drafts = new Map<string, ProductDraft>();
  const skuCatalogById = new Map(
    skus.map((sku) => {
      const meta = parseSkuCatalogMeta(sku.attributes, sku.imageUrl);
      return [
        sku.id,
        {
          brand: sku.brand,
          categoryId: sku.categoryId,
          category: sku.category,
          imageUrl: resolveCoverImageUrl(meta, sku.imageUrl),
          productKind: meta.productKind,
          referencePrice: meta.referencePrice ?? null,
          referenceCurrency: meta.currency ?? null,
          catalogStatus: meta.catalogStatus,
        },
      ] as const;
    })
  );
  const salesBySku = new Map<string, { sales30Qty: number; sales90Qty: number }>();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);
  for (const line of recentSalesLines) {
    const qty = Number(line.quantity.toString());
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const current = salesBySku.get(line.skuId) ?? { sales30Qty: 0, sales90Qty: 0 };
    current.sales90Qty += qty;
    if (line.order.orderDate >= thirtyDaysAgo) {
      current.sales30Qty += qty;
    }
    salesBySku.set(line.skuId, current);
  }

  const oldestStockDateBySku = new Map<string, Date>();
  const rememberOldestStockDate = (skuId: string, date: Date) => {
    const current = oldestStockDateBySku.get(skuId);
    if (!current || date < current) {
      oldestStockDateBySku.set(skuId, date);
    }
  };
  for (const lot of activeLots) {
    const breakdown = stockBreakdown.get(lot.skuId);
    if (!breakdown || breakdown.sellableLotQty + breakdown.inTransitLotQty <= 0) continue;
    rememberOldestStockDate(lot.skuId, lot.receivedAt);
  }

  function catalogFieldsForSku(skuId: string) {
    const c = skuCatalogById.get(skuId);
    return {
      brand: c?.brand ?? null,
      categoryId: c?.categoryId ?? null,
      category: c?.category ?? null,
      imageUrl: c?.imageUrl ?? null,
      productKind: c?.productKind ?? ("NEW" as ProductKind),
      referencePrice: c?.referencePrice ?? null,
      referenceCurrency: c?.referenceCurrency ?? null,
      catalogStatus: c?.catalogStatus ?? ("active" as CatalogStatus),
    };
  }

  const skuById = new Map(skus.map((sku) => [sku.id, sku]));
  const fallbackDisplayGroups = new Map<
    string,
    {
      key: string;
      title: string;
      code: string;
      headSkuId: string;
    }
  >();

  const familyBuckets = new Map<string, typeof skus>();
  for (const sku of skus) {
    // Independent SIMPLE SKUs must remain separate even when names look
    // related. Automatic grouping is only a legacy fallback for variants.
    if (sku.parentSkuId || sku.catalogRole !== "VARIANT") continue;
    const key = familyKey(sku);
    if (!key) continue;
    const bucket = familyBuckets.get(key) ?? [];
    bucket.push(sku);
    familyBuckets.set(key, bucket);
  }

  for (const [key, bucket] of familyBuckets.entries()) {
    if (bucket.length < 2) continue;
    const head = bucket[0];
    const title = familyNameFromSkuLike(head) ?? head.name;
    const group = {
      key: `DISPLAY:${key}`,
      title,
      code: "展示分组",
      headSkuId: head.id,
    };
    for (const sku of bucket) {
      fallbackDisplayGroups.set(sku.id, group);
    }
  }

  function coverageSkuId(skuId: string) {
    return skuById.get(skuId)?.parentSkuId ?? skuId;
  }

  function coverageGroupKey(skuId: string) {
    const sku = skuById.get(skuId);
    if (sku?.parentSkuId) return skuDraftKey(sku.parentSkuId);
    const fallback = fallbackDisplayGroups.get(skuId);
    if (fallback) return fallback.key;
    return skuDraftKey(skuId);
  }

  function displaySkuForGroup(skuId: string) {
    const sku = skuById.get(skuId);
    if (sku?.parentSkuId) {
      const parent = skuById.get(sku.parentSkuId);
      if (parent) {
        return {
          id: parent.id,
          code: parent.code,
          name: parent.name,
          catalogSkuId: parent.id,
        };
      }
    }
    const fallback = fallbackDisplayGroups.get(skuId);
    if (fallback) {
      return {
        id: fallback.headSkuId,
        code: fallback.code,
        name: fallback.title,
        catalogSkuId: fallback.headSkuId,
      };
    }
    return sku ? { id: sku.id, code: sku.code, name: sku.name, catalogSkuId: sku.id } : null;
  }

  function mergeLocationBreakdowns(
    existing: StockLocationBreakdown[],
    next: StockLocationBreakdown[]
  ) {
    const byLocation = new Map(existing.map((location) => [location.locationId, { ...location }]));
    for (const location of next) {
      const current = byLocation.get(location.locationId);
      if (current) {
        current.qty += location.qty;
      } else {
        byLocation.set(location.locationId, { ...location });
      }
    }
    return [...byLocation.values()];
  }

  function ensureVariantStats(draft: ProductDraft, skuId: string) {
    const sku = skuById.get(skuId);
    if (!sku) return null;
    let row = draft.variantStats.get(skuId);
    if (!row) {
      row = {
        ...emptyVariantRow(sku),
        ...catalogFieldsForSku(skuId),
      };
      draft.variantStats.set(skuId, row);
    }
    return row;
  }

  function addStockBreakdown(draft: ProductDraft, skuId: string, breakdown: StoreStockBreakdown) {
    draft.sellableLotQty += breakdown.sellableLotQty;
    draft.inTransitQty += breakdown.inTransitLotQty;
    draft.sellableLocations = mergeLocationBreakdowns(
      draft.sellableLocations,
      breakdown.sellableLocations
    );
    draft.inTransitLocations = mergeLocationBreakdowns(
      draft.inTransitLocations,
      breakdown.inTransitLocations
    );
    draft.hasLotStock =
      draft.hasLotStock || breakdown.sellableLotQty > 0 || breakdown.inTransitLotQty > 0;
    draft.sellableQty = draft.sellableLotQty + draft.sellableItemUnitCount;

    const variant = ensureVariantStats(draft, skuId);
    if (variant) {
      variant.sellableLotQty += breakdown.sellableLotQty;
      variant.inTransitQty += breakdown.inTransitLotQty;
      variant.sellableLocations = mergeLocationBreakdowns(
        variant.sellableLocations,
        breakdown.sellableLocations
      );
      variant.inTransitLocations = mergeLocationBreakdowns(
        variant.inTransitLocations,
        breakdown.inTransitLocations
      );
      variant.sellableQty = variant.sellableLotQty + variant.sellableItemUnitCount;
    }
  }

  function ensureSkuDraft(skuId: string) {
    const key = coverageGroupKey(skuId);
    let draft = drafts.get(key);
    if (draft) return draft;

    const displaySku = displaySkuForGroup(skuId);
    if (!displaySku) return null;

    const catalog = catalogFieldsForSku(displaySku.catalogSkuId);
    draft = {
      key,
      listingType: "SKU",
      skuId: displaySku.id,
      itemUnitId: null,
      skuCode: displaySku.code,
      skuName: displaySku.name,
      conditionGrade: null,
      locationName: null,
      sellableQty: 0,
      sellableLotQty: 0,
      sellableItemUnitCount: 0,
      inTransitQty: 0,
      sellableLocations: [],
      inTransitLocations: [],
      itemUnits: [],
      hasLotStock: false,
      hasItemUnits: false,
      listings: [],
      variantStats: new Map(),
      ...catalog,
    };
    drafts.set(key, draft);
    return draft;
  }

  for (const sku of skus) {
    const breakdown = stockBreakdown.get(sku.id);
    if (!breakdown || (breakdown.sellableQty <= 0 && breakdown.inTransitQty <= 0)) {
      continue;
    }
    const draft = ensureSkuDraft(sku.id);
    if (!draft) continue;

    addStockBreakdown(draft, sku.id, breakdown);
  }

  const fulfillmentReservedItemUnitIds = new Set(
    activeFulfillmentItemAllocations.flatMap((allocation) =>
      allocation.itemUnitId ? [allocation.itemUnitId] : []
    )
  );

  for (const item of itemUnits) {
    const isReserved = item.allocations.length > 0 || fulfillmentReservedItemUnitIds.has(item.id);
    const isSellable =
      item.status === "AVAILABLE" && !isReserved && item.location.isSellableDefault;
    const inTransit =
      item.status === "AVAILABLE" && !isReserved && !item.location.isSellableDefault;
    if (!isSellable && !inTransit) continue;
    rememberOldestStockDate(item.skuId, item.createdAt);

    const draft = ensureSkuDraft(item.skuId);
    if (!draft) continue;

    const catalog = catalogFieldsForSku(coverageSkuId(item.skuId));
    const unitImage = firstPhoto(item.photos) ?? catalog.imageUrl ?? item.sku.imageUrl;

    draft.itemUnits.push({
      id: item.id,
      skuId: item.skuId,
      conditionGrade: item.conditionGrade,
      locationId: item.locationId,
      locationName: item.location.name,
      locationRegion: item.location.region,
      fulfillableMarkets: fulfillmentMarketsForLocation(item.location),
      sellable: isSellable,
      inTransit,
      imageUrl: unitImage,
      status: item.status,
      photoCount: Array.isArray(item.photos) ? item.photos.length : 0,
      labelStatus: item.labelStatus,
    });

    if (isSellable) {
      draft.sellableItemUnitCount += 1;
      const variant = ensureVariantStats(draft, item.skuId);
      if (variant) {
        variant.sellableItemUnitCount += 1;
        variant.sellableQty = variant.sellableLotQty + variant.sellableItemUnitCount;
      }
    } else if (inTransit) {
      draft.inTransitQty += 1;
      const variant = ensureVariantStats(draft, item.skuId);
      if (variant) {
        variant.inTransitQty += 1;
      }
    }
    draft.hasItemUnits = true;
    draft.sellableQty = draft.sellableLotQty + draft.sellableItemUnitCount;

    if (!draft.imageUrl && unitImage) {
      draft.imageUrl = unitImage;
    }
  }

  for (const listing of listings) {
    if (!isCoreSellingPlatform(listing.platform.code)) continue;

    const sku = listing.sku ?? listing.itemUnit?.sku;
    if (!sku) continue;

    const draft = ensureSkuDraft(sku.id);
    if (!draft) continue;

    draft.listings.push(listing);
  }

  return [...drafts.values()].map((draft) => {
    const { listings: draftListings, itemUnits: draftItemUnits, variantStats, ...product } = draft;
    const sellableItemUnitIds = new Set(draftItemUnits.filter((u) => u.sellable).map((u) => u.id));
    const marketSummaries = buildSellableMarketSummaries({
      sellableLocations: product.sellableLocations,
      inTransitLocations: product.inTransitLocations,
      itemUnits: draftItemUnits,
    });
    const locationMarket = marketSummaries[0]?.market ?? "UNKNOWN";
    const primaryMarket =
      locationMarket === "UNKNOWN" ? inferMarketFromActiveListings(draftListings) : locationMarket;
    const targetPlatforms = corePlatforms.filter((platform) =>
      isPlatformTargetForMarket(platform, primaryMarket)
    );
    const platformsForProduct = targetPlatforms;
    const stockScopeForListing = (listing: ListingRow) => {
      if (listing.listingType === "ITEM_UNIT") {
        const itemUnitSellable =
          Boolean(listing.itemUnitId && sellableItemUnitIds.has(listing.itemUnitId)) &&
          Boolean(
            listing.itemUnit?.location &&
            locationMatchesPlatformMarket(listing.itemUnit.location, listing.platform)
          );
        return {
          sellableQty: itemUnitSellable ? 1 : 0,
          sellableLocations:
            itemUnitSellable && listing.itemUnit?.location
              ? [
                  {
                    locationId: listing.itemUnit.location.id,
                    code: listing.itemUnit.location.code,
                    name: listing.itemUnit.location.name,
                    region: listing.itemUnit.location.region,
                    type: listing.itemUnit.location.type,
                    fulfillableMarkets: fulfillmentMarketsForLocation(listing.itemUnit.location),
                    qty: 1,
                  },
                ]
              : [],
        };
      }

      const skuId = listing.skuId ?? listing.sku?.id;
      const variant = skuId ? variantStats.get(skuId) : undefined;
      const sellableLocations = (variant?.sellableLocations ?? []).filter((location) =>
        locationMatchesPlatformMarket(location, listing.platform)
      );
      return {
        sellableQty: sellableLocations.reduce((sum, location) => sum + location.qty, 0),
        sellableLocations,
      };
    };

    const platformStateFor = (platform: (typeof corePlatforms)[number]) => {
      const listing = newestListingForPlatform(draftListings, platform.id);
      const risks = listing ? buildRisks(listing, stockScopeForListing(listing).sellableQty) : [];
      return {
        id: platform.id,
        name: platform.name,
        code: platform.code,
        country: platform.country,
        state: listing ? statusToState(listing.status) : "missing",
        listingId: listing?.id ?? null,
        status: listing?.status ?? null,
        listedPrice: listing?.listedPrice?.toString() ?? null,
        currency: listing?.currency ?? null,
        estimatedNet: listing?.estimatedNet?.toString() ?? null,
        listedAt: listing?.listedAt.toISOString() ?? null,
        updatedAt: listing?.updatedAt.toISOString() ?? null,
        risks,
      } satisfies ListingCoveragePlatform;
    };

    const allPlatformsWithState = corePlatforms.map(platformStateFor);
    const platformsWithState = platformsForProduct.map(platformStateFor);

    const risks = new Map<string, ListingCoverageRisk>();
    for (const platform of platformsWithState) {
      for (const risk of platform.risks) {
        risks.set(riskKey(risk), risk);
      }
    }

    const datedListings = draftListings.filter((listing) => listing.listedAt);
    const latestListedAt =
      datedListings
        .map((listing) => listing.listedAt.toISOString())
        .sort()
        .at(-1) ?? null;
    const latestUpdatedAt =
      draftListings
        .map((listing) => listing.updatedAt.toISOString())
        .sort()
        .at(-1) ?? null;

    const records = buildListedRecords(draftListings, stockScopeForListing);
    const targetPlatformIds = new Set(platformsWithState.map((platform) => platform.id));
    const activeSkuListingPlatformIds = new Set(
      records
        .filter(
          (record) =>
            record.listingScope === "SKU" &&
            record.status === "ACTIVE" &&
            targetPlatformIds.has(record.platformId)
        )
        .map((record) => record.platformId)
    );
    const activeItemUnitListingCount = records.filter(
      (record) => record.listingScope === "ITEM_UNIT" && record.status === "ACTIVE"
    ).length;
    const activeListedItemUnitIds = new Set(
      records
        .filter(
          (record) =>
            record.listingScope === "ITEM_UNIT" && record.status === "ACTIVE" && record.itemUnitId
        )
        .map((record) => record.itemUnitId as string)
    );
    const sellableItemUnits = draftItemUnits.filter((unit) => unit.sellable);

    const metricSkuIds = [...variantStats.keys()];
    const productSales = metricSkuIds.reduce(
      (acc, skuId) => {
        const sales = salesBySku.get(skuId);
        if (!sales) return acc;
        acc.sales30Qty += sales.sales30Qty;
        acc.sales90Qty += sales.sales90Qty;
        return acc;
      },
      { sales30Qty: 0, sales90Qty: 0 }
    );
    const oldestStockDate = metricSkuIds
      .map((skuId) => oldestStockDateBySku.get(skuId))
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const oldestStockAgeDays = oldestStockDate
      ? Math.floor((now.getTime() - oldestStockDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const hasReferenceSignal =
      Boolean(product.referencePrice) ||
      records.some((record) => record.listedPrice || record.estimatedNet);
    const stockingDecision = buildStockingDecision({
      sellableQty: product.sellableQty,
      inTransitQty: product.inTransitQty,
      sales30Qty: productSales.sales30Qty,
      sales90Qty: productSales.sales90Qty,
      oldestStockAgeDays,
      hasReferenceSignal,
    });

    return {
      ...product,
      itemUnits: draftItemUnits,
      variantRows: [...variantStats.values()].sort(
        (a, b) => b.sellableQty - a.sellableQty || a.skuName.localeCompare(b.skuName, "zh-CN")
      ),
      primaryMarket,
      marketLabel: marketLabel(primaryMarket),
      marketSummaries,
      newStockSummary: {
        sellableQty: product.sellableLotQty,
        activeListingCount: activeSkuListingPlatformIds.size,
        pendingListingCount:
          product.sellableLotQty > 0
            ? Math.max(0, platformsWithState.length - activeSkuListingPlatformIds.size)
            : 0,
      },
      itemUnitSummary: {
        sellableCount: sellableItemUnits.length,
        activeListingCount: activeItemUnitListingCount,
        pendingListingCount: sellableItemUnits.filter(
          (unit) => !activeListedItemUnitIds.has(unit.id)
        ).length,
        pendingPhotoCount: sellableItemUnits.filter((unit) => unit.photoCount === 0).length,
        pendingLabelCount: sellableItemUnits.filter((unit) => unit.labelStatus !== "ATTACHED")
          .length,
      },
      records,
      platforms: platformsWithState,
      allPlatforms: allPlatformsWithState,
      aggregateRisks: [...risks.values()],
      latestListedAt,
      latestUpdatedAt,
      stockingDecision,
    };
  });
}

export function computeSellableInventoryStats(
  products: ListingCoverageProduct[]
): SellableInventoryStats {
  let activeListingCount = 0;
  for (const product of products) {
    activeListingCount += product.records.filter((r) => r.state === "active").length;
  }
  return {
    totalProducts: products.length,
    withListings: products.filter((p) => p.records.length > 0).length,
    withoutListings: products.filter((p) => p.records.length === 0).length,
    activeListingCount,
    riskProducts: products.filter((p) => p.aggregateRisks.length > 0).length,
  };
}

export function computeListingCoverageStats(
  products: ListingCoverageProduct[]
): ListingCoverageStats {
  return {
    totalProducts: products.length,
    activeProducts: products.filter((product) =>
      product.platforms.some((platform) => platform.state === "active")
    ).length,
    sellableProducts: products.filter((product) => product.sellableQty > 0).length,
    incompleteProducts: products.filter((product) =>
      product.platforms.some((platform) => platform.state === "missing")
    ).length,
    riskProducts: products.filter((product) => product.aggregateRisks.length > 0).length,
    soldOutProducts: products.filter((product) =>
      product.platforms.some((platform) => platform.state === "sold_out")
    ).length,
  };
}
