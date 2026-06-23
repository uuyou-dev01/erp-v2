import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import {
  CORE_SELLING_PLATFORM_CODES,
  isCoreSellingPlatform,
  requiresSellableStockForListing,
  sortCoreSellingPlatforms,
} from "@/lib/core-platforms";
import { getStoreStockBreakdown, type StockLocationBreakdown } from "@/lib/application/inventory";

const CONFIRMED_SALES_STATUSES = ["CONFIRMED", "SHIPPED", "DELIVERED"];

export type ListingPendingItemType = "SKU" | "ITEM_UNIT";

export interface ListingPendingPlatform {
  id: string;
  name: string;
  code: string;
}

export interface ListingPendingItem {
  id: string;
  type: ListingPendingItemType;
  skuId: string;
  itemUnitId?: string;
  skuCode: string;
  skuName: string;
  imageUrl: string | null;
  waitingSince: string;
  conditionGrade?: string | null;
  locationName?: string | null;
  sellableQty: number;
  inTransitQty: number;
  sellableLocations: StockLocationBreakdown[];
  inTransitLocations: StockLocationBreakdown[];
  activePlatforms: ListingPendingPlatform[];
  availablePlatforms: ListingPendingPlatform[];
  suggestedPrice: string | null;
  suggestedCurrency: string | null;
}

type ReferencePrice = {
  price: Decimal;
  currency: string | null;
};

async function getReferencePricesBySku(skuIds: string[]) {
  const [latestSaleLines, latestListings] = await Promise.all([
    prisma.orderLine.findMany({
      where: {
        skuId: { in: skuIds },
        order: {
          orderStatus: {
            in: CONFIRMED_SALES_STATUSES,
          },
        },
      },
      include: {
        order: {
          select: {
            currency: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.listing.findMany({
      where: {
        skuId: { in: skuIds },
        status: "ACTIVE",
        listedPrice: {
          not: null,
        },
      },
      select: {
        skuId: true,
        listedPrice: true,
        currency: true,
        listedAt: true,
      },
      orderBy: { listedAt: "desc" },
    }),
  ]);

  const prices = new Map<string, ReferencePrice>();

  for (const line of latestSaleLines) {
    if (!line.skuId || prices.has(line.skuId)) continue;

    const quantity = new Decimal(line.quantity.toString());
    if (quantity.lte(0)) continue;

    prices.set(line.skuId, {
      price: new Decimal(line.lineAmount.toString()).div(quantity),
      currency: line.order.currency,
    });
  }

  for (const listing of latestListings) {
    if (!listing.skuId || prices.has(listing.skuId) || !listing.listedPrice) continue;

    prices.set(listing.skuId, {
      price: new Decimal(listing.listedPrice.toString()),
      currency: listing.currency,
    });
  }

  return prices;
}

function firstPhoto(value: unknown) {
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return null;
}

function formatReferencePrice(reference: ReferencePrice | undefined) {
  return reference?.price.toFixed(2) ?? null;
}

function eligiblePlatforms<T extends { code: string }>(
  platforms: T[],
  hasSellableStock: boolean,
) {
  return sortCoreSellingPlatforms(platforms).filter(
    (platform) =>
      hasSellableStock || !requiresSellableStockForListing(platform.code),
  );
}

export async function getListingPendingItems(storeId: string) {
  const [platforms, skus, itemUnits, stockBreakdown] = await Promise.all([
    prisma.platform.findMany({
      where: { storeId, code: { in: [...CORE_SELLING_PLATFORM_CODES] } },
      select: { id: true, name: true, code: true },
    }),
    prisma.sKU.findMany({
      where: { storeId },
      select: {
        id: true,
        code: true,
        name: true,
        imageUrl: true,
        updatedAt: true,
        listings: {
          where: { status: "ACTIVE", itemUnitId: null },
          include: {
            platform: {
              select: { id: true, name: true, code: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.itemUnit.findMany({
      where: { storeId, status: "AVAILABLE" },
      select: {
        id: true,
        skuId: true,
        updatedAt: true,
        conditionGrade: true,
        photos: true,
        location: {
          select: {
            name: true,
            isSellableDefault: true,
          },
        },
        sku: {
          select: {
            id: true,
            code: true,
            name: true,
            imageUrl: true,
          },
        },
        listings: {
          where: { status: "ACTIVE" },
          include: {
            platform: {
              select: { id: true, name: true, code: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    getStoreStockBreakdown(storeId),
  ]);

  const referencePrices = await getReferencePricesBySku([
    ...new Set([...skus.map((sku) => sku.id), ...itemUnits.map((item) => item.skuId)]),
  ]);

  const skuItems: ListingPendingItem[] = skus
    .map((sku) => {
      const activePlatformIds = new Set(
        sku.listings
          .filter((listing) => isCoreSellingPlatform(listing.platform.code))
          .map((listing) => listing.platformId)
      );
      const activePlatforms = sku.listings
        .filter((listing) => isCoreSellingPlatform(listing.platform.code))
        .map((listing) => listing.platform);
      const breakdown = stockBreakdown.get(sku.id);
      const sellableQty = breakdown?.sellableQty ?? 0;
      const inTransitQty = breakdown?.inTransitQty ?? 0;
      const availablePlatforms = eligiblePlatforms(platforms, sellableQty > 0).filter(
        (platform) => !activePlatformIds.has(platform.id)
      );
      const reference = referencePrices.get(sku.id);

      return {
        id: `sku-${sku.id}`,
        type: "SKU" as const,
        skuId: sku.id,
        skuCode: sku.code,
        skuName: sku.name,
        imageUrl: sku.imageUrl,
        waitingSince: sku.updatedAt.toISOString(),
        sellableQty,
        inTransitQty,
        sellableLocations: breakdown?.sellableLocations ?? [],
        inTransitLocations: breakdown?.inTransitLocations ?? [],
        activePlatforms,
        availablePlatforms,
        suggestedPrice: formatReferencePrice(reference),
        suggestedCurrency: reference?.currency ?? null,
      };
    })
    .filter(
      (item) =>
        item.availablePlatforms.length > 0 && (item.sellableQty > 0 || item.inTransitQty > 0)
    );

  const unitItems: ListingPendingItem[] = itemUnits
    .map((item) => {
      const activePlatformIds = new Set(
        item.listings
          .filter((listing) => isCoreSellingPlatform(listing.platform.code))
          .map((listing) => listing.platformId)
      );
      const activePlatforms = item.listings
        .filter((listing) => isCoreSellingPlatform(listing.platform.code))
        .map((listing) => listing.platform);
      const reference = referencePrices.get(item.skuId);
      const isSellable = item.location.isSellableDefault;
      const availablePlatforms = eligiblePlatforms(platforms, isSellable).filter(
        (platform) => !activePlatformIds.has(platform.id)
      );

      return {
        id: `item-${item.id}`,
        type: "ITEM_UNIT" as const,
        skuId: item.skuId,
        itemUnitId: item.id,
        skuCode: item.sku.code,
        skuName: item.sku.name,
        imageUrl: firstPhoto(item.photos) ?? item.sku.imageUrl,
        waitingSince: item.updatedAt.toISOString(),
        conditionGrade: item.conditionGrade,
        locationName: item.location.name,
        sellableQty: isSellable ? 1 : 0,
        inTransitQty: isSellable ? 0 : 1,
        sellableLocations: [],
        inTransitLocations: [],
        activePlatforms,
        availablePlatforms,
        suggestedPrice: formatReferencePrice(reference),
        suggestedCurrency: reference?.currency ?? null,
      };
    })
    .filter((item) => item.availablePlatforms.length > 0);

  return [...unitItems, ...skuItems];
}
