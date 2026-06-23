import { prisma } from "@/lib/prisma";
import {
  CORE_SELLING_PLATFORM_CODES,
  isCoreSellingPlatform,
  sortCoreSellingPlatforms,
} from "@/lib/core-platforms";
import { getStoreStockBreakdown, type StockLocationBreakdown } from "@/lib/application/inventory";
import {
  parseSkuCatalogMeta,
  resolveCoverImageUrl,
  type CatalogStatus,
  type ProductKind,
} from "@/lib/application/sku-catalog";

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
  listingId: string;
  platformId: string;
  platformName: string;
  platformCode: string;
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
  /** 上架维度：批次 SKU 或中古单件 */
  listingScope: ListingCoverageProductType;
  itemUnitId: string | null;
  itemUnitLabel: string | null;
}

export interface SellableItemUnitRow {
  id: string;
  conditionGrade: string | null;
  locationName: string;
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
  inTransitQty: number;
  sellableLocations: StockLocationBreakdown[];
  inTransitLocations: StockLocationBreakdown[];
  itemUnits: SellableItemUnitRow[];
  newStockSummary: StockChannelSummary;
  itemUnitSummary: ItemUnitChannelSummary;
  hasLotStock: boolean;
  hasItemUnits: boolean;
  /** 仅已有上架记录，供可售库存页使用 */
  records: ListingRecord[];
  /** 全平台矩阵，供辅助页或筛选使用 */
  platforms: ListingCoveragePlatform[];
  aggregateRisks: ListingCoverageRisk[];
  latestListedAt: string | null;
  latestUpdatedAt: string | null;
  /** 主数据摘要（来自 SKU.attributes） */
  brand: string | null;
  category: string | null;
  productKind: ProductKind;
  referencePrice: string | null;
  referenceCurrency: string | null;
  catalogStatus: CatalogStatus;
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
  | "records"
  | "aggregateRisks"
  | "latestListedAt"
  | "latestUpdatedAt"
  | "newStockSummary"
  | "itemUnitSummary"
> & {
  listings: ListingRow[];
};

type ListingRow = Awaited<ReturnType<typeof getListingRows>>[number];
type StoreStockBreakdown = Awaited<ReturnType<typeof getStoreStockBreakdown>> extends Map<
  string,
  infer T
>
  ? T
  : never;

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
  if (listing.listingType === "SKU" && sellableQty === 0) {
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
            select: { name: true },
          },
        },
      },
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
  productSellableQty: number,
  itemUnitSellable: boolean
): ListingRecord {
  const scope: ListingCoverageProductType =
    listing.listingType === "ITEM_UNIT" ? "ITEM_UNIT" : "SKU";
  const qtyForRisk = scope === "ITEM_UNIT" ? (itemUnitSellable ? 1 : 0) : productSellableQty;

  return {
    listingId: listing.id,
    platformId: listing.platformId,
    platformName: listing.platform.name,
    platformCode: listing.platform.code,
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
    risks: buildRisks(listing, qtyForRisk),
    listingScope: scope,
    itemUnitId: listing.itemUnitId,
    itemUnitLabel: listing.itemUnit?.conditionGrade ?? null,
  };
}

function buildListedRecords(
  draftListings: ListingRow[],
  productSellableQty: number,
  sellableItemUnitIds: Set<string>
): ListingRecord[] {
  return draftListings
    .map((listing) =>
      listingRowToRecord(
        listing,
        productSellableQty,
        listing.itemUnitId ? sellableItemUnitIds.has(listing.itemUnitId) : false
      )
    )
    .sort((a, b) => {
      if (a.status === "ACTIVE" && b.status !== "ACTIVE") return -1;
      if (b.status === "ACTIVE" && a.status !== "ACTIVE") return 1;
      return new Date(b.listedAt).getTime() - new Date(a.listedAt).getTime();
    });
}

function skuDraftKey(skuId: string) {
  return productKey("SKU", skuId);
}

export async function getListingCoverageProducts(storeId: string) {
  const [platforms, listings, skus, itemUnits, stockBreakdown] = await Promise.all([
    prisma.platform.findMany({
      where: { storeId, code: { in: [...CORE_SELLING_PLATFORM_CODES] } },
      select: { id: true, name: true, code: true },
    }),
    getListingRows(storeId),
    prisma.sKU.findMany({
      where: { storeId },
      select: {
        id: true,
        parentSkuId: true,
        code: true,
        name: true,
        imageUrl: true,
        brand: true,
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
          select: { name: true, isSellableDefault: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    getStoreStockBreakdown(storeId),
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

  function catalogFieldsForSku(skuId: string) {
    const c = skuCatalogById.get(skuId);
    return {
      brand: c?.brand ?? null,
      category: c?.category ?? null,
      imageUrl: c?.imageUrl ?? null,
      productKind: c?.productKind ?? ("NEW" as ProductKind),
      referencePrice: c?.referencePrice ?? null,
      referenceCurrency: c?.referenceCurrency ?? null,
      catalogStatus: c?.catalogStatus ?? ("active" as CatalogStatus),
    };
  }

  const skuById = new Map(skus.map((sku) => [sku.id, sku]));

  function coverageSkuId(skuId: string) {
    return skuById.get(skuId)?.parentSkuId ?? skuId;
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

  function addStockBreakdown(draft: ProductDraft, breakdown: StoreStockBreakdown) {
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
  }

  function ensureSkuDraft(skuId: string) {
    const draftSkuId = coverageSkuId(skuId);
    const key = skuDraftKey(draftSkuId);
    let draft = drafts.get(key);
    if (draft) return draft;

    const sku = skuById.get(draftSkuId);
    if (!sku) return null;

    const catalog = catalogFieldsForSku(draftSkuId);
    draft = {
      key,
      listingType: "SKU",
      skuId: sku.id,
      itemUnitId: null,
      skuCode: sku.code,
      skuName: sku.name,
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

    addStockBreakdown(draft, breakdown);
  }

  for (const item of itemUnits) {
    const isSellable = item.status === "AVAILABLE" && item.location.isSellableDefault;
    const inTransit = item.status === "AVAILABLE" && !item.location.isSellableDefault;
    if (!isSellable && !inTransit) continue;

    const draft = ensureSkuDraft(item.skuId);
    if (!draft) continue;

    const catalog = catalogFieldsForSku(coverageSkuId(item.skuId));
    const unitImage = firstPhoto(item.photos) ?? catalog.imageUrl ?? item.sku.imageUrl;

    draft.itemUnits.push({
      id: item.id,
      conditionGrade: item.conditionGrade,
      locationName: item.location.name,
      sellable: isSellable,
      inTransit,
      imageUrl: unitImage,
      status: item.status,
      photoCount: Array.isArray(item.photos) ? item.photos.length : 0,
      labelStatus: item.labelStatus,
    });

    if (isSellable) {
      draft.sellableItemUnitCount += 1;
    } else if (inTransit) {
      draft.inTransitQty += 1;
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
    const { listings: draftListings, itemUnits: draftItemUnits, ...product } = draft;
    const sellableItemUnitIds = new Set(draftItemUnits.filter((u) => u.sellable).map((u) => u.id));
    const platformsWithState = corePlatforms.map((platform) => {
      const listing = newestListingForPlatform(draftListings, platform.id);
      const risks = listing ? buildRisks(listing, product.sellableQty) : [];
      return {
        id: platform.id,
        name: platform.name,
        code: platform.code,
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
    });

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

    const records = buildListedRecords(draftListings, product.sellableQty, sellableItemUnitIds);
    const activeSkuListingPlatformIds = new Set(
      records
        .filter((record) => record.listingScope === "SKU" && record.status === "ACTIVE")
        .map((record) => record.platformId)
    );
    const activeItemUnitListingCount = records.filter(
      (record) => record.listingScope === "ITEM_UNIT" && record.status === "ACTIVE"
    ).length;
    const activeListedItemUnitIds = new Set(
      records
        .filter(
          (record) =>
            record.listingScope === "ITEM_UNIT" &&
            record.status === "ACTIVE" &&
            record.itemUnitId
        )
        .map((record) => record.itemUnitId as string)
    );
    const sellableItemUnits = draftItemUnits.filter((unit) => unit.sellable);

    return {
      ...product,
      itemUnits: draftItemUnits,
      newStockSummary: {
        sellableQty: product.sellableLotQty,
        activeListingCount: activeSkuListingPlatformIds.size,
        pendingListingCount:
          product.sellableLotQty > 0
            ? Math.max(0, corePlatforms.length - activeSkuListingPlatformIds.size)
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
      records,
      platforms: platformsWithState,
      aggregateRisks: [...risks.values()],
      latestListedAt,
      latestUpdatedAt,
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
