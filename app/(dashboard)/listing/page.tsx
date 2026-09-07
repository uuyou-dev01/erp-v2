import { requireUserContext } from "@/lib/auth/user-context";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getPlatforms } from "@/app/actions/platforms";
import { ListingOpsGrid } from "@/components/listing/listing-ops-grid";
import { ListingOpsStats } from "@/components/listing/listing-ops-stats";
import { ListingOpsToolbar } from "@/components/listing/listing-ops-toolbar";
import type {
  ListingOpsItem,
  ListingOpsStats as ListingOpsStatsType,
} from "@/components/listing/listing-ops-types";
import { Button } from "@/components/ui/button";
import {
  getListingCoverageProducts,
  type ListingCoverageProduct,
} from "@/lib/application/listing-coverage";
import { sortListingOpsItems } from "@/lib/application/listing-ops";
import {
  inferMarketFromPlatform,
  type SellableMarketCode,
} from "@/lib/application/sellable-market";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

function flattenListingRecords(products: ListingCoverageProduct[]): ListingOpsItem[] {
  return products.flatMap((product) =>
    product.records.map((record) => ({
      id: record.listingId,
      salesChannelAccountId: record.salesChannelAccountId,
      hasResaleSource: record.hasResaleSource,
      listingType: record.listingScope,
      status: record.status,
      skuId: record.skuId,
      itemUnitId: record.itemUnitId,
      skuCode: record.skuCode || product.skuCode,
      skuName: record.skuName || product.skuName,
      imageUrl: record.imageUrl || product.imageUrl,
      platform: {
        id: record.platformId,
        name: record.platformName,
        code: record.platformCode,
        country: record.platformCountry,
      },
      listedPrice: record.listedPrice,
      currency: record.currency,
      platformFeeRate: record.platformFeeRate,
      defaultShippingFee: record.defaultShippingFee,
      estimatedNet: record.estimatedNet,
      listedAt: record.listedAt,
      updatedAt: record.updatedAt,
      sellableQty: record.sellableQty,
      sellableLocations: record.sellableLocations,
      risks: record.risks,
    }))
  );
}

function computeStats(listings: ListingOpsItem[]): ListingOpsStatsType {
  return {
    activeCount: listings.filter((listing) => listing.status === "ACTIVE").length,
    delistedCount: listings.filter((listing) => listing.status === "DELISTED").length,
    soldOutCount: listings.filter((listing) => listing.status === "SOLD_OUT").length,
    lowStockCount: listings.filter((listing) =>
      listing.risks.some((risk) => risk.key === "lowStock")
    ).length,
    unpricedCount: listings.filter((listing) =>
      listing.risks.some((risk) => risk.key === "unpriced")
    ).length,
    staleCount: listings.filter((listing) => listing.risks.some((risk) => risk.key === "stale"))
      .length,
  };
}

function matchesQuery(listing: ListingOpsItem, query?: string) {
  if (!query) return true;
  const keyword = query.toLowerCase();
  return [
    listing.id,
    listing.skuCode,
    listing.skuName,
    listing.platform.name,
    listing.platform.code,
  ].some((value) => value.toLowerCase().includes(keyword));
}

function paginationHref(params: Record<string, string | undefined>, page: number) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") query.set(key, value);
  }
  if (page > 1) query.set("page", String(page));
  const search = query.toString();
  return search ? `/listing?${search}` : "/listing";
}

function currentHref(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const search = query.toString();
  return search ? `/listing?${search}` : "/listing";
}

function withReturnTo(href: string, returnTo: string) {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}returnTo=${encodeURIComponent(returnTo)}`;
}

function parseMarket(value?: string): SellableMarketCode | undefined {
  if (
    value === "CN" ||
    value === "JP" ||
    value === "US" ||
    value === "EU" ||
    value === "GLOBAL" ||
    value === "UNKNOWN"
  ) {
    return value;
  }
  return undefined;
}

export default async function ListingPage({
  searchParams,
}: {
  searchParams: Promise<{
    platformId?: string;
    market?: string;
    status?: string;
    risk?: string;
    sort?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const { activeStoreId: storeId } = await requireUserContext();
  const params = await searchParams;
  const [products, platforms] = await Promise.all([
    getListingCoverageProducts(storeId),
    getPlatforms(storeId),
  ]);

  const listings = flattenListingRecords(products);
  const activeMarket = parseMarket(params.market);
  const filteredListings = sortListingOpsItems(
    listings.filter((listing) => {
      if (params.platformId && listing.platform.id !== params.platformId) {
        return false;
      }
      if (
        !params.platformId &&
        activeMarket &&
        inferMarketFromPlatform({
          code: listing.platform.code,
          country: listing.platform.country ?? null,
        }) !== activeMarket
      ) {
        return false;
      }
      if (params.status && listing.status !== params.status) return false;
      if (params.risk && !listing.risks.some((risk) => risk.key === params.risk)) {
        return false;
      }
      return matchesQuery(listing, params.q);
    }),
    params.sort
  );
  const currentPage = Math.max(Number(params.page ?? "1") || 1, 1);
  const totalPages = Math.max(Math.ceil(filteredListings.length / PAGE_SIZE), 1);
  const safePage = Math.min(currentPage, totalPages);
  const pageListings = filteredListings.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const stats = computeStats(listings);
  const returnTo = currentHref(params);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Listing 分类</h1>
          <p className="text-muted-foreground">
            按平台查看已经上架过的商品，并在对应 Listing 上登记售出。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/inventory/sellable?unlisted=1">
            <Button variant="outline">查看待上架</Button>
          </Link>
          <Link href={withReturnTo("/listing/new", returnTo)}>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              添加上架记录
            </Button>
          </Link>
        </div>
      </div>

      <ListingOpsToolbar
        basePath="/listing"
        platforms={platforms.map((platform) => ({
          id: platform.id,
          name: platform.name,
          code: platform.code,
          country: platform.country,
        }))}
        activePlatformId={params.platformId}
        activeMarket={activeMarket}
        status={params.status}
        risk={params.risk}
        sort={params.sort ?? "listedAt"}
        query={params.q}
      />

      <ListingOpsStats stats={stats} />

      <ListingOpsGrid listings={pageListings} />

      {filteredListings.length > PAGE_SIZE ? (
        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            共 {filteredListings.length} 条 Listing，第 {safePage} / {totalPages} 页
          </p>
          <div className="flex gap-2">
            <Link href={paginationHref(params, safePage - 1)}>
              <Button variant="outline" disabled={safePage <= 1}>
                上一页
              </Button>
            </Link>
            <Link href={paginationHref(params, safePage + 1)}>
              <Button variant="outline" disabled={safePage >= totalPages}>
                下一页
              </Button>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
