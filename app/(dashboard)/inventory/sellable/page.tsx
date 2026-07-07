import Link from "next/link";
import { MapPin, Plus } from "lucide-react";
import { getPlatforms } from "@/app/actions/platforms";
import { ListingCoverageGrid } from "@/components/listing/listing-coverage-grid";
import { BatchListingDialog } from "@/components/listing/batch-listing-dialog";
import { SellableInventoryStats } from "@/components/listing/sellable-inventory-stats";
import { ListingOpsToolbar } from "@/components/listing/listing-ops-toolbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SellableNewStockGuide } from "@/components/listing/sellable-new-stock-guide";
import {
  buildScopedListingCoverageProduct,
  computeSellableInventoryStats,
  getListingCoverageProducts,
  type ListingCoverageProduct,
} from "@/lib/application/listing-coverage";
import { summarizeSellableGuides } from "@/lib/application/sellable-listing-guide";
import {
  inferMarketFromLocation,
  marketLabel,
  type SellableMarketCode,
} from "@/lib/application/sellable-market";

export const dynamic = "force-dynamic";

const STORE_ID = "store_1";
const PAGE_SIZE = 30;

function hasPlatform(product: ListingCoverageProduct, platformId?: string) {
  if (!platformId) return true;
  return product.records.some(
    (record) => record.platformId === platformId && record.state === "active"
  );
}

function hasStatus(product: ListingCoverageProduct, status?: string) {
  if (!status) return true;
  return product.records.some((record) => record.status === status);
}

function hasRisk(product: ListingCoverageProduct, risk?: string) {
  if (!risk) return true;
  return product.aggregateRisks.some((item) => item.key === risk);
}

function matchesUnlisted(product: ListingCoverageProduct, unlisted?: string) {
  if (unlisted !== "1") return true;
  return product.records.length === 0;
}

function matchesQuery(product: ListingCoverageProduct, query?: string) {
  if (!query) return true;
  const keyword = query.toLowerCase();
  return [
    product.key,
    product.skuCode,
    product.skuName,
    ...product.variantRows.map((variant) => variant.skuCode),
    ...product.variantRows.map((variant) => variant.skuName),
    ...product.records.map((record) => record.platformName),
    ...product.records.map((record) => record.platformCode),
  ].some((value) => value.toLowerCase().includes(keyword));
}

function primaryPrice(product: ListingCoverageProduct) {
  const active = product.records.find((record) => record.state === "active");
  return Number(active?.listedPrice ?? 0);
}

function sortProducts(products: ListingCoverageProduct[], sort?: string) {
  return [...products].sort((a, b) => {
    if (sort === "updatedAt") {
      return (
        new Date(b.latestUpdatedAt ?? 0).getTime() - new Date(a.latestUpdatedAt ?? 0).getTime()
      );
    }
    if (sort === "priceAsc") return primaryPrice(a) - primaryPrice(b);
    if (sort === "priceDesc") return primaryPrice(b) - primaryPrice(a);
    if (sort === "listedAt") {
      return new Date(b.latestListedAt ?? 0).getTime() - new Date(a.latestListedAt ?? 0).getTime();
    }
    return b.sellableQty - a.sellableQty;
  });
}

function paginationHref(params: Record<string, string | undefined>, page: number) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") query.set(key, value);
  }
  if (page > 1) query.set("page", String(page));
  const search = query.toString();
  return search ? `/inventory/sellable?${search}` : "/inventory/sellable";
}

function currentHref(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const search = query.toString();
  return search ? `/inventory/sellable?${search}` : "/inventory/sellable";
}

function withReturnTo(href: string, returnTo: string) {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}returnTo=${encodeURIComponent(returnTo)}`;
}

function parseMarket(value?: string): SellableMarketCode | undefined {
  if (value === "CN" || value === "JP" || value === "US" || value === "UNKNOWN") return value;
  return undefined;
}

function withSellableParams(
  params: Record<string, string | undefined>,
  next: Record<string, string | undefined>
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") query.set(key, value);
  }
  for (const [key, value] of Object.entries(next)) {
    if (value) {
      query.set(key, value);
    } else {
      query.delete(key);
    }
  }
  const search = query.toString();
  return search ? `/inventory/sellable?${search}` : "/inventory/sellable";
}

function buildLocationOptions(products: ListingCoverageProduct[], market?: SellableMarketCode) {
  const locations = new Map<
    string,
    {
      id: string;
      label: string;
      qty: number;
      productKeys: Set<string>;
    }
  >();

  for (const product of products) {
    for (const location of product.sellableLocations) {
      const locationMarket = inferMarketFromLocation(location);
      if (market && locationMarket !== market) continue;
      const current = locations.get(location.locationId) ?? {
        id: location.locationId,
        label: `${location.code} · ${location.name}`,
        qty: 0,
        productKeys: new Set<string>(),
      };
      current.qty += location.qty;
      current.productKeys.add(product.key);
      locations.set(location.locationId, current);
    }
  }

  return [...locations.values()].sort((a, b) => b.qty - a.qty);
}

export default async function SellableInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    platformId?: string;
    status?: string;
    risk?: string;
    sort?: string;
    q?: string;
    page?: string;
    unlisted?: string;
    from?: string;
    market?: string;
    locationId?: string;
  }>;
}) {
  const params = await searchParams;
  const [products, platforms] = await Promise.all([
    getListingCoverageProducts(STORE_ID),
    getPlatforms(STORE_ID),
  ]);

  const selectedMarket = parseMarket(params.market);
  const sellableProducts = products.filter((product) => product.sellableQty > 0);
  const marketProducts = sellableProducts
    .map((product) =>
      buildScopedListingCoverageProduct(product, {
        market: selectedMarket,
      })
    )
    .filter((product): product is ListingCoverageProduct => Boolean(product));
  const locationOptions = buildLocationOptions(marketProducts, selectedMarket);
  const scopedProducts = marketProducts
    .map((product) =>
      buildScopedListingCoverageProduct(product, {
        market: selectedMarket,
        locationId: params.locationId,
      })
    )
    .filter((product): product is ListingCoverageProduct => Boolean(product));
  const filteredProducts = sortProducts(
    scopedProducts.filter((product) => {
      if (!matchesUnlisted(product, params.unlisted)) return false;
      if (!hasPlatform(product, params.platformId)) return false;
      if (!hasStatus(product, params.status)) return false;
      if (!hasRisk(product, params.risk)) return false;
      return matchesQuery(product, params.q);
    }),
    params.sort
  );
  const currentPage = Math.max(Number(params.page ?? "1") || 1, 1);
  const totalPages = Math.max(Math.ceil(filteredProducts.length / PAGE_SIZE), 1);
  const safePage = Math.min(currentPage, totalPages);
  const pageProducts = filteredProducts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const stats = computeSellableInventoryStats(scopedProducts);
  const guide = summarizeSellableGuides(scopedProducts);
  const fromWorkbench = params.from === "workbench";
  const returnTo = currentHref(params);
  const batchListingSkus =
    params.unlisted === "1"
      ? pageProducts
          .filter(
            (product) =>
              product.listingType === "SKU" &&
              product.records.length === 0 &&
              product.sellableLotQty > 0
          )
          .map((product) => ({
            id: product.skuId,
            code: product.skuCode,
            name: product.skuName,
            sellableQty: product.sellableLotQty,
            inTransitQty: product.inTransitQty,
          }))
      : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">库存看板</h1>
          <p className="text-sm text-muted-foreground">
            查看可发货库存、已有上架记录，并从这里添加上架或登记售出。
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            库存口径：现货=当前可发货库存；在途、已售待发和公开货盘供给不混入可售数。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {batchListingSkus.length > 0 ? (
            <BatchListingDialog
              storeId={STORE_ID}
              platforms={platforms.map((platform) => ({
                id: platform.id,
                name: platform.name,
                code: platform.code,
              }))}
              skus={batchListingSkus}
            />
          ) : null}
          <Link href="/inventory/sellable?unlisted=1">
            <Button variant="outline">待上架 ({stats.withoutListings})</Button>
          </Link>
          <Link href={withReturnTo("/listing/new", returnTo)}>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              添加上架记录
            </Button>
          </Link>
        </div>
      </div>

      {fromWorkbench || params.unlisted === "1" ? (
        <SellableNewStockGuide
          awaitingCount={guide.awaitingFirstListing}
          expandableCount={guide.expandablePlatform}
          previewProducts={guide.unlistedProducts}
          fromWorkbench={fromWorkbench}
          showUnlistedFilter={params.unlisted === "1"}
        />
      ) : guide.awaitingFirstListing > 0 || guide.expandablePlatform > 0 ? (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-amber-800">
            待首次上架 {guide.awaitingFirstListing} 个，仍可扩展平台 {guide.expandablePlatform} 个。
          </p>
          <div className="flex gap-2">
            <Link href="/inventory/sellable?unlisted=1">
              <Button variant="outline" size="sm" className="h-7 text-xs">
                查看待上架
              </Button>
            </Link>
            <Link href="/workbench?queue=pendingListing">
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                工作台
              </Button>
            </Link>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border bg-card px-3 py-2.5">
        <div className="grid gap-2 xl:grid-cols-[auto_1fr] xl:items-center">
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-none">
              {selectedMarket ? marketLabel(selectedMarket) : "全部货盘"}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">按仓库/持有人筛选</p>
          </div>

          <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-0.5">
            <Link href={withSellableParams(params, { locationId: undefined })}>
              <Button
                variant={!params.locationId ? "default" : "outline"}
                size="sm"
                className="h-7 shrink-0 px-2.5 text-xs"
              >
                全部仓位
              </Button>
            </Link>
            {locationOptions.map((location) => (
              <Link
                key={location.id}
                href={withSellableParams(params, { locationId: location.id })}
              >
                <Button
                  variant={params.locationId === location.id ? "default" : "outline"}
                  size="sm"
                  className="h-7 shrink-0 gap-1 px-2.5 text-xs"
                >
                  <MapPin className="h-3 w-3" />
                  <span className="max-w-[150px] truncate">{location.label}</span>
                  <span className="tabular-nums opacity-70">{location.qty}</span>
                </Button>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <ListingOpsToolbar
        basePath="/inventory/sellable"
        platforms={platforms.map((platform) => ({
          id: platform.id,
          name: platform.name,
          code: platform.code,
        }))}
        activePlatformId={params.platformId}
        status={params.status}
        risk={params.risk}
        sort={params.sort ?? "listedAt"}
        query={params.q}
      />

      <SellableInventoryStats stats={stats} />

      <Card>
        <CardContent className="p-3">
          <ListingCoverageGrid
            products={pageProducts}
            expandIfUnlisted={params.unlisted === "1"}
            focusLocationId={params.locationId}
            focusMarket={selectedMarket}
            emptyTitle={params.unlisted === "1" ? "暂无待添加上架的商品" : "暂无可售库存"}
            emptyDescription={
              params.unlisted === "1"
                ? "当前可售商品都已至少有一条上架记录。"
                : "库存进入可售位置后，会在这里显示并可添加上架记录。"
            }
          />
          {filteredProducts.length > PAGE_SIZE ? (
            <div className="mt-6 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                共 {filteredProducts.length} 个商品，第 {safePage} / {totalPages} 页
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
        </CardContent>
      </Card>
    </div>
  );
}
