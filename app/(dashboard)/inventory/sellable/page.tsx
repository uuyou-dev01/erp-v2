import { requireUserContext } from "@/lib/auth/user-context";
import Link from "next/link";
import { ArrowRightLeft, Plus } from "lucide-react";
import { getPlatforms } from "@/app/actions/platforms";
import { ListingCoverageGrid } from "@/components/listing/listing-coverage-grid";
import { BatchListingDialog } from "@/components/listing/batch-listing-dialog";
import { InventoryDashboardActions } from "@/components/inventory/inventory-dashboard-overview";
import { InventorySellableToolbar } from "@/components/inventory/inventory-sellable-toolbar";
import { StockingPoolBoard } from "@/components/inventory/stocking-pool-board";
import { Button } from "@/components/ui/button";
import { SellableNewStockGuide } from "@/components/listing/sellable-new-stock-guide";
import {
  buildScopedListingCoverageProduct,
  getListingCoverageProducts,
  type ListingCoverageProduct,
} from "@/lib/application/listing-coverage";
import { summarizeSellableGuides } from "@/lib/application/sellable-listing-guide";
import {
  isPlatformTargetForMarket,
  type SellableMarketCode,
} from "@/lib/application/sellable-market";
import { fulfillmentDestinationLabel } from "@/lib/inventory/location-fulfillment";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

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

function hasProductKind(product: ListingCoverageProduct, kind?: string) {
  if (!kind) return true;
  const effectiveKind = product.hasItemUnits && !product.hasLotStock ? "USED" : product.productKind;
  if (effectiveKind === kind) return true;
  return product.variantRows.some((variant) => variant.productKind === kind);
}

function hasCategory(product: ListingCoverageProduct, category?: string) {
  if (!category) return true;
  if (product.category?.trim() === category) return true;
  return product.variantRows.some((variant) => variant.category?.trim() === category);
}

function hasStockType(product: ListingCoverageProduct, stockType?: string) {
  if (!stockType) return true;
  if (stockType === "LOT") return product.hasLotStock && !product.hasItemUnits;
  if (stockType === "ITEM_UNIT") return product.hasItemUnits && !product.hasLotStock;
  if (stockType === "MIXED") return product.hasLotStock && product.hasItemUnits;
  return true;
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
    product.brand ?? "",
    product.category ?? "",
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
      market: SellableMarketCode;
      productKeys: Set<string>;
    }
  >();

  for (const product of products) {
    for (const location of product.sellableLocations) {
      const fulfillmentMarkets = location.fulfillableMarkets ?? [];
      if (
        market &&
        !fulfillmentMarkets.includes(market) &&
        !fulfillmentMarkets.includes("GLOBAL")
      ) {
        continue;
      }
      const locationMarket =
        market ?? fulfillmentMarkets.find((value) => value !== "GLOBAL") ?? "GLOBAL";
      const current = locations.get(location.locationId) ?? {
        id: location.locationId,
        label: `${location.code} · ${location.name}`,
        qty: 0,
        market: locationMarket,
        productKeys: new Set<string>(),
      };
      current.qty += location.qty;
      current.productKeys.add(product.key);
      locations.set(location.locationId, current);
    }
  }

  return [...locations.values()].sort((a, b) => b.qty - a.qty);
}

function buildCategoryOptions(products: ListingCoverageProduct[]) {
  const counts = new Map<string, number>();

  for (const product of products) {
    const productCategories = new Set(
      [product.category, ...product.variantRows.map((variant) => variant.category)]
        .map((category) => category?.trim())
        .filter((category): category is string => Boolean(category))
    );
    for (const category of productCategories) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ value: label, label, count }))
    .sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
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
    kind?: string;
    category?: string;
    stockType?: string;
  }>;
}) {
  const { activeStoreId: storeId } = await requireUserContext();
  const params = await searchParams;
  const [products, platforms] = await Promise.all([
    getListingCoverageProducts(storeId),
    getPlatforms(storeId),
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
  const selectedLocation = locationOptions.find((location) => location.id === params.locationId);
  const effectiveMarket = selectedMarket ?? selectedLocation?.market;
  const visiblePlatforms = effectiveMarket
    ? platforms.filter((platform) => isPlatformTargetForMarket(platform, effectiveMarket))
    : platforms;
  const activePlatformId = visiblePlatforms.some((platform) => platform.id === params.platformId)
    ? params.platformId
    : undefined;
  const scopedProducts = marketProducts
    .map((product) =>
      buildScopedListingCoverageProduct(product, {
        market: effectiveMarket,
        locationId: params.locationId,
      })
    )
    .filter((product): product is ListingCoverageProduct => Boolean(product));
  const filteredProducts = sortProducts(
    scopedProducts.filter((product) => {
      if (!matchesUnlisted(product, params.unlisted)) return false;
      if (!hasPlatform(product, activePlatformId)) return false;
      if (!hasStatus(product, params.status)) return false;
      if (!hasRisk(product, params.risk)) return false;
      if (!hasProductKind(product, params.kind)) return false;
      if (!hasCategory(product, params.category)) return false;
      if (!hasStockType(product, params.stockType)) return false;
      return matchesQuery(product, params.q);
    }),
    params.sort ?? "stockDesc"
  );
  const currentPage = Math.max(Number(params.page ?? "1") || 1, 1);
  const totalPages = Math.max(Math.ceil(filteredProducts.length / PAGE_SIZE), 1);
  const safePage = Math.min(currentPage, totalPages);
  const pageProducts = filteredProducts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const guide = summarizeSellableGuides(scopedProducts);
  const categoryOptions = buildCategoryOptions(scopedProducts);
  const fromWorkbench = params.from === "workbench";
  const returnTo = currentHref(params);
  const isStockingPoolView = params.view === "pools";
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
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">库存看板</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            按商品、节点和履约目的地集中查看可分配库存。
          </p>
          <p className="mt-1 hidden text-xs text-muted-foreground lg:block">
            库存口径：可分配表示实物在库且未占用；是否可向某个国家发货由节点能力和配送线路计算。
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Link href="/marketplace/new">
            <Button variant="outline" className="h-9">
              <Plus className="mr-2 h-4 w-4" />
              发布共享货盘
            </Button>
          </Link>
          <InventoryDashboardActions
            storeId={storeId}
            pendingFirstListingCount={guide.awaitingFirstListing}
            pendingHref={withSellableParams(params, { unlisted: "1" })}
          />
          {batchListingSkus.length > 0 ? (
            <BatchListingDialog
              storeId={storeId}
              platforms={visiblePlatforms.map((platform) => ({
                id: platform.id,
                name: platform.name,
                code: platform.code,
              }))}
              skus={batchListingSkus}
            />
          ) : null}
          <Link href="/inventory/stocktake?action=transfer">
            <Button variant="outline" className="h-9">
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              发起转仓
            </Button>
          </Link>
          <Link
            href={withReturnTo(
              effectiveMarket ? `/listing/new?market=${effectiveMarket}` : "/listing/new",
              returnTo
            )}
          >
            <Button className="h-9">
              <Plus className="mr-2 h-4 w-4" />
              添加上架记录
            </Button>
          </Link>
        </div>
      </div>

      <InventorySellableToolbar
        platforms={visiblePlatforms.map((platform) => ({
          id: platform.id,
          name: platform.name,
          code: platform.code,
        }))}
        locations={locationOptions.map((location) => ({
          id: location.id,
          label: location.label,
          qty: location.qty,
        }))}
        activePlatformId={activePlatformId}
        locationId={params.locationId}
        productKind={params.kind}
        category={params.category}
        categories={categoryOptions}
        stockType={params.stockType}
        status={params.status}
        risk={params.risk}
        sort={params.sort ?? "stockDesc"}
        query={params.q}
        scopeLabel={
          effectiveMarket
            ? `可履约：${fulfillmentDestinationLabel(effectiveMarket)}`
            : "全部履约目的地"
        }
        view={isStockingPoolView ? "pools" : undefined}
        resultCount={filteredProducts.length}
        totalCount={scopedProducts.length}
      />

      {fromWorkbench || params.unlisted === "1" ? (
        <SellableNewStockGuide
          awaitingCount={guide.awaitingFirstListing}
          expandableCount={guide.expandablePlatform}
          previewProducts={guide.unlistedProducts}
          fromWorkbench={fromWorkbench}
          showUnlistedFilter={params.unlisted === "1"}
        />
      ) : null}

      {isStockingPoolView ? (
        <StockingPoolBoard products={filteredProducts} />
      ) : (
        <>
          <ListingCoverageGrid
            storeId={storeId}
            products={pageProducts}
            expandIfUnlisted={params.unlisted === "1"}
            focusLocationId={params.locationId}
            focusMarket={effectiveMarket}
            categoryOptions={categoryOptions.map((option) => option.value)}
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
