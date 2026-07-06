import { prisma } from "@/lib/prisma";
import {
  getStoreStockBreakdown,
  type SkuStockBreakdown,
} from "@/lib/application/inventory";
import { deriveCatalogRole, type SkuCatalogRole } from "@/lib/application/sku-identity";
import Decimal from "decimal.js";

export type CatalogStatus = "active" | "disabled";
export type ProductKind = "NEW" | "USED";

export interface SkuCatalogImage {
  url: string;
  isCover?: boolean;
}

export interface SkuNewFields {
  isSealed?: boolean;
  packagingStatus?: string;
  barcode?: string;
  defaultPurchaseUnit?: string;
  defaultSaleUnit?: string;
}

export interface SkuUsedFields {
  defaultConditionGrade?: string;
  defectNotes?: string;
  hasBox?: boolean;
  hasManual?: boolean;
  inspected?: boolean;
  inspectionNotes?: string;
}

/** 结构化字段，存于 SKU.attributes 下保留键 */
export interface SkuCatalogMeta {
  catalogStatus: CatalogStatus;
  productKind: ProductKind;
  referencePrice?: string | null;
  referenceCost?: string | null;
  currency?: string | null;
  tags?: string[];
  series?: string | null;
  notes?: string | null;
  images?: SkuCatalogImage[];
  newFields?: SkuNewFields;
  usedFields?: SkuUsedFields;
}

const RESERVED_KEYS = new Set([
  "catalogStatus",
  "productKind",
  "referencePrice",
  "referenceCost",
  "currency",
  "tags",
  "series",
  "notes",
  "images",
  "newFields",
  "usedFields",
]);

const DEFAULT_META: SkuCatalogMeta = {
  catalogStatus: "active",
  productKind: "NEW",
};
const VALID_SALES_STATUSES = ["CONFIRMED", "SHIPPED", "DELIVERED"];

function aggregateStockMetrics(
  skuIds: string[],
  stockBreakdown: Map<string, SkuStockBreakdown>
) {
  return skuIds.reduce(
    (acc, skuId) => {
      const stock = stockBreakdown.get(skuId);
      if (!stock) return acc;
      return {
        sellableQty: acc.sellableQty.plus(stock.sellableQty),
        inTransitQty: acc.inTransitQty.plus(stock.inTransitQty),
      };
    },
    { sellableQty: new Decimal(0), inTransitQty: new Decimal(0) }
  );
}

function emptyStockBreakdown(skuId: string): SkuStockBreakdown {
  return {
    skuId,
    sellableQty: 0,
    inTransitQty: 0,
    sellableLotQty: 0,
    sellableItemUnitCount: 0,
    inTransitLotQty: 0,
    inTransitItemUnitCount: 0,
    sellableLocations: [],
    inTransitLocations: [],
  };
}

function aggregateSkuStockBreakdown(
  skuIds: string[],
  stockBreakdown: Map<string, SkuStockBreakdown>
): SkuStockBreakdown {
  const result = emptyStockBreakdown(skuIds[0] ?? "");
  const sellableLocations = new Map<string, SkuStockBreakdown["sellableLocations"][number]>();
  const inTransitLocations = new Map<string, SkuStockBreakdown["inTransitLocations"][number]>();

  const pushLocation = (
    target: Map<string, SkuStockBreakdown["sellableLocations"][number]>,
    location: SkuStockBreakdown["sellableLocations"][number]
  ) => {
    const existing = target.get(location.locationId);
    if (existing) {
      existing.qty += location.qty;
    } else {
      target.set(location.locationId, { ...location });
    }
  };

  for (const skuId of skuIds) {
    const stock = stockBreakdown.get(skuId);
    if (!stock) continue;
    result.sellableQty += stock.sellableQty;
    result.inTransitQty += stock.inTransitQty;
    result.sellableLotQty += stock.sellableLotQty;
    result.sellableItemUnitCount += stock.sellableItemUnitCount;
    result.inTransitLotQty += stock.inTransitLotQty;
    result.inTransitItemUnitCount += stock.inTransitItemUnitCount;
    stock.sellableLocations.forEach((location) =>
      pushLocation(sellableLocations, location)
    );
    stock.inTransitLocations.forEach((location) =>
      pushLocation(inTransitLocations, location)
    );
  }

  result.sellableLocations = [...sellableLocations.values()].sort(
    (a, b) => b.qty - a.qty
  );
  result.inTransitLocations = [...inTransitLocations.values()].sort(
    (a, b) => b.qty - a.qty
  );
  return result;
}

function countPhotos(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function pickVariantAttributes(raw: Record<string, unknown>) {
  const variant: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!RESERVED_KEYS.has(key)) {
      variant[key] = value;
    }
  }
  return variant;
}

export function parseSkuCatalogMeta(
  attributes: unknown,
  imageUrl?: string | null
): SkuCatalogMeta & { variantAttributes: Record<string, unknown> } {
  const raw = asRecord(attributes);
  const images = Array.isArray(raw.images)
    ? raw.images
        .filter((item) => item && typeof item === "object")
        .map((item) => {
          const row = item as Record<string, unknown>;
          const url = typeof row.url === "string" ? row.url : "";
          if (!url) return null;
          return {
            url,
            isCover: Boolean(row.isCover),
          } satisfies SkuCatalogImage;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
    : [];

  if (images.length === 0 && imageUrl) {
    images.push({ url: imageUrl, isCover: true });
  }

  const coverIndex = images.findIndex((img) => img.isCover);
  if (images.length > 0 && coverIndex < 0) {
    images[0] = { ...images[0], isCover: true };
  }

  const catalogStatus =
    raw.catalogStatus === "disabled" ? "disabled" : DEFAULT_META.catalogStatus;
  const productKind = raw.productKind === "USED" ? "USED" : "NEW";

  return {
    catalogStatus,
    productKind,
    referencePrice:
      typeof raw.referencePrice === "string" ? raw.referencePrice : null,
    referenceCost: typeof raw.referenceCost === "string" ? raw.referenceCost : null,
    currency: typeof raw.currency === "string" ? raw.currency : null,
    tags: Array.isArray(raw.tags)
      ? raw.tags.filter((t): t is string => typeof t === "string")
      : [],
    series: typeof raw.series === "string" ? raw.series : null,
    notes: typeof raw.notes === "string" ? raw.notes : null,
    images,
    newFields: asRecord(raw.newFields) as SkuNewFields,
    usedFields: asRecord(raw.usedFields) as SkuUsedFields,
    variantAttributes: pickVariantAttributes(raw),
  };
}

export function mergeSkuCatalogAttributes(
  existing: unknown,
  meta: Partial<SkuCatalogMeta>
): Record<string, unknown> {
  const parsed = parseSkuCatalogMeta(existing);
  const images =
    meta.images !== undefined
      ? meta.images
      : parsed.images?.map((img) => ({ ...img })) ?? [];

  const cover = images.find((img) => img.isCover) ?? images[0];
  if (cover) {
    for (const img of images) {
      img.isCover = img.url === cover.url;
    }
  }

  return {
    ...parsed.variantAttributes,
    catalogStatus: meta.catalogStatus ?? parsed.catalogStatus,
    productKind: meta.productKind ?? parsed.productKind,
    referencePrice: meta.referencePrice ?? parsed.referencePrice ?? undefined,
    referenceCost: meta.referenceCost ?? parsed.referenceCost ?? undefined,
    currency: meta.currency ?? parsed.currency ?? undefined,
    tags: meta.tags ?? parsed.tags,
    series: meta.series ?? parsed.series ?? undefined,
    notes: meta.notes ?? parsed.notes ?? undefined,
    images: images.length > 0 ? images : undefined,
    newFields: meta.newFields ?? parsed.newFields,
    usedFields: meta.usedFields ?? parsed.usedFields,
  };
}

export function resolveCoverImageUrl(meta: SkuCatalogMeta, fallback?: string | null) {
  const cover = meta.images?.find((img) => img.isCover) ?? meta.images?.[0];
  return cover?.url ?? fallback ?? null;
}

export interface SkuCatalogListItem {
  id: string;
  code: string;
  name: string;
  catalogRole: SkuCatalogRole;
  manufacturerCode: string | null;
  variantLabel: string | null;
  variantAxes: string[];
  variantValues: Record<string, string>;
  nameSource: string;
  codeSource: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  parentSkuId: string | null;
  variantCount: number;
  catalogStatus: CatalogStatus;
  productKind: ProductKind;
  referencePrice: string | null;
  currency: string | null;
  series: string | null;
  business: {
    sellableQty: string;
    inTransitQty: string;
    activeListingCount: number;
    latestSalePrice: string | null;
    averageSalePrice: string | null;
    salesCurrency: string | null;
    salesCount: number;
    salesAmount: string;
    lastSoldAt: string | null;
    averagePurchasePrice: string | null;
    purchaseCurrency: string | null;
    grossProfitPerUnit: string | null;
    grossMarginRate: string | null;
    primaryPlatformName: string | null;
    primaryPlatformCode: string | null;
  };
}

export interface SkuCatalogDetail extends SkuCatalogListItem {
  description: string | null;
  meta: SkuCatalogMeta;
  variantAttributes: Record<string, unknown>;
  parentSku: { id: string; code: string; name: string } | null;
  childSkus: Array<{ id: string; code: string; name: string }>;
  inventorySections: {
    newStockLots: Array<{
      id: string;
      skuId: string;
      skuCode: string;
      skuName: string;
      batchLabel: string | null;
      quantity: string;
      unitCost: string;
      costCurrency: string;
      locationId: string;
      locationCode: string;
      locationName: string;
      locationType: string;
      isSellableLocation: boolean;
      receivedAt: string;
      status: string;
    }>;
    itemUnitSummary: {
      totalCount: number;
      sellableCount: number;
      inTransitCount: number;
      pendingLabelCount: number;
      pendingPhotoCount: number;
    };
    itemUnits: Array<{
      id: string;
      skuId: string;
      skuCode: string;
      skuName: string;
      unitCode: string | null;
      labelCode: string | null;
      labelStatus: string;
      photoCount: number;
      locationId: string;
      locationCode: string;
      locationName: string;
      locationType: string;
      isSellableLocation: boolean;
      status: string;
    }>;
  };
  analysis: {
    inventoryDistribution: {
      sellableQty: string;
      sellableLotQty: string;
      sellableItemUnitCount: number;
      inTransitQty: string;
      inTransitLotQty: string;
      inTransitItemUnitCount: number;
      sellableLocations: Array<{
        locationId: string;
        code: string;
        name: string;
        type: string;
        qty: string;
      }>;
      inTransitLocations: Array<{
        locationId: string;
        code: string;
        name: string;
        type: string;
        qty: string;
      }>;
    };
    activeListings: Array<{
      id: string;
      listingType: string;
      skuId: string | null;
      skuCode: string | null;
      itemUnitId: string | null;
      unitCode: string | null;
      platformName: string;
      platformCode: string;
      listedPrice: string | null;
      currency: string | null;
      estimatedNet: string | null;
      listedAt: string;
    }>;
    platformPerformance: Array<{
      platformName: string;
      platformCode: string;
      salesCount: number;
      totalQty: string;
      totalAmount: string;
      averagePrice: string | null;
      currency: string;
      lastSoldAt: string;
    }>;
    profitOverview: {
      salesAmount: string;
      costMatchedSalesAmount: string;
      allocatedInventoryCost: string;
      grossProfit: string;
      profitRate: string;
      fulfilledLineCount: number;
      pendingCostLineCount: number;
      currency: string | null;
    };
    salesVelocity: {
      firstSoldAt: string | null;
      lastSoldAt: string | null;
      averageMonthlyQty: string;
      averageDaysBetweenSales: string | null;
    };
    priceHistory: Array<{
      date: string;
      salePrice: string | null;
      purchasePrice: string | null;
      currency: string | null;
    }>;
  };
  reference: {
    sellableLotQty: string;
    availableItemUnits: number;
    inTransitQty: string;
    activeListingCount: number;
    purchaseLineCount: number;
    salesLineCount: number;
    recentPurchaseLines: Array<{
      id: string;
      orderNo: string;
      quantity: string;
      unitPrice: string;
      lineAmount: string;
      currency: string;
      status: string;
      orderedAt: string | null;
    }>;
    recentSalesLines: Array<{
      id: string;
      orderNumber: string;
      quantity: string;
      unitPrice: string | null;
      lineAmount: string;
      currency: string;
      platformName: string | null;
      orderDate: string;
    }>;
  };
}

function stringArrayFromJson(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function stringRecordFromJson(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => [key.trim(), String(val ?? "").trim()] as const)
      .filter(([key, val]) => key && val)
  );
}

export async function getSkuCatalogList(storeId: string): Promise<SkuCatalogListItem[]> {
  const [skus, stockBreakdown, activeListings, salesLines, purchaseLines] = await Promise.all([
    prisma.sKU.findMany({
      where: { storeId },
      select: {
        id: true,
        code: true,
        name: true,
        catalogRole: true,
        manufacturerCode: true,
        variantLabel: true,
        variantAxes: true,
        variantValues: true,
        nameSource: true,
        codeSource: true,
        brand: true,
        category: true,
        imageUrl: true,
        parentSkuId: true,
        attributes: true,
        _count: { select: { childSkus: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    getStoreStockBreakdown(storeId),
    prisma.listing.findMany({
      where: { storeId, status: "ACTIVE" },
      select: {
        skuId: true,
        itemUnit: { select: { skuId: true } },
      },
    }),
    prisma.orderLine.findMany({
      where: {
        sku: { storeId },
        order: { orderStatus: { in: VALID_SALES_STATUSES } },
      },
      select: {
        skuId: true,
        quantity: true,
        lineAmount: true,
        order: {
          select: {
            orderDate: true,
            currency: true,
            platform: { select: { name: true, code: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.purchaseLine.findMany({
      where: { sku: { storeId } },
      select: {
        skuId: true,
        quantity: true,
        unitPrice: true,
        lineAmount: true,
        purchaseOrder: {
          select: {
            currency: true,
            status: true,
            orderedAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const activeListingsBySku = new Map<string, number>();
  for (const listing of activeListings) {
    const skuId = listing.skuId ?? listing.itemUnit?.skuId;
    if (!skuId) continue;
    activeListingsBySku.set(skuId, (activeListingsBySku.get(skuId) ?? 0) + 1);
  }
  const salesBySku = new Map<string, typeof salesLines>();
  for (const line of salesLines) {
    const bucket = salesBySku.get(line.skuId) ?? [];
    bucket.push(line);
    salesBySku.set(line.skuId, bucket);
  }
  const purchasesBySku = new Map<string, typeof purchaseLines>();
  for (const line of purchaseLines) {
    const bucket = purchasesBySku.get(line.skuId) ?? [];
    bucket.push(line);
    purchasesBySku.set(line.skuId, bucket);
  }
  const childSkuIdsByParent = new Map<string, string[]>();
  for (const sku of skus) {
    if (!sku.parentSkuId) continue;
    const childIds = childSkuIdsByParent.get(sku.parentSkuId) ?? [];
    childIds.push(sku.id);
    childSkuIdsByParent.set(sku.parentSkuId, childIds);
  }

  return skus.map((sku) => {
    const meta = parseSkuCatalogMeta(sku.attributes, sku.imageUrl);
    const childSkuIds = childSkuIdsByParent.get(sku.id) ?? [];
    const catalogRole = deriveCatalogRole({
      catalogRole: sku.catalogRole,
      parentSkuId: sku.parentSkuId,
      childCount: childSkuIds.length,
    });
    const metricSkuIds = catalogRole === "GROUP" ? childSkuIds : [sku.id];
    const stockMetrics = aggregateStockMetrics(metricSkuIds, stockBreakdown);
    const activeListingCount = metricSkuIds.reduce(
      (sum, skuId) => sum + (activeListingsBySku.get(skuId) ?? 0),
      0
    );
    const sales = metricSkuIds.flatMap((skuId) => salesBySku.get(skuId) ?? []);
    const salesMetrics = computeSkuListSalesMetrics(sales);
    const purchaseMetrics = computeSkuPurchaseMetrics(
      metricSkuIds.flatMap((skuId) => purchasesBySku.get(skuId) ?? [])
    );
    const marginMetrics = computeSkuMarginMetrics(salesMetrics, purchaseMetrics);
    return {
      id: sku.id,
      code: sku.code,
      name: sku.name,
      catalogRole,
      manufacturerCode: sku.manufacturerCode,
      variantLabel: sku.variantLabel,
      variantAxes: stringArrayFromJson(sku.variantAxes),
      variantValues: stringRecordFromJson(sku.variantValues),
      nameSource: sku.nameSource,
      codeSource: sku.codeSource,
      brand: sku.brand,
      category: sku.category,
      imageUrl: resolveCoverImageUrl(meta, sku.imageUrl),
      parentSkuId: sku.parentSkuId,
      variantCount: sku._count.childSkus,
      catalogStatus: meta.catalogStatus,
      productKind: meta.productKind,
      referencePrice: meta.referencePrice ?? null,
      currency: meta.currency ?? null,
      series: meta.series ?? null,
      business: {
        sellableQty: stockMetrics.sellableQty.toString(),
        inTransitQty: stockMetrics.inTransitQty.toString(),
        activeListingCount,
        ...salesMetrics,
        ...purchaseMetrics,
        ...marginMetrics,
      },
    };
  });
}

function computeSkuPurchaseMetrics(
  lines: Array<{
    quantity: { toString(): string };
    lineAmount: { toString(): string };
    purchaseOrder: {
      currency: string;
      status?: string | null;
      orderedAt?: Date | null;
      createdAt?: Date | null;
    };
  }>
) {
  const validLines = lines.filter(
    (line) => !String(line.purchaseOrder.status ?? "").toUpperCase().includes("CANCEL")
  );
  if (validLines.length === 0) {
    return {
      averagePurchasePrice: null,
      purchaseCurrency: null,
    };
  }

  let totalQty = new Decimal(0);
  let totalAmount = new Decimal(0);
  const sorted = [...validLines].sort((a, b) => {
    const aDate = a.purchaseOrder.orderedAt ?? a.purchaseOrder.createdAt;
    const bDate = b.purchaseOrder.orderedAt ?? b.purchaseOrder.createdAt;
    return (bDate?.getTime() ?? 0) - (aDate?.getTime() ?? 0);
  });

  for (const line of validLines) {
    totalQty = totalQty.plus(new Decimal(line.quantity.toString()));
    totalAmount = totalAmount.plus(new Decimal(line.lineAmount.toString()));
  }

  return {
    averagePurchasePrice: totalQty.gt(0) ? totalAmount.div(totalQty).toFixed(2) : null,
    purchaseCurrency: sorted[0]?.purchaseOrder.currency ?? null,
  };
}

function computeSkuMarginMetrics(
  sales: Pick<
    ReturnType<typeof computeSkuListSalesMetrics>,
    "averageSalePrice" | "salesCurrency"
  >,
  purchase: ReturnType<typeof computeSkuPurchaseMetrics>
) {
  const saleCurrency = sales.salesCurrency;
  const purchaseCurrency = purchase.purchaseCurrency;
  const compatibleCurrency =
    !saleCurrency || !purchaseCurrency || saleCurrency === purchaseCurrency;

  if (!sales.averageSalePrice || !purchase.averagePurchasePrice || !compatibleCurrency) {
    return {
      grossProfitPerUnit: null,
      grossMarginRate: null,
    };
  }

  const averageSale = new Decimal(sales.averageSalePrice);
  const averagePurchase = new Decimal(purchase.averagePurchasePrice);
  const grossProfit = averageSale.minus(averagePurchase);

  return {
    grossProfitPerUnit: grossProfit.toFixed(2),
    grossMarginRate: averageSale.gt(0)
      ? grossProfit.div(averageSale).mul(100).toFixed(1)
      : null,
  };
}

function computeSkuListSalesMetrics(
  lines: Array<{
    quantity: { toString(): string };
    lineAmount: { toString(): string };
    order: {
      orderDate: Date;
      currency: string;
      platform: { name: string; code: string } | null;
    };
  }>
) {
  if (lines.length === 0) {
    return {
      latestSalePrice: null,
      averageSalePrice: null,
      salesCurrency: null,
      salesCount: 0,
      salesAmount: "0.00",
      lastSoldAt: null,
      primaryPlatformName: null,
      primaryPlatformCode: null,
    };
  }

  let totalQty = new Decimal(0);
  let totalAmount = new Decimal(0);
  const platformCounts = new Map<string, { name: string; code: string; count: number }>();
  const sorted = [...lines].sort(
    (a, b) => b.order.orderDate.getTime() - a.order.orderDate.getTime()
  );

  for (const line of lines) {
    const qty = new Decimal(line.quantity.toString());
    totalQty = totalQty.plus(qty);
    totalAmount = totalAmount.plus(new Decimal(line.lineAmount.toString()));
    const platform = line.order.platform;
    if (platform) {
      const key = platform.code;
      const current = platformCounts.get(key) ?? {
        name: platform.name,
        code: platform.code,
        count: 0,
      };
      current.count += 1;
      platformCounts.set(key, current);
    }
  }

  const latest = sorted[0];
  const latestQty = new Decimal(latest.quantity.toString());
  const latestSalePrice = latestQty.gt(0)
    ? new Decimal(latest.lineAmount.toString()).div(latestQty).toFixed(2)
    : null;
  const primaryPlatform =
    [...platformCounts.values()].sort((a, b) => b.count - a.count)[0] ?? null;

  return {
    latestSalePrice,
    averageSalePrice: totalQty.gt(0) ? totalAmount.div(totalQty).toFixed(2) : null,
    salesCurrency: latest.order.currency,
    salesCount: lines.length,
    salesAmount: totalAmount.toFixed(2),
    lastSoldAt: latest.order.orderDate.toISOString(),
    primaryPlatformName: primaryPlatform?.name ?? null,
    primaryPlatformCode: primaryPlatform?.code ?? null,
  };
}

export async function getSkuCatalogDetail(id: string): Promise<SkuCatalogDetail | null> {
  const sku = await prisma.sKU.findUnique({
    where: { id },
    include: {
      parentSku: { select: { id: true, code: true, name: true } },
      childSkus: {
        select: { id: true, code: true, name: true },
        orderBy: { code: "asc" },
      },
    },
  });

  if (!sku) return null;

  const catalogRole = deriveCatalogRole({
    catalogRole: sku.catalogRole,
    parentSkuId: sku.parentSkuId,
    childCount: sku.childSkus.length,
  });
  const metricSkuIds =
    catalogRole === "GROUP" ? sku.childSkus.map((child) => child.id) : [sku.id];
  const metricSkuIdSet = new Set(metricSkuIds);

  const [
    storeStockBreakdown,
    salesLines,
    activeListings,
    purchaseLines,
    purchaseLineCount,
    allPurchaseLines,
    inventoryLots,
    lotAggregates,
    itemUnits,
  ] = await Promise.all([
    getStoreStockBreakdown(sku.storeId),
    prisma.orderLine.findMany({
      where: {
        skuId: { in: metricSkuIds },
        order: { orderStatus: { in: VALID_SALES_STATUSES } },
      },
      include: {
        allocations: { select: { costAmount: true } },
        order: {
          select: {
            orderNumber: true,
            orderDate: true,
            currency: true,
            platform: { select: { name: true, code: true } },
          },
        },
      },
      orderBy: [{ order: { orderDate: "desc" } }, { createdAt: "desc" }],
    }),
    prisma.listing.findMany({
      where: {
        storeId: sku.storeId,
        status: "ACTIVE",
        OR: [
          { skuId: { in: metricSkuIds } },
          { itemUnit: { skuId: { in: metricSkuIds } } },
        ],
      },
      orderBy: { listedAt: "desc" },
      include: {
        platform: { select: { name: true, code: true } },
        sku: { select: { id: true, code: true } },
        itemUnit: { select: { id: true, unitCode: true, skuId: true, sku: { select: { code: true } } } },
      },
    }),
    prisma.purchaseLine.findMany({
      where: { skuId: { in: metricSkuIds } },
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        purchaseOrder: {
          select: {
            orderNo: true,
            currency: true,
            status: true,
            orderedAt: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.purchaseLine.count({ where: { skuId: { in: metricSkuIds } } }),
    prisma.purchaseLine.findMany({
      where: { skuId: { in: metricSkuIds } },
      orderBy: { createdAt: "desc" },
      include: {
        purchaseOrder: {
          select: {
            currency: true,
            status: true,
            orderedAt: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.inventoryLot.findMany({
      where: { storeId: sku.storeId, skuId: { in: metricSkuIds }, status: "ACTIVE" },
      orderBy: { receivedAt: "desc" },
      include: {
        sku: { select: { code: true, name: true } },
        location: true,
      },
    }),
    prisma.stockLedger.groupBy({
      by: ["entityId"],
      where: { storeId: sku.storeId, entityType: "LOT" },
      _sum: { deltaQty: true },
    }),
    prisma.itemUnit.findMany({
      where: { storeId: sku.storeId, skuId: { in: metricSkuIds } },
      orderBy: { createdAt: "desc" },
      include: {
        sku: { select: { code: true, name: true } },
        location: true,
      },
    }),
  ]);
  const stockBreakdown = aggregateSkuStockBreakdown(metricSkuIds, storeStockBreakdown);
  const parsed = parseSkuCatalogMeta(sku.attributes, sku.imageUrl);
  const salesMetrics = computeSkuListSalesMetrics(salesLines);
  const purchaseMetrics = computeSkuPurchaseMetrics(allPurchaseLines);
  const marginMetrics = computeSkuMarginMetrics(salesMetrics, purchaseMetrics);
  const analysis = buildSkuDetailAnalysis({
    stockBreakdown,
    listings: activeListings,
    salesLines,
    purchaseLines: allPurchaseLines,
  });
  const lotQtyById = new Map(
    lotAggregates.map((aggregate) => [
      aggregate.entityId,
      new Decimal(aggregate._sum.deltaQty?.toString() ?? "0"),
    ])
  );
  const inventorySections = buildSkuInventorySections({
    lots: inventoryLots.filter((lot) => metricSkuIdSet.has(lot.skuId)),
    lotQtyById,
    itemUnits,
  });

  return {
    id: sku.id,
    code: sku.code,
    name: sku.name,
    catalogRole,
    manufacturerCode: sku.manufacturerCode,
    variantLabel: sku.variantLabel,
    variantAxes: stringArrayFromJson(sku.variantAxes),
    variantValues: stringRecordFromJson(sku.variantValues),
    nameSource: sku.nameSource,
    codeSource: sku.codeSource,
    brand: sku.brand,
    category: sku.category,
    imageUrl: resolveCoverImageUrl(parsed, sku.imageUrl),
    parentSkuId: sku.parentSkuId,
    variantCount: sku.childSkus.length,
    catalogStatus: parsed.catalogStatus,
    productKind: parsed.productKind,
    referencePrice: parsed.referencePrice ?? null,
    currency: parsed.currency ?? null,
    series: parsed.series ?? null,
    business: {
      sellableQty: stockBreakdown.sellableQty.toString(),
      inTransitQty: stockBreakdown.inTransitQty.toString(),
      activeListingCount: activeListings.length,
      ...salesMetrics,
      ...purchaseMetrics,
      ...marginMetrics,
    },
    description: sku.description,
    meta: parsed,
    variantAttributes: parsed.variantAttributes,
    parentSku: sku.parentSku,
    childSkus: sku.childSkus,
    inventorySections,
    reference: {
      sellableLotQty: stockBreakdown.sellableLotQty.toString(),
      availableItemUnits: stockBreakdown.sellableItemUnitCount,
      inTransitQty: stockBreakdown.inTransitQty.toString(),
      activeListingCount: activeListings.length,
      purchaseLineCount,
      salesLineCount: salesLines.length,
      recentPurchaseLines: purchaseLines.map((line) => ({
        id: line.id,
        orderNo: line.purchaseOrder.orderNo,
        quantity: line.quantity.toString(),
        unitPrice: line.unitPrice.toString(),
        lineAmount: line.lineAmount.toString(),
        currency: line.purchaseOrder.currency,
        status: line.purchaseOrder.status,
        orderedAt:
          (line.purchaseOrder.orderedAt ?? line.purchaseOrder.createdAt)?.toISOString() ??
          null,
      })),
      recentSalesLines: salesLines.slice(0, 5).map((line) => ({
        id: line.id,
        orderNumber: line.order.orderNumber,
        quantity: line.quantity.toString(),
        unitPrice: line.unitPrice?.toString() ?? null,
        lineAmount: line.lineAmount.toString(),
        currency: line.order.currency,
        platformName: line.order.platform?.name ?? null,
        orderDate: line.order.orderDate.toISOString(),
      })),
    },
    analysis,
  };
}

function buildSkuInventorySections(input: {
  lots: Array<{
    id: string;
    skuId: string;
    batchLabel: string | null;
    unitCost: { toString(): string };
    costCurrency: string;
    receivedAt: Date;
    status: string;
    sku: { code: string; name: string };
    locationId: string;
    location: {
      code: string;
      name: string;
      type: string;
      isSellableDefault: boolean;
    };
  }>;
  lotQtyById: Map<string, Decimal>;
  itemUnits: Array<{
    id: string;
    skuId: string;
    unitCode: string | null;
    labelCode: string | null;
    labelStatus: string;
    photos: unknown;
    status: string;
    sku: { code: string; name: string };
    locationId: string;
    location: {
      code: string;
      name: string;
      type: string;
      isSellableDefault: boolean;
    };
  }>;
}): SkuCatalogDetail["inventorySections"] {
  const newStockLots = input.lots
    .map((lot) => ({
      id: lot.id,
      skuId: lot.skuId,
      skuCode: lot.sku.code,
      skuName: lot.sku.name,
      batchLabel: lot.batchLabel,
      quantity: (input.lotQtyById.get(lot.id) ?? new Decimal(0)).toString(),
      unitCost: lot.unitCost.toString(),
      costCurrency: lot.costCurrency,
      locationId: lot.locationId,
      locationCode: lot.location.code,
      locationName: lot.location.name,
      locationType: lot.location.type,
      isSellableLocation: lot.location.isSellableDefault,
      receivedAt: lot.receivedAt.toISOString(),
      status: lot.status,
    }))
    .filter((lot) => new Decimal(lot.quantity).gt(0));

  const itemUnits = input.itemUnits.map((unit) => ({
    id: unit.id,
    skuId: unit.skuId,
    skuCode: unit.sku.code,
    skuName: unit.sku.name,
    unitCode: unit.unitCode,
    labelCode: unit.labelCode,
    labelStatus: unit.labelStatus,
    photoCount: countPhotos(unit.photos),
    locationId: unit.locationId,
    locationCode: unit.location.code,
    locationName: unit.location.name,
    locationType: unit.location.type,
    isSellableLocation: unit.location.isSellableDefault,
    status: unit.status,
  }));

  return {
    newStockLots,
    itemUnitSummary: {
      totalCount: itemUnits.length,
      sellableCount: itemUnits.filter(
        (unit) => unit.status === "AVAILABLE" && unit.isSellableLocation
      ).length,
      inTransitCount: itemUnits.filter(
        (unit) => unit.status === "AVAILABLE" && !unit.isSellableLocation
      ).length,
      pendingLabelCount: itemUnits.filter(
        (unit) => unit.status === "AVAILABLE" && unit.labelStatus !== "ATTACHED"
      ).length,
      pendingPhotoCount: itemUnits.filter(
        (unit) => unit.status === "AVAILABLE" && unit.photoCount === 0
      ).length,
    },
    itemUnits,
  };
}

function buildSkuDetailAnalysis(input: {
  stockBreakdown: SkuStockBreakdown;
  listings: Array<{
    id: string;
    listingType: string;
    skuId: string | null;
    listedPrice: { toString(): string } | null;
    currency: string | null;
    estimatedNet: { toString(): string } | null;
    listedAt: Date;
    platform: { name: string; code: string };
    sku: { id: string; code: string } | null;
    itemUnit: {
      id: string;
      unitCode: string | null;
      skuId: string;
      sku: { code: string };
    } | null;
  }>;
  salesLines: Array<{
    id: string;
    quantity: { toString(): string };
    unitPrice: { toString(): string } | null;
    lineAmount: { toString(): string };
    allocations: Array<{ costAmount: { toString(): string } }>;
    order: {
      orderDate: Date;
      currency: string;
      platform: { name: string; code: string } | null;
    };
  }>;
  purchaseLines: Array<{
    quantity: { toString(): string };
    unitPrice: { toString(): string };
    lineAmount: { toString(): string };
    purchaseOrder: {
      currency: string;
      status: string;
      orderedAt: Date | null;
      createdAt: Date;
    };
  }>;
}): SkuCatalogDetail["analysis"] {
  const platformBuckets = new Map<
    string,
    {
      platformName: string;
      platformCode: string;
      salesCount: number;
      totalQty: Decimal;
      totalAmount: Decimal;
      currency: string;
      lastSoldAt: Date;
    }
  >();

  let salesAmount = new Decimal(0);
  let costMatchedSalesAmount = new Decimal(0);
  let allocatedInventoryCost = new Decimal(0);
  let fulfilledLineCount = 0;
  let pendingCostLineCount = 0;
  let profitCurrency: string | null = null;

  for (const line of input.salesLines) {
    const qty = new Decimal(line.quantity.toString());
    const amount = new Decimal(line.lineAmount.toString());
    const allocationCost = line.allocations.reduce(
      (sum, allocation) => sum.plus(new Decimal(allocation.costAmount.toString())),
      new Decimal(0)
    );
    const platform = line.order.platform ?? { name: "未记录平台", code: "UNKNOWN" };
    const current = platformBuckets.get(platform.code) ?? {
      platformName: platform.name,
      platformCode: platform.code,
      salesCount: 0,
      totalQty: new Decimal(0),
      totalAmount: new Decimal(0),
      currency: line.order.currency,
      lastSoldAt: line.order.orderDate,
    };
    current.salesCount += 1;
    current.totalQty = current.totalQty.plus(qty);
    current.totalAmount = current.totalAmount.plus(amount);
    if (line.order.orderDate > current.lastSoldAt) {
      current.lastSoldAt = line.order.orderDate;
      current.currency = line.order.currency;
    }
    platformBuckets.set(platform.code, current);

    salesAmount = salesAmount.plus(amount);
    if (!profitCurrency) profitCurrency = line.order.currency;
    if (allocationCost.gt(0)) {
      fulfilledLineCount += 1;
      costMatchedSalesAmount = costMatchedSalesAmount.plus(amount);
      allocatedInventoryCost = allocatedInventoryCost.plus(allocationCost);
    } else {
      pendingCostLineCount += 1;
    }
  }

  const grossProfit = costMatchedSalesAmount.minus(allocatedInventoryCost);
  const profitRate = costMatchedSalesAmount.gt(0)
    ? grossProfit.div(costMatchedSalesAmount).mul(100).toFixed(1)
    : "0.0";

  return {
    inventoryDistribution: {
      sellableQty: input.stockBreakdown.sellableQty.toString(),
      sellableLotQty: input.stockBreakdown.sellableLotQty.toString(),
      sellableItemUnitCount: input.stockBreakdown.sellableItemUnitCount,
      inTransitQty: input.stockBreakdown.inTransitQty.toString(),
      inTransitLotQty: input.stockBreakdown.inTransitLotQty.toString(),
      inTransitItemUnitCount: input.stockBreakdown.inTransitItemUnitCount,
      sellableLocations: input.stockBreakdown.sellableLocations.map((location) => ({
        ...location,
        qty: location.qty.toString(),
      })),
      inTransitLocations: input.stockBreakdown.inTransitLocations.map((location) => ({
        ...location,
        qty: location.qty.toString(),
      })),
    },
    activeListings: input.listings.map((listing) => ({
      id: listing.id,
      listingType: listing.listingType,
      skuId: listing.skuId ?? listing.itemUnit?.skuId ?? null,
      skuCode: listing.sku?.code ?? listing.itemUnit?.sku.code ?? null,
      itemUnitId: listing.itemUnit?.id ?? null,
      unitCode: listing.itemUnit?.unitCode ?? null,
      platformName: listing.platform.name,
      platformCode: listing.platform.code,
      listedPrice: listing.listedPrice?.toString() ?? null,
      currency: listing.currency,
      estimatedNet: listing.estimatedNet?.toString() ?? null,
      listedAt: listing.listedAt.toISOString(),
    })),
    platformPerformance: [...platformBuckets.values()]
      .sort((a, b) => b.salesCount - a.salesCount)
      .map((platform) => ({
        platformName: platform.platformName,
        platformCode: platform.platformCode,
        salesCount: platform.salesCount,
        totalQty: platform.totalQty.toString(),
        totalAmount: platform.totalAmount.toFixed(2),
        averagePrice: platform.totalQty.gt(0)
          ? platform.totalAmount.div(platform.totalQty).toFixed(2)
          : null,
        currency: platform.currency,
        lastSoldAt: platform.lastSoldAt.toISOString(),
      })),
    profitOverview: {
      salesAmount: salesAmount.toFixed(2),
      costMatchedSalesAmount: costMatchedSalesAmount.toFixed(2),
      allocatedInventoryCost: allocatedInventoryCost.toFixed(2),
      grossProfit: grossProfit.toFixed(2),
      profitRate,
      fulfilledLineCount,
      pendingCostLineCount,
      currency: profitCurrency,
    },
    salesVelocity: buildSalesVelocity(input.salesLines),
    priceHistory: buildSkuPriceHistory(input.salesLines, input.purchaseLines),
  };
}

function buildSalesVelocity(
  lines: Array<{
    quantity: { toString(): string };
    order: { orderDate: Date };
  }>
): SkuCatalogDetail["analysis"]["salesVelocity"] {
  if (lines.length === 0) {
    return {
      firstSoldAt: null,
      lastSoldAt: null,
      averageMonthlyQty: "0.00",
      averageDaysBetweenSales: null,
    };
  }

  const sorted = [...lines].sort(
    (a, b) => a.order.orderDate.getTime() - b.order.orderDate.getTime()
  );
  const first = sorted[0].order.orderDate;
  const last = sorted[sorted.length - 1].order.orderDate;
  const totalQty = sorted.reduce(
    (sum, line) => sum.plus(new Decimal(line.quantity.toString())),
    new Decimal(0)
  );
  const activeDays = Math.max(
    1,
    Math.ceil((last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24)) + 1
  );
  const averageMonthlyQty = totalQty.div(new Decimal(activeDays).div(30)).toFixed(2);
  const averageDaysBetweenSales =
    sorted.length > 1
      ? new Decimal(activeDays - 1).div(sorted.length - 1).toFixed(1)
      : null;

  return {
    firstSoldAt: first.toISOString(),
    lastSoldAt: last.toISOString(),
    averageMonthlyQty,
    averageDaysBetweenSales,
  };
}

function buildSkuPriceHistory(
  salesLines: Array<{
    quantity: { toString(): string };
    unitPrice: { toString(): string } | null;
    lineAmount: { toString(): string };
    order: { orderDate: Date; currency: string };
  }>,
  purchaseLines: Array<{
    quantity: { toString(): string };
    unitPrice: { toString(): string };
    lineAmount: { toString(): string };
    purchaseOrder: {
      currency: string;
      status: string;
      orderedAt: Date | null;
      createdAt: Date;
    };
  }>
): SkuCatalogDetail["analysis"]["priceHistory"] {
  const buckets = new Map<
    string,
    {
      date: string;
      saleAmount: Decimal;
      saleQty: Decimal;
      purchaseAmount: Decimal;
      purchaseQty: Decimal;
      currency: string | null;
    }
  >();

  const getBucket = (date: Date) => {
    const key = date.toISOString().slice(0, 10);
    const bucket = buckets.get(key) ?? {
      date: key,
      saleAmount: new Decimal(0),
      saleQty: new Decimal(0),
      purchaseAmount: new Decimal(0),
      purchaseQty: new Decimal(0),
      currency: null,
    };
    buckets.set(key, bucket);
    return bucket;
  };

  for (const line of salesLines) {
    const qty = new Decimal(line.quantity.toString());
    const amount = line.unitPrice
      ? new Decimal(line.unitPrice.toString()).mul(qty)
      : new Decimal(line.lineAmount.toString());
    const bucket = getBucket(line.order.orderDate);
    bucket.saleAmount = bucket.saleAmount.plus(amount);
    bucket.saleQty = bucket.saleQty.plus(qty);
    bucket.currency = bucket.currency ?? line.order.currency;
  }

  for (const line of purchaseLines) {
    if (String(line.purchaseOrder.status ?? "").toUpperCase().includes("CANCEL")) {
      continue;
    }
    const qty = new Decimal(line.quantity.toString());
    const amount = line.unitPrice
      ? new Decimal(line.unitPrice.toString()).mul(qty)
      : new Decimal(line.lineAmount.toString());
    const bucket = getBucket(line.purchaseOrder.orderedAt ?? line.purchaseOrder.createdAt);
    bucket.purchaseAmount = bucket.purchaseAmount.plus(amount);
    bucket.purchaseQty = bucket.purchaseQty.plus(qty);
    bucket.currency = bucket.currency ?? line.purchaseOrder.currency;
  }

  return [...buckets.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((bucket) => ({
      date: bucket.date,
      salePrice: bucket.saleQty.gt(0)
        ? bucket.saleAmount.div(bucket.saleQty).toFixed(2)
        : null,
      purchasePrice: bucket.purchaseQty.gt(0)
        ? bucket.purchaseAmount.div(bucket.purchaseQty).toFixed(2)
        : null,
      currency: bucket.currency,
    }));
}

export function productKindLabel(kind: ProductKind) {
  return kind === "USED" ? "中古" : "全新";
}

export function catalogStatusLabel(status: CatalogStatus) {
  return status === "disabled" ? "已停用" : "启用";
}
