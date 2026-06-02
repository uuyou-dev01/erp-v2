import Link from "next/link";
import { Plus } from "lucide-react";
import { getPlatforms } from "@/app/actions/platforms";
import { ListingCoverageGrid } from "@/components/listing/listing-coverage-grid";
import { SellableInventoryStats } from "@/components/listing/sellable-inventory-stats";
import { ListingOpsToolbar } from "@/components/listing/listing-ops-toolbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SellableNewStockGuide } from "@/components/listing/sellable-new-stock-guide";
import {
  computeSellableInventoryStats,
  getListingCoverageProducts,
  type ListingCoverageProduct,
} from "@/lib/application/listing-coverage";
import { summarizeSellableGuides } from "@/lib/application/sellable-listing-guide";

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
        new Date(b.latestUpdatedAt ?? 0).getTime() -
        new Date(a.latestUpdatedAt ?? 0).getTime()
      );
    }
    if (sort === "priceAsc") return primaryPrice(a) - primaryPrice(b);
    if (sort === "priceDesc") return primaryPrice(b) - primaryPrice(a);
    if (sort === "listedAt") {
      return (
        new Date(b.latestListedAt ?? 0).getTime() -
        new Date(a.latestListedAt ?? 0).getTime()
      );
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
  }>;
}) {
  const params = await searchParams;
  const [products, platforms] = await Promise.all([
    getListingCoverageProducts(STORE_ID),
    getPlatforms(STORE_ID),
  ]);

  const sellableProducts = products.filter((product) => product.sellableQty > 0);
  const filteredProducts = sortProducts(
    sellableProducts.filter((product) => {
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
  const pageProducts = filteredProducts.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );
  const stats = computeSellableInventoryStats(sellableProducts);
  const guide = summarizeSellableGuides(sellableProducts);
  const fromWorkbench = params.from === "workbench";
  const returnTo = currentHref(params);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">可售库存</h1>
          <p className="text-muted-foreground">
            查看可发货库存、已有上架记录，并从这里添加上架或登记售出。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/inventory/sellable?unlisted=1">
            <Button variant="outline">
              待添加上架 ({stats.withoutListings})
            </Button>
          </Link>
          <Link href={withReturnTo("/listing/new", returnTo)}>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              添加上架记录
            </Button>
          </Link>
        </div>
      </div>

      <SellableNewStockGuide
        awaitingCount={guide.awaitingFirstListing}
        expandableCount={guide.expandablePlatform}
        previewProducts={guide.unlistedProducts}
        fromWorkbench={fromWorkbench}
        showUnlistedFilter={params.unlisted === "1"}
      />

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

      {guide.expandablePlatform > 0 && params.unlisted !== "1" ? (
        <p className="text-sm text-muted-foreground">
          已有 {guide.expandablePlatform} 个商品可继续上架到其他平台，在卡片内点击平台按钮即可快速添加。
        </p>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          <ListingCoverageGrid
            products={pageProducts}
            expandIfUnlisted={params.unlisted === "1"}
            emptyTitle={
              params.unlisted === "1" ? "暂无待添加上架的商品" : "暂无可售库存"
            }
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
