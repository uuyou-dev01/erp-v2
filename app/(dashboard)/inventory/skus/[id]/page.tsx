import { getSKUParentOptions } from "@/app/actions/skus";
import { getSkuCatalogDetail } from "@/lib/application/sku-catalog";
import {
  catalogStatusLabel,
  productKindLabel,
} from "@/lib/application/sku-catalog";
import { SKUDetailActions } from "@/components/inventory/sku-detail-actions";
import { SKUReferencePanel } from "@/components/inventory/sku-reference-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductImage } from "@/components/ui/product-image";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  BarChart3,
  CircleDollarSign,
  GitBranch,
  History,
  PackageSearch,
  TrendingUp,
} from "lucide-react";
import { formatCurrency, formatQuantity } from "@/lib/decimal";

export const dynamic = "force-dynamic";

const STORE_ID = "store_1";

function safeReturnPath(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}

function formatDateLabel(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function MetricTile({
  label,
  value,
  subtext,
}: {
  label: string;
  value: React.ReactNode;
  subtext?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-card px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold leading-tight">{value}</p>
      {subtext ? (
        <p className="mt-1 truncate text-[11px] text-muted-foreground">{subtext}</p>
      ) : null}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}

export default async function SKUDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string; edit?: string }>;
}) {
  const { id } = await params;
  const { returnTo, edit } = await searchParams;
  const sku = await getSkuCatalogDetail(id);

  if (!sku) {
    notFound();
  }

  const parentOptions = await getSKUParentOptions(STORE_ID, sku.id);
  const variantEntries = Object.entries(sku.variantAttributes);
  const images = sku.meta.images ?? [];
  const returnHref = safeReturnPath(returnTo, "/inventory/skus");
  const coverUrl =
    images.find((i) => i.isCover)?.url ?? images[0]?.url ?? sku.imageUrl;
  const salesCurrency = sku.business.salesCurrency ?? sku.currency ?? "CNY";
  const profitCurrency = sku.analysis.profitOverview.currency ?? salesCurrency;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <Link href={returnHref} className="shrink-0">
            <Button variant="ghost" size="icon" className="mt-0.5 h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <ProductImage
            src={coverUrl}
            alt={sku.name}
            size="md"
            className="shrink-0 rounded-lg"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="font-mono text-[10px]">
                {sku.code}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {productKindLabel(sku.productKind)}
              </Badge>
              <Badge
                variant={sku.catalogStatus === "active" ? "default" : "secondary"}
                className="text-[10px]"
              >
                {catalogStatusLabel(sku.catalogStatus)}
              </Badge>
              {sku.category ? (
                <Badge variant="secondary" className="text-[10px]">
                  {sku.category}
                </Badge>
              ) : null}
              {sku.brand ? (
                <Badge className="text-[10px]">{sku.brand}</Badge>
              ) : null}
            </div>
            <h1 className="mt-1 text-xl font-semibold leading-tight">{sku.name}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              SKU 核心档案 · 价格、库存、上架、采购与销售分析
            </p>
          </div>
        </div>
        <SKUDetailActions
          storeId={STORE_ID}
          returnHref={returnHref}
          initialEditOpen={edit === "1"}
          sku={{
            id: sku.id,
            code: sku.code,
            name: sku.name,
            category: sku.category,
            brand: sku.brand,
            attributes: {
              ...sku.variantAttributes,
              catalogStatus: sku.meta.catalogStatus,
              productKind: sku.meta.productKind,
              referencePrice: sku.meta.referencePrice,
              referenceCost: sku.meta.referenceCost,
              currency: sku.meta.currency,
              tags: sku.meta.tags,
              series: sku.meta.series,
              notes: sku.meta.notes,
              images: sku.meta.images,
              newFields: sku.meta.newFields,
              usedFields: sku.meta.usedFields,
            },
            description: sku.description,
            imageUrl: sku.imageUrl,
            parentSkuId: sku.parentSkuId,
          }}
          parentOptions={parentOptions}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        <MetricTile
          label="可售"
          value={formatQuantity(sku.business.sellableQty)}
          subtext={`在途 ${formatQuantity(sku.business.inTransitQty)}`}
        />
        <MetricTile
          label="上架中"
          value={sku.business.activeListingCount}
          subtext={
            <Link
              href={`/listing?q=${encodeURIComponent(sku.code)}`}
              className="text-primary hover:underline"
            >
              查看上架
            </Link>
          }
        />
        <MetricTile
          label="近销价"
          value={
            sku.business.latestSalePrice
              ? formatCurrency(sku.business.latestSalePrice, salesCurrency)
              : "—"
          }
          subtext={`销售 ${sku.business.salesCount} 次`}
        />
        <MetricTile
          label="均价"
          value={
            sku.business.averageSalePrice
              ? formatCurrency(sku.business.averageSalePrice, salesCurrency)
              : "—"
          }
          subtext={sku.business.primaryPlatformName ?? "暂无主销平台"}
        />
        <MetricTile
          label="成交额"
          value={formatCurrency(sku.analysis.profitOverview.salesAmount, profitCurrency)}
          subtext={`成本匹配 ${sku.analysis.profitOverview.fulfilledLineCount} 笔`}
        />
        <MetricTile
          label="毛利"
          value={formatCurrency(sku.analysis.profitOverview.grossProfit, profitCurrency)}
          subtext={`${sku.analysis.profitOverview.profitRate}%`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium">基础信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {images.length > 1 ? (
                <div className="flex flex-wrap gap-2 border-b pb-3">
                  {images.map((img) => (
                    <div
                      key={img.url}
                      className="relative overflow-hidden rounded-md border"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt="" className="h-16 w-16 object-cover" />
                      {img.isCover ? (
                        <Badge className="absolute left-1 top-1 px-1 text-[9px]">
                          封面
                        </Badge>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <InfoCell label="系列" value={sku.series || sku.meta.series || "—"} />
                <InfoCell
                  label="参考售价"
                  value={
                    sku.referencePrice
                      ? formatCurrency(sku.referencePrice, sku.currency ?? "CNY")
                      : "—"
                  }
                />
                <InfoCell
                  label="参考成本"
                  value={
                    sku.meta.referenceCost
                      ? formatCurrency(sku.meta.referenceCost, sku.currency ?? "CNY")
                      : "—"
                  }
                />
                <InfoCell
                  label="标签"
                  value={sku.meta.tags?.length ? sku.meta.tags.join("、") : "—"}
                />
              </dl>
              {sku.description ? (
                <InfoCell label="描述" value={sku.description} />
              ) : null}
              {sku.meta.notes ? (
                <InfoCell label="备注" value={sku.meta.notes} />
              ) : null}
            </CardContent>
          </Card>

          {(sku.parentSku || sku.childSkus.length > 0 || variantEntries.length > 0) && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
                  <GitBranch className="h-3.5 w-3.5" />
                  变体与规格
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0 text-sm">
                {sku.parentSku ? (
                  <p>
                    <span className="text-muted-foreground">父 SKU：</span>
                    <Link
                      href={`/inventory/skus/${sku.parentSku.id}`}
                      className="font-medium hover:underline"
                    >
                      {sku.parentSku.code} · {sku.parentSku.name}
                    </Link>
                  </p>
                ) : null}
                {sku.childSkus.length > 0 ? (
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">子 SKU</p>
                    <div className="flex flex-wrap gap-1.5">
                      {sku.childSkus.map((child) => (
                        <Link key={child.id} href={`/inventory/skus/${child.id}`}>
                          <Badge
                            variant="outline"
                            className="font-mono text-xs hover:bg-muted"
                          >
                            {child.code}
                          </Badge>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
                {variantEntries.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {variantEntries.map(([key, value]) => (
                      <Badge key={key} variant="outline" className="text-xs">
                        {key}: {String(value)}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
                <PackageSearch className="h-3.5 w-3.5" />
                库存分布
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border px-3 py-2">
                  <p className="text-xs text-muted-foreground">可售库存</p>
                  <p className="mt-1 text-lg font-semibold">
                    {formatQuantity(sku.analysis.inventoryDistribution.sellableQty)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    批次{" "}
                    {formatQuantity(sku.analysis.inventoryDistribution.sellableLotQty)}
                    {" · 单件 "}
                    {sku.analysis.inventoryDistribution.sellableItemUnitCount}
                  </p>
                </div>
                <div className="rounded-md border px-3 py-2">
                  <p className="text-xs text-muted-foreground">在途库存</p>
                  <p className="mt-1 text-lg font-semibold">
                    {formatQuantity(sku.analysis.inventoryDistribution.inTransitQty)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    批次{" "}
                    {formatQuantity(sku.analysis.inventoryDistribution.inTransitLotQty)}
                    {" · 单件 "}
                    {sku.analysis.inventoryDistribution.inTransitItemUnitCount}
                  </p>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-medium">可售仓位</p>
                  {sku.analysis.inventoryDistribution.sellableLocations.length ? (
                    <ul className="space-y-1.5 text-sm">
                      {sku.analysis.inventoryDistribution.sellableLocations.map(
                        (location) => (
                          <li
                            key={location.locationId}
                            className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5"
                          >
                            <span className="min-w-0 truncate">
                              {location.name}
                              <span className="ml-1 text-xs text-muted-foreground">
                                {location.code}
                              </span>
                            </span>
                            <span className="shrink-0 font-medium">
                              {formatQuantity(location.qty)}
                            </span>
                          </li>
                        )
                      )}
                    </ul>
                  ) : (
                    <EmptyHint>暂无可售库存</EmptyHint>
                  )}
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium">在途/待转仓位</p>
                  {sku.analysis.inventoryDistribution.inTransitLocations.length ? (
                    <ul className="space-y-1.5 text-sm">
                      {sku.analysis.inventoryDistribution.inTransitLocations.map(
                        (location) => (
                          <li
                            key={location.locationId}
                            className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5"
                          >
                            <span className="min-w-0 truncate">
                              {location.name}
                              <span className="ml-1 text-xs text-muted-foreground">
                                {location.code}
                              </span>
                            </span>
                            <span className="shrink-0 font-medium">
                              {formatQuantity(location.qty)}
                            </span>
                          </li>
                        )
                      )}
                    </ul>
                  ) : (
                    <EmptyHint>暂无在途库存</EmptyHint>
                  )}
                </div>
              </div>
              <p className="rounded-md bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">
                销售收入仍归属 SKU / 订单行；批次成本来自 InventoryLot 分摊，单件成本来自 ItemUnit 分摊，ItemUnit 不作为独立核算商品。
              </p>
              <div className="grid gap-3 xl:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-medium">新品批次</p>
                  {sku.inventorySections.newStockLots.length ? (
                    <ul className="space-y-1.5 text-sm">
                      {sku.inventorySections.newStockLots.map((lot) => (
                        <li key={lot.id} className="rounded-md border px-2.5 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate font-medium">
                              {lot.batchLabel ?? lot.skuCode}
                            </span>
                            <span className="shrink-0 font-semibold">
                              {formatQuantity(lot.quantity)}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {lot.skuCode} · {lot.locationName} ·{" "}
                            {formatCurrency(lot.unitCost, lot.costCurrency)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyHint>暂无新品批次库存</EmptyHint>
                  )}
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium">单件库存</p>
                    <p className="text-[11px] text-muted-foreground">
                      可售 {sku.inventorySections.itemUnitSummary.sellableCount} · 待标签{" "}
                      {sku.inventorySections.itemUnitSummary.pendingLabelCount} · 待照片{" "}
                      {sku.inventorySections.itemUnitSummary.pendingPhotoCount}
                    </p>
                  </div>
                  {sku.inventorySections.itemUnits.length ? (
                    <ul className="space-y-1.5 text-sm">
                      {sku.inventorySections.itemUnits.slice(0, 8).map((unit) => (
                        <li key={unit.id} className="rounded-md border px-2.5 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate font-medium">
                              {unit.unitCode ?? unit.labelCode ?? unit.id.slice(-8)}
                            </span>
                            <Badge variant="outline" className="shrink-0 text-[10px]">
                              {unit.status}
                            </Badge>
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {unit.skuCode} · {unit.locationName} · 标签{" "}
                            {unit.labelStatus} · 照片 {unit.photoCount}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyHint>暂无单件库存</EmptyHint>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
                <BarChart3 className="h-3.5 w-3.5" />
                平台表现
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {sku.analysis.platformPerformance.length ? (
                <div className="grid gap-2">
                  {sku.analysis.platformPerformance.map((platform) => (
                    <div
                      key={platform.platformCode}
                      className="grid gap-2 rounded-md border px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{platform.platformName}</p>
                        <p className="text-xs text-muted-foreground">
                          最近 {formatDateLabel(platform.lastSoldAt)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">次数</p>
                        <p className="font-medium">{platform.salesCount}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">均价</p>
                        <p className="font-medium">
                          {platform.averagePrice
                            ? formatCurrency(platform.averagePrice, platform.currency)
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">成交额</p>
                        <p className="font-medium">
                          {formatCurrency(platform.totalAmount, platform.currency)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyHint>暂无有效销售记录</EmptyHint>
              )}

              {sku.analysis.activeListings.length ? (
                <div>
                  <p className="mb-1.5 text-xs font-medium">当前上架</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {sku.analysis.activeListings.map((listing) => (
                      <Link key={listing.id} href={`/listing/${listing.id}`}>
                        <div className="rounded-md border px-3 py-2 text-sm hover:bg-muted/50">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate font-medium">
                              {listing.platformName}
                            </p>
                            <Badge variant="outline" className="shrink-0 text-[10px]">
                              上架中
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {listing.skuCode ? `${listing.skuCode} · ` : ""}
                            {listing.unitCode ? `${listing.unitCode} · ` : ""}
                            标价{" "}
                            {listing.listedPrice
                              ? formatCurrency(
                                  listing.listedPrice,
                                  listing.currency ?? sku.currency ?? "CNY"
                                )
                              : "—"}
                            {" · 估净 "}
                            {listing.estimatedNet
                              ? formatCurrency(
                                  listing.estimatedNet,
                                  listing.currency ?? sku.currency ?? "CNY"
                                )
                              : "—"}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
                  <TrendingUp className="h-3.5 w-3.5" />
                  销售历史
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {sku.reference.recentSalesLines.length ? (
                  <ul className="space-y-1.5 text-sm">
                    {sku.reference.recentSalesLines.map((line) => (
                      <li
                        key={line.id}
                        className="rounded-md bg-muted/40 px-2.5 py-2"
                      >
                        <div className="flex justify-between gap-2">
                          <span className="truncate font-medium">
                            {line.orderNumber}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {formatDateLabel(line.orderDate)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {line.platformName ?? "未记录平台"} ·{" "}
                          {formatQuantity(line.quantity)} 件 ·{" "}
                          {formatCurrency(line.lineAmount, line.currency)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyHint>暂无销售历史</EmptyHint>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3">
                <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
                  <History className="h-3.5 w-3.5" />
                  采购历史
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {sku.reference.recentPurchaseLines.length ? (
                  <ul className="space-y-1.5 text-sm">
                    {sku.reference.recentPurchaseLines.map((line) => (
                      <li
                        key={line.id}
                        className="rounded-md bg-muted/40 px-2.5 py-2"
                      >
                        <div className="flex justify-between gap-2">
                          <span className="truncate font-medium">{line.orderNo}</span>
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {line.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDateLabel(line.orderedAt)} ·{" "}
                          {formatQuantity(line.quantity)} 件 ·{" "}
                          {formatCurrency(line.lineAmount, line.currency)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyHint>暂无采购历史</EmptyHint>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
                <CircleDollarSign className="h-3.5 w-3.5" />
                利润概览
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm">
              <InfoCell
                label="有效成交额"
                value={formatCurrency(
                  sku.analysis.profitOverview.salesAmount,
                  profitCurrency
                )}
              />
              <InfoCell
                label="已匹配成本销售额"
                value={formatCurrency(
                  sku.analysis.profitOverview.costMatchedSalesAmount,
                  profitCurrency
                )}
              />
              <InfoCell
                label="库存成本"
                value={formatCurrency(
                  sku.analysis.profitOverview.allocatedInventoryCost,
                  profitCurrency
                )}
              />
              <InfoCell
                label="毛利率"
                value={`${sku.analysis.profitOverview.profitRate}%`}
              />
              {sku.analysis.profitOverview.pendingCostLineCount > 0 ? (
                <p className="rounded-md bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">
                  还有 {sku.analysis.profitOverview.pendingCostLineCount} 笔销售未匹配库存成本。
                </p>
              ) : null}
            </CardContent>
          </Card>
          <SKUReferencePanel sku={sku} compact />
        </div>
      </div>
    </div>
  );
}
