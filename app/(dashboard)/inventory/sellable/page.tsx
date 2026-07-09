import Link from "next/link";
import { MapPin, Plus } from "lucide-react";
import { getPlatforms } from "@/app/actions/platforms";
import { ListingCoverageGrid } from "@/components/listing/listing-coverage-grid";
import { BatchListingDialog } from "@/components/listing/batch-listing-dialog";
import { ListingOpsToolbar } from "@/components/listing/listing-ops-toolbar";
import { InventoryDashboardOverview } from "@/components/inventory/inventory-dashboard-overview";
import { StockingPoolBoard } from "@/components/inventory/stocking-pool-board";
import { Button } from "@/components/ui/button";
import { SellableNewStockGuide } from "@/components/listing/sellable-new-stock-guide";
import {
  buildScopedListingCoverageProduct,
  getListingCoverageProducts,
  type ListingCoverageProduct,
} from "@/lib/application/listing-coverage";
import { summarizeSellableGuides } from "@/lib/application/sellable-listing-guide";
import { buildInventoryDashboardSummary } from "@/lib/application/inventory-dashboard";
import {
  inferMarketFromLocation,
  marketLabel,
  type SellableMarketCode,
} from "@/lib/application/sellable-market";

export const dynamic = "force-dynamic";

const STORE_ID = "store_1";
const PAGE_SIZE = 50;
const GRID_COLUMN_OPTIONS = ["2", "3", "4"] as const;

type GridColumnCount = (typeof GRID_COLUMN_OPTIONS)[number];

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
    if (!sort || sort === "stockDesc") {
      return b.sellableQty - a.sellableQty;
    }
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

function parseGridColumns(value?: string): GridColumnCount {
  if (value === "2" || value === "3" || value === "4") return value;
  return "4";
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
    view?: string;
    cols?: string;
  }>;
}) {
  const params = await searchParams;
  const [products, platforms] = await Promise.all([
    getListingCoverageProducts(STORE_ID),
    getPlatforms(STORE_ID),
  ]);

  const selectedMarket = parseMarket(params.market);
  const marketInventoryProducts = products
    .map((product) =>
      buildScopedListingCoverageProduct(product, {
        market: selectedMarket,
      })
    )
    .filter((product): product is ListingCoverageProduct => Boolean(product));
  const marketProducts = marketInventoryProducts.filter((product) => product.sellableQty > 0);
  const locationOptions = buildLocationOptions(marketProducts, selectedMarket);
  const scopedInventoryProducts = products
    .map((product) =>
      buildScopedListingCoverageProduct(product, {
        market: selectedMarket,
        locationId: params.locationId,
      })
    )
    .filter((product): product is ListingCoverageProduct => {
      if (!product) return false;
      return product.sellableQty > 0 || product.inTransitQty > 0;
    });
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
    params.sort ?? "stockDesc"
  );
  const currentPage = Math.max(Number(params.page ?? "1") || 1, 1);
  const totalPages = Math.max(Math.ceil(filteredProducts.length / PAGE_SIZE), 1);
  const safePage = Math.min(currentPage, totalPages);
  const pageProducts = filteredProducts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const dashboardSummary = buildInventoryDashboardSummary(scopedInventoryProducts);
  const guide = summarizeSellableGuides(scopedProducts);
  const fromWorkbench = params.from === "workbench";
  const returnTo = currentHref(params);
  const isStockingPoolView = params.view === "pools";
  const gridColumns = parseGridColumns(params.cols);
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
          <p className="hidden text-sm text-muted-foreground sm:block">
            查看自有货、可操作 SKU、仓位分布和平台覆盖。
          </p>
          <p className="mt-1 hidden text-xs text-muted-foreground sm:block">
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
          <Link href={withReturnTo("/listing/new", returnTo)}>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              添加上架记录
            </Button>
          </Link>
        </div>
      </div>

      <InventoryDashboardOverview
        summary={dashboardSummary}
        pendingFirstListingCount={guide.awaitingFirstListing}
        pendingHref={withSellableParams(params, { unlisted: "1" })}
      />

      <div className="flex flex-col gap-2 rounded-xl border bg-card p-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1.5 overflow-x-auto">
          <Link href={withSellableParams(params, { view: undefined })}>
            <Button
              variant={!isStockingPoolView ? "default" : "outline"}
              size="sm"
              className="h-8 shrink-0"
            >
              库存列表
            </Button>
          </Link>
          <Link href={withSellableParams(params, { view: "pools" })}>
            <Button
              variant={isStockingPoolView ? "default" : "outline"}
              size="sm"
              className="h-8 shrink-0"
            >
              经营池
            </Button>
          </Link>
        </div>

        {!isStockingPoolView ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-xs text-muted-foreground">每行</span>
            {GRID_COLUMN_OPTIONS.map((columns) => (
              <Link
                key={columns}
                href={withSellableParams(params, { cols: columns })}
                aria-label={`每行显示 ${columns} 个商品`}
              >
                <Button
                  variant={gridColumns === columns ? "default" : "outline"}
                  size="sm"
                  className="h-8 min-w-10 px-2.5 text-xs"
                >
                  {columns}个
                </Button>
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {fromWorkbench || params.unlisted === "1" ? (
        <SellableNewStockGuide
          awaitingCount={guide.awaitingFirstListing}
          expandableCount={guide.expandablePlatform}
          previewProducts={guide.unlistedProducts}
          fromWorkbench={fromWorkbench}
          showUnlistedFilter={params.unlisted === "1"}
        />
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

      {isStockingPoolView ? (
        <StockingPoolBoard products={filteredProducts} />
      ) : (
        <>
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
            sort={params.sort ?? "stockDesc"}
            query={params.q}
            showStockSort
          />

          <ListingCoverageGrid
            products={pageProducts}
            expandIfUnlisted={params.unlisted === "1"}
            focusLocationId={params.locationId}
            focusMarket={selectedMarket}
            columns={gridColumns}
            emptyTitle={params.unlisted === "1" ? "暂无待添加上架的商品" : "暂无可售库存"}
            emptyDescription={
              params.unlisted === "1"
                ? "当前可售商品都已至少有一条上架记录。"
                : "库存进入可售位置后，会在这里显示并可添加上架记录。"
            }
          />
          {filteredProducts.length > PAGE_SIZE ? (
            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
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
        </>
      )}
    </div>
  );
}
