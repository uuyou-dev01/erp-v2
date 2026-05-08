import { getListings } from "@/app/actions/listings";
import { getPlatforms } from "@/app/actions/platforms";
import { getSKUs } from "@/app/actions/skus";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/shared/stat-card";
import { ResponsiveTable, type Column } from "@/components/shared/responsive-table";
import { Plus, Globe, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import Link from "next/link";
import { BatchListingDialog } from "@/components/listing/batch-listing-dialog";
import { PublishableSkuDialog } from "@/components/listing/publishable-sku-dialog";

export const dynamic = "force-dynamic";

const STORE_ID = "store_1";

export default async function ListingPage() {
  const [allListings, platforms, skus] = await Promise.all([
    getListings(STORE_ID),
    getPlatforms(STORE_ID),
    getSKUs(STORE_ID),
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
          title="销售平台"
          value={stats.platforms}
          subtitle="已配置平台"
          icon={AlertCircle}
          iconColor="text-blue-500"
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>SKU 上架总览</CardTitle>
            <div className="flex items-center gap-2">
              <BatchListingDialog
                storeId={STORE_ID}
                platforms={platforms.map((p) => ({ id: p.id, name: p.name, code: p.code }))}
                skus={skus.map((s) => ({ id: s.id, code: s.code, name: s.name }))}
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
