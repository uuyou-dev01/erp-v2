import { getSKUById, getSKUParentOptions } from "@/app/actions/skus";
import { SKUDetailActions } from "@/components/inventory/sku-detail-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";
import Link from "next/link";
import { formatCurrency, formatQuantity } from "@/lib/decimal";
import Decimal from "decimal.js";
import {
  ArrowLeft,
  BarChart3,
  DollarSign,
  ExternalLink,
  Flame,
  Package,
  PieChart,
  ShoppingCart,
  Store,
  Tag,
  Truck,
} from "lucide-react";

// Force dynamic rendering
export const dynamic = "force-dynamic";

// Temporary hardcoded storeId - will be replaced with auth context
const STORE_ID = "store_1";

function formatAttributes(attributes: unknown) {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
    return [];
  }

  return Object.entries(attributes as Record<string, unknown>).map(([key, value]) => ({
    key,
    value:
      value == null || value === ""
        ? "未填写"
        : Array.isArray(value)
          ? value.filter(Boolean).join(" / ") || "未填写"
          : typeof value === "object"
            ? JSON.stringify(value)
            : String(value),
  }));
}

type PerformanceMetrics = NonNullable<
  Awaited<ReturnType<typeof getSKUById>>
>["performanceMetrics"];

function MetricItem({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold leading-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function PerformanceSection({ metrics }: { metrics: PerformanceMetrics }) {
  const m30 = metrics.last30d;
  const m90 = metrics.last90d;
  const mAll = metrics.allTime;
  const cur = metrics.salesCurrency || "CNY";
  const hasSales = Number(mAll.totalQuantity) > 0;

  if (!hasSales) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-5">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            暂无确认销售记录，先参考库存与上架情况。有销售后这里会显示经营分析。
          </p>
        </CardContent>
      </Card>
    );
  }

  const lastSoldLabel = metrics.latestSoldAt
    ? new Date(metrics.latestSoldAt).toLocaleDateString("zh-CN")
    : "-";

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Flame className="h-4 w-4" />
            销售热度
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <MetricItem label="近 30 天销量" value={`${m30.totalQuantity} 件`} />
            <MetricItem
              label="近 30 天销售额"
              value={formatCurrency(m30.totalRevenue, cur)}
            />
            <MetricItem label="近 30 天订单" value={`${m30.orderCount} 单`} />
            <MetricItem label="最近售出" value={lastSoldLabel} />
          </div>
          {Number(m90.totalQuantity) > Number(m30.totalQuantity) && (
            <p className="text-xs text-muted-foreground">
              近 90 天共售出 {m90.totalQuantity} 件 /{" "}
              {formatCurrency(m90.totalRevenue, cur)}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Tag className="h-4 w-4" />
            成交价格
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <MetricItem
              label="平均成交价"
              value={mAll.avgUnitPrice ? formatCurrency(mAll.avgUnitPrice, cur) : "-"}
            />
            <MetricItem
              label="最近成交价"
              value={
                metrics.latestUnitPrice
                  ? formatCurrency(metrics.latestUnitPrice, cur)
                  : "-"
              }
            />
            <MetricItem
              label="最高成交价"
              value={mAll.maxUnitPrice ? formatCurrency(mAll.maxUnitPrice, cur) : "-"}
            />
            <MetricItem
              label="最低成交价"
              value={mAll.minUnitPrice ? formatCurrency(mAll.minUnitPrice, cur) : "-"}
            />
          </div>
          {metrics.listingPriceRange && (
            <p className="text-xs text-muted-foreground">
              当前上架价{" "}
              {metrics.listingPriceRange.min === metrics.listingPriceRange.max
                ? formatCurrency(
                    metrics.listingPriceRange.min,
                    metrics.listingPriceRange.currency || cur
                  )
                : `${formatCurrency(
                    metrics.listingPriceRange.min,
                    metrics.listingPriceRange.currency || cur
                  )} ~ ${formatCurrency(
                    metrics.listingPriceRange.max,
                    metrics.listingPriceRange.currency || cur
                  )}`}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <DollarSign className="h-4 w-4" />
            利润表现
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <MetricItem
              label="累计毛利"
              value={formatCurrency(mAll.grossProfit, cur)}
            />
            <MetricItem
              label="毛利率"
              value={`${mAll.profitRate}%`}
            />
            <MetricItem
              label="单件平均毛利"
              value={formatCurrency(mAll.avgUnitProfit, cur)}
            />
            <MetricItem
              label="累计销售额"
              value={formatCurrency(mAll.totalRevenue, cur)}
            />
          </div>
          {Number(m30.totalQuantity) > 0 && (
            <p className="text-xs text-muted-foreground">
              近 30 天毛利 {formatCurrency(m30.grossProfit, cur)}（{m30.profitRate}%）
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <PieChart className="h-4 w-4" />
            成本拆解
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <MetricItem
              label="库存成本"
              value={formatCurrency(mAll.totalInventoryCost, cur)}
            />
            <MetricItem
              label="平台费"
              value={formatCurrency(mAll.totalPlatformFee, cur)}
            />
            <MetricItem
              label="发货费"
              value={formatCurrency(mAll.totalShippingFee, cur)}
            />
            <MetricItem
              label="总成本"
              value={formatCurrency(
                String(
                  Number(mAll.totalInventoryCost) +
                    Number(mAll.totalPlatformFee) +
                    Number(mAll.totalShippingFee)
                ),
                cur
              )}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const listingStatusLabels: Record<string, string> = {
  ACTIVE: "上架中",
  SOLD_OUT: "已售出",
  DELISTED: "已下架",
  DRAFT: "草稿",
};

const itemStatusLabels: Record<string, string> = {
  AVAILABLE: "可售",
  ALLOCATED: "已分配",
  CONSUMED: "已售出",
  RETURN_CHECK: "退货检查",
};

export default async function SKUDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sku = await getSKUById(id);

  if (!sku) {
    notFound();
  }

  const parentOptions = await getSKUParentOptions(STORE_ID, sku.id);

  const totalLots = sku.inventoryLots.length;
  const totalItems = sku.itemUnits.length;
  const activeListings = sku.listings.filter((listing) => listing.status === "ACTIVE");
  const soldLines = sku.orderLines.filter((line) =>
    ["CONFIRMED", "SHIPPED", "DELIVERED"].includes(line.order.orderStatus)
  );
  const soldQuantity = soldLines.reduce(
    (sum, line) => sum.plus(new Decimal(line.quantity.toString())),
    new Decimal(0)
  );
  const salesAmount = soldLines.reduce(
    (sum, line) => sum.plus(new Decimal(line.lineAmount.toString())),
    new Decimal(0)
  );
  const salesCurrency = soldLines[0]?.order.currency || "CNY";
  const availableLotQuantity = new Decimal(sku.businessSummary.availableLotQuantity);
  const availableItemUnits = sku.businessSummary.availableItemUnits;
  const availableStockLabel = `${formatQuantity(availableLotQuantity)} 入库库存 / ${availableItemUnits} 单件`;
  const attributes = formatAttributes(sku.attributes);
  const recentPurchaseLines = sku.purchaseLines.slice(0, 3);
  const recentSalesLines = soldLines.slice(0, 3);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-4">
          <Link href="/inventory/skus">
            <Button variant="ghost" size="icon" className="mt-1">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono">
                {sku.code}
              </Badge>
              {sku.category && <Badge variant="secondary">{sku.category}</Badge>}
              {sku.brand && <Badge>{sku.brand}</Badge>}
            </div>
            <h1 className="mt-2 text-3xl font-bold">{sku.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              先判断库存和上架状态，再维护图片、分类和属性。
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SKUDetailActions
            storeId={STORE_ID}
            sku={{
              id: sku.id,
              code: sku.code,
              name: sku.name,
              category: sku.category,
              brand: sku.brand,
              attributes: sku.attributes as Record<string, unknown> | null,
              description: sku.description,
              imageUrl: sku.imageUrl,
              parentSkuId: sku.parentSkuId,
            }}
            parentOptions={parentOptions}
          />
          <Link href={`/listing/new?skuId=${sku.id}`}>
            <Button>
              <ExternalLink className="mr-2 h-4 w-4" />
              发起上架
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="flex gap-4">
            <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
              {sku.imageUrl ? (
                <img src={sku.imageUrl} alt={sku.name} className="h-full w-full object-cover" />
              ) : (
                <Package className="h-9 w-9 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">可售库存</p>
                <p className="text-2xl font-bold">{availableStockLabel}</p>
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-muted-foreground">上架中</p>
                  <p className="font-medium">{activeListings.length} 个平台记录</p>
                </div>
                <div>
                  <p className="text-muted-foreground">已售</p>
                  <p className="font-medium">{formatQuantity(soldQuantity)} 件</p>
                </div>
                <div>
                  <p className="text-muted-foreground">销售金额</p>
                  <p className="font-medium">{formatCurrency(salesAmount, salesCurrency)}</p>
                </div>
              </div>
              {attributes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {attributes.map((attribute) => (
                    <Badge key={attribute.key} variant="outline" className="text-xs">
                      {attribute.key}: {attribute.value}
                    </Badge>
                  ))}
                </div>
              )}
              {(sku.parentSku || sku.childSkus.length > 0) && (
                <div className="rounded-lg border bg-white/45 p-3 text-sm">
                  {sku.parentSku ? (
                    <p>
                      <span className="text-muted-foreground">父 SKU：</span>
                      <Link href={`/inventory/skus/${sku.parentSku.id}`} className="font-medium hover:underline">
                        {sku.parentSku.code} · {sku.parentSku.name}
                      </Link>
                    </p>
                  ) : (
                    <div>
                      <p className="text-muted-foreground">子 SKU / 角色款</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {sku.childSkus.map((child) => (
                          <Link key={child.id} href={`/inventory/skus/${child.id}`}>
                            <Badge variant="outline" className="font-mono hover:bg-muted">
                              {child.code}
                            </Badge>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* --- Performance Metrics --- */}
      <PerformanceSection metrics={sku.performanceMetrics} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Store className="h-4 w-4" />
              上架情况
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sku.listings.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <p className="font-medium">还没有上架记录</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  有可售库存后，可以直接从这里发起上架。
                </p>
              </div>
            ) : (
              sku.listings.slice(0, 5).map((listing) => (
                <div key={listing.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{listing.platform.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {listing.listedPrice && listing.currency
                        ? formatCurrency(listing.listedPrice.toString(), listing.currency)
                        : "未设置价格"}{" "}
                      · {new Date(listing.listedAt).toLocaleDateString("zh-CN")}
                    </p>
                  </div>
                  <Badge variant={listing.status === "ACTIVE" ? "default" : "outline"}>
                    {listingStatusLabels[listing.status] || listing.status}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-4 w-4" />
              最近业务记录
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium">最近采购</p>
              {recentPurchaseLines.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无采购记录</p>
              ) : (
                <div className="space-y-2">
                  {recentPurchaseLines.map((line) => (
                    <div key={line.id} className="flex items-center justify-between rounded-lg bg-white/45 px-3 py-2 text-sm">
                      <span>{line.purchaseOrder.orderNo}</span>
                      <span className="text-muted-foreground">
                        {formatQuantity(line.quantity.toString())} × {formatCurrency(line.unitPrice.toString(), line.purchaseOrder.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">最近销售</p>
              {recentSalesLines.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无已确认销售</p>
              ) : (
                <div className="space-y-2">
                  {recentSalesLines.map((line) => (
                    <div key={line.id} className="flex items-center justify-between rounded-lg bg-white/45 px-3 py-2 text-sm">
                      <span>{line.order.platform?.name || line.order.orderNumber}</span>
                      <span className="text-muted-foreground">
                        {formatQuantity(line.quantity.toString())} · {formatCurrency(line.lineAmount.toString(), line.order.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {(totalLots > 0 || totalItems > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Truck className="h-4 w-4" />
              库存明细
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <div>
              <h4 className="mb-2 font-medium">入库库存</h4>
              {totalLots === 0 ? (
                <p className="text-sm text-muted-foreground">暂无入库库存</p>
              ) : (
                <div className="space-y-2">
                  {sku.inventoryLots.slice(0, 5).map((lot) => (
                    <div key={lot.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="font-medium">{lot.location.name}</p>
                        <p className="text-sm text-muted-foreground">
                          可用 {formatQuantity(lot.availableQuantity)} · 成本 {lot.costCurrency} {lot.unitCost.toString()}
                        </p>
                      </div>
                      <Badge variant={lot.status === "ACTIVE" ? "default" : "outline"}>
                        {lot.status === "ACTIVE" ? "活跃" : "已消耗"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="mb-2 font-medium">单件商品</h4>
              {totalItems === 0 ? (
                <p className="text-sm text-muted-foreground">暂无单件商品</p>
              ) : (
                <div className="space-y-2">
                  {sku.itemUnits.slice(0, 5).map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="font-medium">{item.location.name}</p>
                        <p className="text-sm text-muted-foreground">
                          成本 {item.costCurrency} {item.unitCost.toString()}
                          {item.conditionGrade && ` · ${item.conditionGrade}`}
                        </p>
                      </div>
                      <Badge variant={item.status === "AVAILABLE" ? "default" : "outline"}>
                        {itemStatusLabels[item.status] || item.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
