import { getListings } from "@/app/actions/listings";
import { getPlatforms } from "@/app/actions/platforms";
import { getSKUs } from "@/app/actions/skus";
import { getStoreStockBreakdown } from "@/lib/application/inventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/shared/stat-card";
import { ResponsiveTable, type Column } from "@/components/shared/responsive-table";
import { Plus, Globe, CheckCircle, XCircle, Truck } from "lucide-react";
import Link from "next/link";
import { BatchListingDialog } from "@/components/listing/batch-listing-dialog";
import { PublishableSkuDialog } from "@/components/listing/publishable-sku-dialog";
import { QuickSellButton } from "@/components/listing/quick-sell-button";

export const dynamic = "force-dynamic";

const STORE_ID = "store_1";

export default async function ListingPage() {
  const [allListings, platforms, skus, stockBreakdown] = await Promise.all([
    getListings(STORE_ID),
    getPlatforms(STORE_ID),
    getSKUs(STORE_ID),
    getStoreStockBreakdown(STORE_ID),
  ]);

  const skuOverviews = skus.map((sku) => {
    const skuListings = allListings.filter((listing) => {
      const listingSkuId = listing.sku?.id || listing.itemUnit?.sku?.id;
      return listingSkuId === sku.id;
    });

    const activeListings = skuListings.filter((listing) => listing.status === "ACTIVE");
    const activePlatformIds = new Set(activeListings.map((listing) => listing.platformId));
    const activePlatforms = platforms.filter((platform) => activePlatformIds.has(platform.id));
    const availablePlatforms = platforms.filter((platform) => !activePlatformIds.has(platform.id));

    const breakdown = stockBreakdown.get(sku.id);

    return {
      skuId: sku.id,
      skuCode: sku.code,
      skuName: sku.name,
      activePlatforms,
      availablePlatforms,
      totalListings: skuListings.length,
      activeCount: activeListings.length,
      delistedCount: skuListings.filter((listing) => listing.status === "DELISTED").length,
      soldOutCount: skuListings.filter((listing) => listing.status === "SOLD_OUT").length,
      sellableQty: breakdown?.sellableQty ?? 0,
      inTransitQty: breakdown?.inTransitQty ?? 0,
      sellableLocations: breakdown?.sellableLocations ?? [],
      inTransitLocations: breakdown?.inTransitLocations ?? [],
      lastListedAt:
        skuListings.length > 0
          ? new Date(
              Math.max(...skuListings.map((listing) => new Date(listing.listedAt).getTime()))
            )
          : null,
    };
  });

  const publishableSkus = skuOverviews.filter(
    (overview) => overview.availablePlatforms.length > 0
  );

  const stats = {
    listingCount: allListings.length,
    activeListingCount: allListings.filter((listing) => listing.status === "ACTIVE").length,
    listedSkuCount: skuOverviews.filter((overview) => overview.activeCount > 0).length,
    platforms: platforms.length,
    inTransitOnly: skuOverviews.filter(
      (o) => o.sellableQty === 0 && o.inTransitQty > 0
    ).length,
    sellableSkuCount: skuOverviews.filter((o) => o.sellableQty > 0).length,
  };

  type SkuOverview = (typeof skuOverviews)[number];

  const columns: Column<SkuOverview>[] = [
    {
      key: "sku",
      header: "SKU",
      cell: (row) => (
        <div>
          <p className="font-medium">{row.skuCode}</p>
          <p className="text-xs text-muted-foreground">{row.skuName}</p>
        </div>
      ),
    },
    {
      key: "stock",
      header: "可发货库存",
      cell: (row) => {
        if (row.sellableQty === 0 && row.inTransitQty === 0) {
          return <span className="text-xs text-muted-foreground">无库存</span>;
        }
        return (
          <div className="flex flex-wrap items-center gap-1">
            {row.sellableQty > 0 ? (
              <Badge
                variant="default"
                className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
              >
                <CheckCircle className="mr-1 h-3 w-3" />
                可发 {row.sellableQty}
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-muted-foreground">
                可发 0
              </Badge>
            )}
            {row.inTransitQty > 0 ? (
              <Badge
                variant="outline"
                className="border-amber-500/40 bg-amber-500/10 text-amber-700"
              >
                <Truck className="mr-1 h-3 w-3" />
                转运 {row.inTransitQty}
              </Badge>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "platforms",
      header: "已上架平台",
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.activePlatforms.length > 0 ? (
            row.activePlatforms.map((platform) => (
              <Badge key={platform.id} variant="default">
                {platform.name}
              </Badge>
            ))
          ) : (
            <span className="text-muted-foreground">未上架</span>
          )}
        </div>
      ),
    },
    {
      key: "statusStats",
      header: "上架状态",
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          <Badge variant="default">上架中 {row.activeCount}</Badge>
          {row.delistedCount > 0 && (
            <Badge variant="outline">已下架 {row.delistedCount}</Badge>
          )}
          {row.soldOutCount > 0 && (
            <Badge variant="destructive">已售罄 {row.soldOutCount}</Badge>
          )}
        </div>
      ),
    },
    {
      key: "listedAt",
      header: "最近上架时间",
      cell: (row) =>
        row.lastListedAt ? row.lastListedAt.toLocaleDateString("zh-CN") : "-",
      hideOnMobile: true,
    },
    {
      key: "actions",
      header: "操作",
      className: "text-right",
      cell: (row) => (
        <div className="flex justify-end gap-2">
          <Link href={`/listing/new?skuId=${row.skuId}`}>
            <Button size="sm" variant="outline">
              创建上架
            </Button>
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">商品上架</h1>
          <p className="text-muted-foreground">管理多平台商品上架状态</p>
        </div>
        <div className="flex gap-2">
          <PublishableSkuDialog
            items={publishableSkus.map((sku) => ({
              skuId: sku.skuId,
              skuCode: sku.skuCode,
              skuName: sku.skuName,
              sellableQty: sku.sellableQty,
              inTransitQty: sku.inTransitQty,
              sellableLocations: sku.sellableLocations,
              inTransitLocations: sku.inTransitLocations,
              availablePlatforms: sku.availablePlatforms.map((platform) => ({
                id: platform.id,
                name: platform.name,
              })),
            }))}
          />
          <Link href="/listing/platforms">
            <Button variant="outline">
              <Globe className="mr-2 h-4 w-4" />
              管理平台
            </Button>
          </Link>
          <Link href="/listing/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              新建上架
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          title="总上架数"
          value={stats.listingCount}
          subtitle="所有上架记录"
          icon={Globe}
        />
        <StatCard
          title="上架中"
          value={stats.activeListingCount}
          subtitle="正在销售"
          icon={CheckCircle}
          iconColor="text-green-500"
        />
        <StatCard
          title="已上架 SKU"
          value={stats.listedSkuCount}
          subtitle="至少一个平台在售"
          icon={XCircle}
          iconColor="text-gray-500"
        />
        <StatCard
          title="可发货 SKU"
          value={stats.sellableSkuCount}
          subtitle={
            stats.inTransitOnly > 0
              ? `另有 ${stats.inTransitOnly} 个 SKU 仅在转运中`
              : "在可售位置有库存"
          }
          icon={Truck}
          iconColor="text-amber-500"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>活跃上架 · 快捷售出</CardTitle>
        </CardHeader>
        <CardContent>
          {allListings.filter((l) => l.status === "ACTIVE").length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无活跃上架。请先在 SKU 总览中创建上架。</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {allListings
                .filter((l) => l.status === "ACTIVE")
                .slice(0, 30)
                .map((listing) => {
                  const sku = listing.sku || listing.itemUnit?.sku;
                  const productLabel = `${sku?.code ?? "?"} · ${sku?.name ?? ""}`;
                  return (
                    <div key={listing.id} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{productLabel}</p>
                          <p className="text-xs text-muted-foreground">
                            {listing.platform?.name} · {listing.listedPrice ? `${listing.currency ?? ""} ${listing.listedPrice}` : "未定价"}
                          </p>
                        </div>
                        <QuickSellButton
                          listingId={listing.id}
                          listingType={listing.listingType as "SKU" | "ITEM_UNIT"}
                          status={listing.status}
                          productLabel={productLabel}
                          listedPrice={listing.listedPrice?.toString() ?? null}
                          currency={listing.currency}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>SKU 上架总览</CardTitle>
            <div className="flex items-center gap-2">
              <BatchListingDialog
                storeId={STORE_ID}
                platforms={platforms.map((p) => ({ id: p.id, name: p.name, code: p.code }))}
                skus={skus.map((s) => {
                  const breakdown = stockBreakdown.get(s.id);
                  return {
                    id: s.id,
                    code: s.code,
                    name: s.name,
                    sellableQty: breakdown?.sellableQty ?? 0,
                    inTransitQty: breakdown?.inTransitQty ?? 0,
                  };
                })}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveTable
            columns={columns}
            data={skuOverviews}
            keyExtractor={(row) => row.skuId}
            emptyState={
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Globe className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-semibold">暂无 SKU 数据</h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  请先创建 SKU，再创建上架记录
                </p>
                <Link href="/listing/new">
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    新建上架
                  </Button>
                </Link>
              </div>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
