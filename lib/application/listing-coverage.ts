import { getConsolidationTransitLines } from "./consolidation-transit";
import { getPurchaseIncoming } from "./purchase-incoming";
import { listingPriceRisks } from "./listing-price-risk";
import { prisma } from "@/lib/prisma";
import { sortSellingPlatforms } from "@/lib/core-platforms";
import { getStoreStockBreakdown, type StockLocationBreakdown } from "@/lib/application/inventory";
import {
  buildSellableMarketSummaries,
  fulfillmentMarketsForLocation,
  inferMarketFromLocation,
  inferMarketFromPlatform,
  isPlatformTargetForMarket,
  locationIsInMarket,
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
import { ACCEPTED_SALES_WHERE } from "@/lib/application/sales-metrics";
import { buildStockingDecision, type StockingDecision } from "@/lib/application/stocking-decision";
import { RESERVING_ALLOCATION_STATUSES } from "@/lib/application/order-allocation";

import {
  buildReplenishmentDecision,
  DEFAULT_REPLENISHMENT_POLICY,
  type ReplenishmentDecision,
  type ReplenishmentPolicy,
  type ReplenishmentSales,
} from "@/lib/application/replenishment";

const STALE_DAYS = 30;
const DAY_MS = 86_400_000;

/** Serializable, non-overlapping demand buckets. Unallocated sales have no warehouse. */
export interface VariantDemandSignal {
  market: SellableMarketCode;
  locationId: string | null;
  sales7Qty: number;
  sales30Qty: number;
  sales90Qty: number;
  orderIds30: string[];
}

export interface VariantStockAgeSignal {
  market: SellableMarketCode;
  locationId: string;
  oldestStockAgeDays: number;
}

export interface VariantIncomingSignal {
  kind: "purchase" | "transit";
  market: SellableMarketCode;
  locationId: string | null;
  qty: number;
  etaDate: string | null;
  /** Only arrivals at a confirmed sellable destination can cover demand. */
  sellableDestination: boolean;
}

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
  isPresale?: boolean;
  expectedShipDate?: string | null;
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
  replenishment?: ReplenishmentDecision;
  stockingDecision?: StockingDecision;
  demandSignals?: VariantDemandSignal[];
  presaleDemandSignals?: Array<{ market: SellableMarketCode; locationId: null; qty: number }>;
  stockAgeSignals?: VariantStockAgeSignal[];
  incomingSignals?: VariantIncomingSignal[];
  incomingSummary?: {
    nextArrivalDate: string | null;
    unknownEtaQty: number;
    overdueQty: number;
  };
  replenishmentPolicy?: ReplenishmentPolicy;
  metricsAsOf?: string;
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
  const byLocation = new Map(existing.map((location) => [location.logisticsHref ?? location.locationId, { ...location }]));
  for (const location of next) {
    const current = byLocation.get(location.logisticsHref ?? location.locationId);
    if (current) {
      current.qty += location.qty;
    } else {
      byLocation.set(location.logisticsHref ?? location.locationId, { ...location });
    }
  }
  return [...byLocation.values()].sort((a, b) => b.qty - a.qty);
}

function locationMatchesScope(
  location: Pick<
    StockLocationBreakdown,
    "locationId" | "region" | "code" | "name" | "fulfillableMarkets"
  >,
  market?: SellableMarketCode,
  locationId?: string
) {
  if (market && !locationIsInMarket(location, market)) return false;
  if (locationId && location.locationId !== locationId) return false;
  return true;
}

function itemUnitMatchesScope(
  unit: Pick<
    SellableItemUnitRow,
    "locationId" | "locationName" | "locationRegion" | "fulfillableMarkets"
  >,
  market?: SellableMarketCode,
  locationId?: string
) {
  if (
    market &&
    !locationIsInMarket({ region: unit.locationRegion, name: unit.locationName }, market)
  ) {
    return false;
  }
  if (locationId && unit.locationId !== locationId) return false;
  return true;
}

function fulfillmentMarketsForStock(
  locations: Array<Pick<StockLocationBreakdown, "fulfillableMarkets">>,
  fallbackMarket?: SellableMarketCode
) {
  const hasFulfillmentData = locations.some(
    (location) => location.fulfillableMarkets !== undefined
  );
  const markets = [...new Set(locations.flatMap((location) => location.fulfillableMarkets ?? []))];
  if (hasFulfillmentData) return markets;
  return fallbackMarket ? [fallbackMarket] : [];
}

function signalMatchesScope(
  signal: { market: SellableMarketCode; locationId: string | null },
  market?: SellableMarketCode,
  locationId?: string
) {
  return (
    (!market || market === "GLOBAL" || signal.market === market) &&
    (!locationId || signal.locationId === locationId)
  );
}

function scopedVariantDecisions(
  variant: ListingCoverageVariantRow,
  sellableQty: number,
  inTransitQty: number,
  scope: { market?: SellableMarketCode; locationId?: string; policy?: ReplenishmentPolicy } = {}
) {
  // Legacy fixtures/callers without source signals cannot safely reattribute global sales.
  if (!variant.demandSignals) return {};
  const sales: ReplenishmentSales = { sales7Qty: 0, sales30Qty: 0, sales90Qty: 0, orderCount30: 0 };
  const orderIds = new Set<string>();
  for (const signal of variant.demandSignals) {
    if (!signalMatchesScope(signal, scope.market, scope.locationId)) continue;
    sales.sales7Qty += signal.sales7Qty;
    sales.sales30Qty += signal.sales30Qty;
    sales.sales90Qty += signal.sales90Qty;
    signal.orderIds30.forEach((id) => orderIds.add(id));
  }
  sales.orderCount30 = orderIds.size;
  const incoming = (variant.incomingSignals ?? []).filter((signal) =>
    signalMatchesScope(signal, scope.market, scope.locationId)
  );
  const onOrderQty = incoming
    .filter((signal) => signal.kind === "purchase")
    .reduce((sum, signal) => sum + signal.qty, 0);
  const now = variant.metricsAsOf ? new Date(variant.metricsAsOf) : new Date();
  const policy = scope.policy ?? variant.replenishmentPolicy ?? DEFAULT_REPLENISHMENT_POLICY;
  const input = {
    ...sales,
    pendingPresaleQty: (variant.presaleDemandSignals ?? []).filter((signal) =>
      signalMatchesScope(signal, scope.market, scope.locationId)
    ).reduce((sum, signal) => sum + signal.qty, 0),
    sellableQty,
    inTransitQty,
    onOrderQty,
    productKind: variant.productKind,
    catalogStatus: variant.catalogStatus,
    policy,
    now,
  };
  const initial = buildReplenishmentDecision(input);
  const currentDay = new Date(now).setUTCHours(0, 0, 0, 0);
  const incomingSummary = {
    nextArrivalDate: null as string | null,
    unknownEtaQty: 0,
    overdueQty: 0,
  };
  for (const signal of incoming) {
    const arrivalDay = signal.etaDate
      ? new Date(signal.etaDate).setUTCHours(0, 0, 0, 0)
      : Number.NaN;
    if (!Number.isFinite(arrivalDay)) {
      incomingSummary.unknownEtaQty += signal.qty;
    } else if (arrivalDay < currentDay) {
      incomingSummary.overdueQty += signal.qty;
    } else {
      const arrivalDate = new Date(arrivalDay).toISOString().slice(0, 10);
      if (!incomingSummary.nextArrivalDate || arrivalDate < incomingSummary.nextArrivalDate) {
        incomingSummary.nextArrivalDate = arrivalDate;
      }
    }
  }
  // An existing order arriving before a new order could arrive should reduce new purchasing,
  // even if stock is already exhausted. The shortage alert still uses current sellable stock.
  const arrivalWindowEnd =
    currentDay + Math.max(policy.leadTimeDays, Math.ceil(initial.coverageDays ?? 0)) * DAY_MS;
  const timelyIncomingQty = incoming.reduce((sum, signal) => {
    if (!signal.etaDate || !signal.locationId || !signal.sellableDestination) return sum;
    const arrivalDay = new Date(signal.etaDate).setUTCHours(0, 0, 0, 0);
    return arrivalDay >= currentDay && arrivalDay <= arrivalWindowEnd ? sum + signal.qty : sum;
  }, 0);
  const stockAges = (variant.stockAgeSignals ?? [])
    .filter((signal) => signalMatchesScope(signal, scope.market, scope.locationId))
    .map((signal) => signal.oldestStockAgeDays);
  const stockingDecision = buildStockingDecision({
    sellableQty,
    inTransitQty,
    ...sales,
    oldestStockAgeDays: stockAges.length ? Math.max(...stockAges) : null,
    hasReferenceSignal: Boolean(variant.referencePrice),
  });
  return {
    replenishment: buildReplenishmentDecision({ ...input, timelyIncomingQty }),
    replenishmentPolicy: policy,
    stockingDecision,
    incomingSummary,
  };
}

export function buildVariantView(input: {
  variant: ListingCoverageVariantRow;
  records: ListingRecord[];
  itemUnits: SellableItemUnitRow[];
  platforms: ListingCoveragePlatform[];
  market?: SellableMarketCode;
  locationId?: string;
  policy?: ReplenishmentPolicy;
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
  const fulfillmentMarkets = fulfillmentMarketsForStock(scopedSellableLocations, input.market);
  const scopedPlatformIds = new Set(
    (input.market
      ? input.platforms.filter((platform) =>
          fulfillmentMarkets.some((market) => isPlatformTargetForMarket(platform, market))
        )
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
  const scopedInTransitQty = scopedInTransitLocations.reduce(
    (sum, location) => sum + location.qty,
    0
  );

  return {
    ...input.variant,
    ...scopedVariantDecisions(input.variant, scopedSellableQty, scopedInTransitQty, input),
    scopedSellableQty,
    scopedSellableLotQty: Math.max(0, scopedSellableQty - scopedSellableItemUnits.length),
    scopedSellableItemUnitCount: scopedSellableItemUnits.length,
    scopedInTransitQty,
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
  scope: {
    market?: SellableMarketCode;
    locationId?: string;
    includeDemandOnly?: boolean;
    policy?: ReplenishmentPolicy;
  }
): ListingCoverageProduct | null {
  if (!scope.market && !scope.locationId && !scope.policy) return product;

  const variantViews = product.variantRows
    .map((variant) =>
      buildVariantView({
        variant,
        records: product.records,
        itemUnits: product.itemUnits,
        platforms: scope.market ? product.allPlatforms : product.platforms,
        market: scope.market,
        locationId: scope.locationId,
        policy: scope.policy,
      })
    )
    .filter(
      (variant) =>
        variant.scopedSellableQty > 0 ||
        variant.scopedInTransitQty > 0 ||
        (scope.includeDemandOnly && ((variant.replenishment?.sales90Qty ?? 0) > 0 || (variant.replenishment?.pendingPresaleQty ?? 0) > 0))
    );

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
  const marketSummaries = buildSellableMarketSummaries({
    sellableLocations,
    inTransitLocations,
    itemUnits,
  });
  const primaryMarket = scope.market ?? marketSummaries[0]?.market ?? product.primaryMarket;
  const fulfillmentMarkets = fulfillmentMarketsForStock(sellableLocations, scope.market);
  const targetPlatforms = scope.market
    ? product.allPlatforms.filter((platform) =>
        fulfillmentMarkets.some((market) => isPlatformTargetForMarket(platform, market))
      )
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
    primaryMarket,
    marketLabel: marketLabel(primaryMarket),
    marketSummaries,
    sellableQty,
    sellableLotQty,
    sellableItemUnitCount,
    inTransitQty,
    sellableLocations,
    inTransitLocations,
    itemUnits,
    variantRows: variantViews.map((variant) => ({
      ...variant,
      sellableQty: variant.scopedSellableQty,
      sellableLotQty: variant.scopedSellableLotQty,
      sellableItemUnitCount: variant.scopedSellableItemUnitCount,
      inTransitQty: variant.scopedInTransitQty,
      sellableLocations: variant.scopedSellableLocations,
      inTransitLocations: variant.scopedInTransitLocations,
    })),
    stockingDecision: buildStockingDecision({
      sellableQty,
      inTransitQty,
      sales30Qty: variantViews.reduce(
        (sum, variant) => sum + (variant.stockingDecision?.sales30Qty ?? 0),
        0
      ),
      sales90Qty: variantViews.reduce(
        (sum, variant) => sum + (variant.stockingDecision?.sales90Qty ?? 0),
        0
      ),
      oldestStockAgeDays: variantViews.some(
        (variant) => variant.stockingDecision?.oldestStockAgeDays != null
      )
        ? Math.max(
            ...variantViews.map((variant) => variant.stockingDecision?.oldestStockAgeDays ?? 0)
          )
        : null,
      hasReferenceSignal: Boolean(product.referencePrice),
    }),
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
    currency?: string | null;
    platform?: {
      code: string;
      country?: string | null;
      defaultCurrency?: string | null;
      defaultShippingFee?: { toString(): string } | null;
    };
    shippingFeeOverride?: { toString(): string } | null;
  },
  sellableQty: number
): ListingCoverageRisk[] {
  const risks: ListingCoverageRisk[] = listingPriceRisks({
    ...listing,
    defaultShippingFee: listing.shippingFeeOverride ?? listing.platform?.defaultShippingFee,
  });
  if (listing.status !== "ACTIVE") return risks;
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
          defaultCurrency: true,
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
    isPresale: listing.isPresale,
    expectedShipDate: listing.expectedShipDate?.toISOString().slice(0, 10) ?? null,
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

export async function getListingCoverageProducts(storeId: string, policy?: ReplenishmentPolicy) {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * DAY_MS);

  const [
    platforms,
    listings,
    skus,
    itemUnits,
    stockBreakdown,
    recentSalesLines,
    activeLots,
    activeFulfillmentItemAllocations,
    lotBalances,
    lotReservations,
    ordinaryTransferLines,
    consolidationLines,
    purchaseIncoming,
    pendingPresaleLines,
  ] = await Promise.all([
    prisma.platform.findMany({
      where: { storeId },
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
      where: { storeId, status: { in: ["AVAILABLE", "CONSOLIDATING"] } },
      include: {
        sku: {
          select: { id: true, code: true, name: true, imageUrl: true },
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
          storeId,
          ...ACCEPTED_SALES_WHERE,
          orderDate: { gte: ninetyDaysAgo, lte: now },
        },
      },
      select: {
        id: true,
        skuId: true,
        orderId: true,
        quantity: true,
        allocations: {
          where: {
            status: {
              in: [
                "PENDING",
                "ALLOCATED",
                "SHIPPED",
                "DELIVERED",
                "RETURNED",
                "PARTIALLY_RETURNED",
              ],
            },
          },
          select: {
            id: true,
            status: true,
            quantity: true,
            lotId: true,
            itemUnitId: true,
            inventoryLot: {
              select: {
                locationId: true,
                location: { select: { region: true, code: true, name: true } },
              },
            },
            itemUnit: {
              select: {
                locationId: true,
                location: { select: { region: true, code: true, name: true } },
              },
            },
          },
        },
        afterSalesLines: {
          select: {
            receipts: {
              where: { createdAt: { lte: now } },
              select: { orderAllocationId: true, quantity: true },
            },
          },
        },
        order: {
          select: {
            orderDate: true,
            platform: { select: { country: true, code: true } },
          },
        },
      },
    }),
    prisma.inventoryLot.findMany({
      where: { storeId, status: { in: ["ACTIVE", "CONSOLIDATING"] } },
      select: {
        id: true,
        skuId: true,
        receivedAt: true,
        locationId: true,
        location: { select: { region: true, code: true, name: true } },
      },
    }),
    prisma.fulfillmentInventoryAllocation.findMany({
      where: {
        status: "ALLOCATED",
        fulfillmentRequest: { storeId },
      },
      select: { itemUnitId: true, lotId: true, quantity: true },
    }),
    prisma.stockLedger.groupBy({
      by: ["entityId"],
      where: { storeId, entityType: "LOT" },
      _sum: { deltaQty: true },
    }),
    prisma.orderAllocation.findMany({
      where: { status: { in: [...RESERVING_ALLOCATION_STATUSES] }, inventoryLot: { storeId } },
      select: { lotId: true, quantity: true },
    }),
    prisma.inboundShipmentInventoryLine.findMany({
      where: { status: "IN_TRANSIT", shipment: { storeId, receivedAt: null, status: { in: ["IN_TRANSIT", "EXCEPTION"] } } },
      select: {
        entityType: true,
        entityId: true,
        quantity: true,
        shipmentId: true,
        shipment: {
          select: {
            etaDate: true,
            toLocation: {
              select: {
                id: true,
                code: true,
                name: true,
                region: true,
                type: true,
                isSellableDefault: true,
              },
            },
          },
        },
      },
    }),
    getConsolidationTransitLines(storeId),
    getPurchaseIncoming(storeId),
    prisma.orderLine.findMany({
      where: { order: { storeId, isPresale: true, orderStatus: "DRAFT" } },
      select: {
        skuId: true, quantity: true,
        order: { select: { isPresale: true, shippingCountry: true, platform: { select: { country: true, code: true } } } },
        allocations: { where: { status: { in: [...RESERVING_ALLOCATION_STATUSES] } }, select: { quantity: true } },
      },
    }),
  ]);

  const transferLines = [...ordinaryTransferLines, ...consolidationLines];

  // A lot can move after a sale. Prefer the immutable outbound ledger location over
  // the lot's current location, while still taking demand quantity from valid orders.
  const saleMovements = recentSalesLines.length
    ? await prisma.stockLedger.findMany({
        where: {
          storeId,
          reason: "OUTBOUND_SALE",
          refType: "ORDER_LINE",
          refId: { in: recentSalesLines.map((line) => line.id) },
          deltaQty: { lt: 0 },
        },
        select: {
          refId: true,
          entityType: true,
          entityId: true,
          deltaQty: true,
          locationId: true,
          location: { select: { region: true, code: true, name: true } },
        },
      })
    : [];
  const saleMovementsByLine = new Map<string, typeof saleMovements>();
  for (const movement of saleMovements) {
    if (!movement.refId) continue;
    const lines = saleMovementsByLine.get(movement.refId) ?? [];
    lines.push(movement);
    saleMovementsByLine.set(movement.refId, lines);
  }

  const corePlatforms = sortSellingPlatforms(platforms);
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
  const demandSignalsBySku = new Map<string, VariantDemandSignal[]>();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
  const demandBuckets = new Map<string, Map<string, VariantDemandSignal>>();
  for (const line of recentSalesLines) {
    const returnsByAllocation = new Map<string, number>();
    for (const afterSale of line.afterSalesLines) {
      for (const receipt of afterSale.receipts)
        returnsByAllocation.set(
          receipt.orderAllocationId,
          (returnsByAllocation.get(receipt.orderAllocationId) ?? 0) +
            Math.max(0, Number(receipt.quantity.toString()))
        );
    }
    const returnsByEntity = new Map<string, number>();
    let returnedQty = 0;
    for (const allocation of line.allocations) {
      const qty = Math.max(0, Number(allocation.quantity.toString()));
      // Older returns may predate the receipts table; a fully returned allocation is still definitive.
      const returned = Math.min(
        qty,
        allocation.status === "RETURNED" ? qty : (returnsByAllocation.get(allocation.id) ?? 0)
      );
      returnsByAllocation.set(allocation.id, returned);
      returnedQty += returned;
      const key = allocation.lotId
        ? `LOT:${allocation.lotId}`
        : `ITEM_UNIT:${allocation.itemUnitId}`;
      returnsByEntity.set(key, (returnsByEntity.get(key) ?? 0) + returned);
    }
    let remaining = Math.max(0, Number(line.quantity.toString()) - returnedQty);
    if (!Number.isFinite(remaining) || remaining <= 0) continue;
    const buckets = demandBuckets.get(line.skuId) ?? new Map<string, VariantDemandSignal>();
    demandBuckets.set(line.skuId, buckets);
    const addDemand = (qty: number, market: SellableMarketCode, locationId: string | null) => {
      if (qty <= 0) return;
      const key = `${market}:${locationId ?? "unallocated"}`;
      const current = buckets.get(key) ?? {
        market,
        locationId,
        sales7Qty: 0,
        sales30Qty: 0,
        sales90Qty: 0,
        orderIds30: [],
      };
      current.sales90Qty += qty;
      if (line.order.orderDate >= thirtyDaysAgo) {
        current.sales30Qty += qty;
        if (!current.orderIds30.includes(line.orderId)) current.orderIds30.push(line.orderId);
      }
      if (line.order.orderDate >= sevenDaysAgo) current.sales7Qty += qty;
      buckets.set(key, current);
    };
    const shippedByEntity = new Map<string, number>();
    const movementReturns = new Map(returnsByEntity);
    for (const movement of saleMovementsByLine.get(line.id) ?? []) {
      const key = `${movement.entityType}:${movement.entityId}`;
      const shipped = Math.max(0, -Number(movement.deltaQty.toString()));
      const returned = Math.min(shipped, movementReturns.get(key) ?? 0);
      movementReturns.set(key, (movementReturns.get(key) ?? 0) - returned);
      const qty = Math.min(remaining, shipped - returned);
      addDemand(qty, inferMarketFromLocation(movement.location), movement.locationId);
      remaining -= qty;
      shippedByEntity.set(key, (shippedByEntity.get(key) ?? 0) + qty);
    }
    for (const allocation of line.allocations) {
      const source = allocation.inventoryLot ?? allocation.itemUnit;
      if (!source) continue;
      const key = allocation.lotId
        ? `LOT:${allocation.lotId}`
        : `ITEM_UNIT:${allocation.itemUnitId}`;
      const quantity = Math.max(
        0,
        Number(allocation.quantity.toString()) - (returnsByAllocation.get(allocation.id) ?? 0)
      );
      const shippedQty = Math.min(shippedByEntity.get(key) ?? 0, quantity);
      shippedByEntity.set(key, (shippedByEntity.get(key) ?? 0) - shippedQty);
      const qty = Math.min(remaining, quantity - shippedQty);
      addDemand(qty, inferMarketFromLocation(source.location), source.locationId);
      remaining -= qty;
      if (remaining <= 0) break;
    }
    // Unallocated demand belongs to its platform market only. Never copy it to each warehouse.
    addDemand(
      remaining,
      line.order.platform ? inferMarketFromPlatform(line.order.platform) : "UNKNOWN",
      null
    );
  }
  for (const [skuId, buckets] of demandBuckets)
    demandSignalsBySku.set(skuId, [...buckets.values()]);

  const lotAvailable = new Map(
    lotBalances.map((lot) => [lot.entityId, Number(lot._sum.deltaQty?.toString() ?? 0)])
  );
  for (const reservation of [...lotReservations, ...activeFulfillmentItemAllocations]) {
    if (reservation.lotId)
      lotAvailable.set(
        reservation.lotId,
        Math.max(
          0,
          (lotAvailable.get(reservation.lotId) ?? 0) - Number(reservation.quantity.toString())
        )
      );
  }
  const stockAgeSignalsBySku = new Map<string, VariantStockAgeSignal[]>();
  const rememberOldestStockDate = (
    skuId: string,
    date: Date,
    locationId: string,
    market: SellableMarketCode
  ) => {
    const signals = stockAgeSignalsBySku.get(skuId) ?? [];
    const age = Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_MS));
    const existing = signals.find((signal) => signal.locationId === locationId);
    if (existing) existing.oldestStockAgeDays = Math.max(existing.oldestStockAgeDays, age);
    else signals.push({ locationId, market, oldestStockAgeDays: age });
    stockAgeSignalsBySku.set(skuId, signals);
  };
  const transferringLotIds = new Set(
    transferLines.filter((line) => line.entityType === "LOT").map((line) => line.entityId)
  );
  for (const lot of activeLots) {
    if ((lotAvailable.get(lot.id) ?? 0) <= 0) continue;
    // The location must have stock left after reservations, transfers and channel protection.
    if (
      !stockBreakdown
        .get(lot.skuId)
        ?.sellableLotLocations.some(
          (location) => location.locationId === lot.locationId && location.qty > 0
        )
    )
      continue;
    if (transferringLotIds.has(lot.id)) continue;
    rememberOldestStockDate(
      lot.skuId,
      lot.receivedAt,
      lot.locationId,
      inferMarketFromLocation(lot.location)
    );
  }
  const incomingSignalsBySku = new Map<string, VariantIncomingSignal[]>();
  const addIncoming = (skuId: string, signal: VariantIncomingSignal) => {
    if (signal.qty <= 0) return;
    const signals = incomingSignalsBySku.get(skuId) ?? [];
    signals.push(signal);
    incomingSignalsBySku.set(skuId, signals);
  };
  for (const line of purchaseIncoming) {
    // Purchases committed to an individual order cannot cover general replenishment.
    if (line.forOrderLineId) continue;
    const destination = line.destination;
    addIncoming(line.skuId, {
      kind: line.inTransit ? "transit" : "purchase",
      market: destination ? inferMarketFromLocation(destination) : "UNKNOWN",
      locationId: destination?.id ?? null,
      qty: line.quantity,
      etaDate: line.etaDate?.toISOString() ?? null,
      sellableDestination: Boolean(destination?.isSellableDefault),
    });
  }
  const lotsById = new Map(activeLots.map((lot) => [lot.id, lot]));
  const itemsById = new Map(itemUnits.map((item) => [item.id, item]));
  const fulfillmentReservedIds = new Set(
    activeFulfillmentItemAllocations.flatMap((allocation) =>
      allocation.itemUnitId ? [allocation.itemUnitId] : []
    )
  );
  const transferByEntity = new Map(
    transferLines.map((line) => [`${line.entityType}:${line.entityId}`, line])
  );
  for (const line of transferByEntity.values()) {
    const lot = line.entityType === "LOT" ? lotsById.get(line.entityId) : undefined;
    const item = line.entityType === "ITEM_UNIT" ? itemsById.get(line.entityId) : undefined;
    const skuId = lot?.skuId ?? item?.skuId;
    if (!skuId) continue;
    const available = lot
      ? (lotAvailable.get(lot.id) ?? 0)
      : item && item.allocations.length === 0 && !fulfillmentReservedIds.has(item.id)
        ? 1
        : 0;
    const destination = line.shipment.toLocation;
    addIncoming(skuId, {
      kind: "transit",
      market: destination ? inferMarketFromLocation(destination) : "UNKNOWN",
      locationId: destination?.id ?? null,
      qty: Math.min(Math.max(0, Number(line.quantity.toString())), available),
      etaDate: line.shipment.etaDate?.toISOString() ?? null,
      sellableDestination: Boolean(destination?.isSellableDefault),
    });
  }
  const transferDestinationByShipment = new Map(
    transferLines.map((line) => [`shipment:${line.shipmentId}`, line.shipment.toLocation])
  );
  for (const line of purchaseIncoming) {
    if (line.inTransit && line.shipmentId) {
      transferDestinationByShipment.set(`shipment:${line.shipmentId}`, line.destination);
    }
  }
  const mapTransitLocations = (locations: StockLocationBreakdown[]) =>
    locations.map((location) => {
      const destination = transferDestinationByShipment.get(location.locationId);
      return destination
        ? {
            ...location,
            locationId: destination.id,
            code: location.code,
            region: destination.region,
            name: location.name,
          }
        : location;
    });

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
    const byLocation = new Map(existing.map((location) => [location.logisticsHref ?? location.locationId, { ...location }]));
    for (const location of next) {
      const current = byLocation.get(location.logisticsHref ?? location.locationId);
      if (current) {
        current.qty += location.qty;
      } else {
        byLocation.set(location.logisticsHref ?? location.locationId, { ...location });
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
        demandSignals: demandSignalsBySku.get(skuId) ?? [],
        presaleDemandSignals: pendingPresaleLines.filter((line) => line.order.isPresale && line.skuId === skuId).map((line) => ({
          market: inferMarketFromPlatform({ country: line.order.shippingCountry ?? line.order.platform?.country ?? null, code: line.order.platform?.code ?? "" }),
          locationId: null,
          qty: Math.max(0, Number(line.quantity) - line.allocations.reduce((sum, a) => sum + Number(a.quantity), 0)),
        })),
        stockAgeSignals: stockAgeSignalsBySku.get(skuId) ?? [],
        incomingSignals: incomingSignalsBySku.get(skuId) ?? [],
        replenishmentPolicy: policy,
        metricsAsOf: now.toISOString(),
      };
      draft.variantStats.set(skuId, row);
    }
    return row;
  }

  function addStockBreakdown(draft: ProductDraft, skuId: string, breakdown: StoreStockBreakdown) {
    draft.sellableLotQty += breakdown.sellableLotQty;
    draft.sellableItemUnitCount += breakdown.sellableItemUnitCount;
    draft.inTransitQty += breakdown.inTransitQty;
    draft.sellableLocations = mergeLocationBreakdowns(
      draft.sellableLocations,
      breakdown.sellableLocations
    );
    draft.inTransitLocations = mergeLocationBreakdowns(
      draft.inTransitLocations,
      mapTransitLocations(breakdown.inTransitLocations)
    );
    draft.hasLotStock =
      draft.hasLotStock || breakdown.sellableLotQty > 0 || breakdown.inTransitLotQty > 0;
    draft.sellableQty = draft.sellableLotQty + draft.sellableItemUnitCount;

    const variant = ensureVariantStats(draft, skuId);
    if (variant) {
      variant.sellableLotQty += breakdown.sellableLotQty;
      variant.sellableItemUnitCount += breakdown.sellableItemUnitCount;
      variant.inTransitQty += breakdown.inTransitQty;
      variant.sellableLocations = mergeLocationBreakdowns(
        variant.sellableLocations,
        breakdown.sellableLocations
      );
      variant.inTransitLocations = mergeLocationBreakdowns(
        variant.inTransitLocations,
        mapTransitLocations(breakdown.inTransitLocations)
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

  const fulfillmentReservedItemUnitIds = fulfillmentReservedIds;
  const itemBudgets = new Map<string, number>();
  for (const [skuId, breakdown] of stockBreakdown) {
    for (const location of breakdown.sellableItemUnitLocations)
      itemBudgets.set(`sellable:${skuId}:${location.locationId}`, location.qty);
    for (const location of breakdown.inTransitItemUnitLocations)
      itemBudgets.set(`transit:${skuId}:${location.locationId}`, location.qty);
  }
  for (const item of itemUnits) {
    const isReserved = item.allocations.length > 0 || fulfillmentReservedItemUnitIds.has(item.id);
    const transfer = transferByEntity.get(`ITEM_UNIT:${item.id}`);
    const budgetLocationId = transfer ? `shipment:${transfer.shipmentId}` : item.locationId;
    const budgetKey = `${transfer ? "transit" : "sellable"}:${item.skuId}:${budgetLocationId}`;
    const remainingBudget = itemBudgets.get(budgetKey) ?? 0;
    const inTransit = Boolean(!isReserved && transfer && remainingBudget > 0);
    const isSellable =
      !transfer &&
      !isReserved &&
      item.status === "AVAILABLE" &&
      item.location.isSellableDefault &&
      remainingBudget > 0;
    if (!isSellable && !inTransit) continue;
    itemBudgets.set(budgetKey, remainingBudget - 1);
    if (isSellable)
      rememberOldestStockDate(
        item.skuId,
        item.createdAt,
        item.locationId,
        inferMarketFromLocation(item.location)
      );

    const draft = ensureSkuDraft(item.skuId);
    if (!draft) continue;
    const variant = ensureVariantStats(draft, item.skuId);
    if (variant) variant.stockAgeSignals = stockAgeSignalsBySku.get(item.skuId) ?? [];
    const itemLocation = transfer?.shipment.toLocation ?? item.location;
    const catalog = catalogFieldsForSku(coverageSkuId(item.skuId));
    const unitImage = firstPhoto(item.photos) ?? catalog.imageUrl ?? item.sku.imageUrl;

    draft.itemUnits.push({
      id: item.id,
      skuId: item.skuId,
      conditionGrade: item.conditionGrade,
      locationId: itemLocation.id,
      locationName: itemLocation.name,
      locationRegion: itemLocation.region,
      fulfillableMarkets: transfer ? [] : fulfillmentMarketsForLocation(item.location),
      sellable: isSellable,
      inTransit,
      imageUrl: unitImage,
      status: item.status,
      photoCount: Array.isArray(item.photos) ? item.photos.length : 0,
      labelStatus: item.labelStatus,
    });

    draft.hasItemUnits = true;
    draft.sellableQty = draft.sellableLotQty + draft.sellableItemUnitCount;

    if (!draft.imageUrl && unitImage) {
      draft.imageUrl = unitImage;
    }
  }

  for (const listing of listings) {
    const sku = listing.sku ?? listing.itemUnit?.sku;
    if (!sku) continue;

    const draft = ensureSkuDraft(sku.id);
    if (!draft) continue;

    draft.listings.push(listing);
    ensureVariantStats(draft, sku.id);
  }

  // Sold-out demand must survive even if there is no stock or listing left.
  for (const skuId of new Set([...demandSignalsBySku.keys(), ...pendingPresaleLines.map((line) => line.skuId)])) {
    const draft = ensureSkuDraft(skuId);
    if (draft) ensureVariantStats(draft, skuId);
  }
  for (const skuId of incomingSignalsBySku.keys()) {
    const draft = ensureSkuDraft(skuId);
    if (draft) ensureVariantStats(draft, skuId);
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
    const fulfillmentMarkets = fulfillmentMarketsForStock(product.sellableLocations, primaryMarket);
    const targetPlatforms = corePlatforms.filter((platform) =>
      fulfillmentMarkets.some((market) => isPlatformTargetForMarket(platform, market))
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

    const variantRows = [...variantStats.values()]
      .map((variant) => ({
        ...variant,
        ...scopedVariantDecisions(variant, variant.sellableQty, variant.inTransitQty, { policy }),
      }))
      .sort((a, b) => b.sellableQty - a.sellableQty || a.skuName.localeCompare(b.skuName, "zh-CN"));
    const stockAges = variantRows
      .flatMap((variant) => variant.stockAgeSignals ?? [])
      .map((signal) => signal.oldestStockAgeDays);
    const stockingDecision = buildStockingDecision({
      sellableQty: product.sellableQty,
      inTransitQty: product.inTransitQty,
      sales30Qty: variantRows.reduce(
        (sum, variant) => sum + (variant.stockingDecision?.sales30Qty ?? 0),
        0
      ),
      sales90Qty: variantRows.reduce(
        (sum, variant) => sum + (variant.stockingDecision?.sales90Qty ?? 0),
        0
      ),
      oldestStockAgeDays: stockAges.length ? Math.max(...stockAges) : null,
      hasReferenceSignal:
        Boolean(product.referencePrice) ||
        records.some((record) => record.listedPrice || record.estimatedNet),
    });

    return {
      ...product,
      itemUnits: draftItemUnits,
      variantRows,
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
