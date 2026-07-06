import { getSKUParentOptions } from "@/app/actions/skus";
import {
  catalogStatusLabel,
  getSkuCatalogDetail,
  type SkuCatalogDetail,
} from "@/lib/application/sku-catalog";
import { SKUDetailActions } from "@/components/inventory/sku-detail-actions";
import { SkuPriceHistoryChart } from "@/components/inventory/sku-price-history-chart";
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

function wordParts(value: string) {
  return value
    .replace(/[·・|/：:()（）]/g, " ")
    .replace(/[-_]/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function variantDisplayName(parent: SkuCatalogDetail, child: SkuCatalogDetail) {
  if (child.variantLabel) return child.variantLabel;

  const raw = child.name.trim();
  const prefixes = [parent.name, parent.series, parent.meta.series]
    .filter((item): item is string => Boolean(item?.trim()))
    .sort((a, b) => b.length - a.length);

  for (const prefix of prefixes) {
    if (!raw.startsWith(prefix) || raw.length <= prefix.length) continue;
    const stripped = raw
      .slice(prefix.length)
      .replace(/^[\s·・\-_:：|/]+/, "")
      .trim();
    if (stripped) return stripped;
  }

  const rawWords = wordParts(raw);
  const parentWords = wordParts(parent.name);
  let commonCount = 0;
  while (
    commonCount < rawWords.length &&
    commonCount < parentWords.length &&
    rawWords[commonCount].toLowerCase() === parentWords[commonCount].toLowerCase()
  ) {
    commonCount += 1;
  }
  if (commonCount >= 2 && commonCount < rawWords.length) {
    return rawWords.slice(commonCount).join(" ");
  }

  const variantValues = Object.entries(child.variantAttributes)
    .filter(([key, value]) => {
      const normalized = `${key}:${String(value)}`.toLowerCase();
      return !/(condition|品相|状态|new|全新)/.test(normalized);
    })
    .map(([, value]) => String(value).trim())
    .filter(Boolean);
  if (variantValues.length > 0) return variantValues.slice(0, 2).join(" / ");

  return raw;
}

export default async function SKUDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string; edit?: string; variantId?: string }>;
}) {
  const { id } = await params;
  const { returnTo, edit, variantId } = await searchParams;
  const sku = await getSkuCatalogDetail(id);

  if (!sku) {
    notFound();
  }

  const isProductGroup = sku.catalogRole === "GROUP" || (!sku.parentSkuId && sku.childSkus.length > 0);
  const childDetails = isProductGroup
    ? (
        await Promise.all(sku.childSkus.map((child) => getSkuCatalogDetail(child.id)))
      ).filter((child): child is SkuCatalogDetail => Boolean(child))
    : [];
  const selectedVariant =
    childDetails.find((child) => child.id === variantId) ?? childDetails[0] ?? null;
  const displaySku = selectedVariant ?? sku;
  const isViewingChildFromParent = Boolean(selectedVariant);

  const parentOptions = await getSKUParentOptions(STORE_ID, displaySku.id);
  const variantEntries = Object.entries(displaySku.variantAttributes);
  const images = displaySku.meta.images ?? [];
  const returnHref = safeReturnPath(returnTo, "/inventory/skus");
  const actionReturnHref = isViewingChildFromParent
    ? `/inventory/skus/${sku.id}`
    : returnHref;
  const coverUrl =
    images.find((i) => i.isCover)?.url ?? images[0]?.url ?? displaySku.imageUrl;
  const salesCurrency = displaySku.business.salesCurrency ?? displaySku.currency ?? "CNY";
  const profitCurrency = displaySku.analysis.profitOverview.currency ?? salesCurrency;
  const selectedVariantName = isViewingChildFromParent
    ? variantDisplayName(sku, displaySku)
    : null;
  const variantHref = (childId: string) => {
    const query = new URLSearchParams({ variantId: childId });
    if (returnTo) query.set("returnTo", returnTo);
    return `/inventory/skus/${sku.id}?${query.toString()}`;
  };

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
            alt={displaySku.name}
            size="md"
            className="shrink-0 rounded-lg"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant="outline"
                className={`text-[10px] ${
                  selectedVariantName ? "" : "font-mono"
                }`}
              >
                {selectedVariantName
                  ? `变体：${selectedVariantName}`
                  : displaySku.code}
              </Badge>
              <Badge
                variant={displaySku.catalogStatus === "active" ? "default" : "secondary"}
                className="text-[10px]"
              >
                {catalogStatusLabel(displaySku.catalogStatus)}
              </Badge>
              {isViewingChildFromParent ? (
                <Badge variant="secondary" className="text-[10px]">
                  当前变体
                </Badge>
              ) : null}
              {displaySku.category ? (
                <Badge variant="secondary" className="text-[10px]">
                  {displaySku.category}
                </Badge>
              ) : null}
              {displaySku.brand ? (
                <Badge className="text-[10px]">{displaySku.brand}</Badge>
              ) : null}
            </div>
            <h1 className="mt-1 text-xl font-semibold leading-tight">
              {isViewingChildFromParent ? sku.name : displaySku.name}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {selectedVariantName ? `当前变体：${selectedVariantName} · ` : ""}
              {isProductGroup
                ? "商品组档案 · 选择规格查看采购、库存、上架与成交"
                : "SKU 商业档案 · 价格、采购均价、成交记录与利润表现"}
            </p>
          </div>
        </div>
        <SKUDetailActions
          storeId={STORE_ID}
          returnHref={actionReturnHref}
          initialEditOpen={edit === "1"}
          sku={{
            id: displaySku.id,
            code: displaySku.code,
            name: displaySku.name,
            catalogRole: displaySku.catalogRole,
            manufacturerCode: displaySku.manufacturerCode,
            variantLabel: displaySku.variantLabel,
            variantAxes: displaySku.variantAxes,
            variantValues: displaySku.variantValues,
            nameSource: displaySku.nameSource,
            codeSource: displaySku.codeSource,
            category: displaySku.category,
            brand: displaySku.brand,
            attributes: {
              ...displaySku.variantAttributes,
              catalogStatus: displaySku.meta.catalogStatus,
              productKind: displaySku.meta.productKind,
              referencePrice: displaySku.meta.referencePrice,
              referenceCost: displaySku.meta.referenceCost,
              currency: displaySku.meta.currency,
              tags: displaySku.meta.tags,
              series: displaySku.meta.series,
              notes: displaySku.meta.notes,
              images: displaySku.meta.images,
              newFields: displaySku.meta.newFields,
              usedFields: displaySku.meta.usedFields,
            },
            description: displaySku.description,
            imageUrl: displaySku.imageUrl,
            parentSkuId: displaySku.parentSkuId,
          }}
          parentOptions={parentOptions}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        <MetricTile
          label="参考售价"
          value={
            displaySku.referencePrice
              ? formatCurrency(displaySku.referencePrice, displaySku.currency ?? salesCurrency)
              : "—"
          }
          subtext="档案维护价"
        />
        <MetricTile
          label="平均进货价"
          value={
            displaySku.business.averagePurchasePrice
              ? formatCurrency(
                  displaySku.business.averagePurchasePrice,
                  displaySku.business.purchaseCurrency ?? salesCurrency
                )
              : "—"
          }
          subtext={`采购 ${displaySku.reference.purchaseLineCount} 笔`}
        />
        <MetricTile
          label="近销价"
          value={
            displaySku.business.latestSalePrice
              ? formatCurrency(displaySku.business.latestSalePrice, salesCurrency)
              : "—"
          }
          subtext={`销售 ${displaySku.business.salesCount} 次`}
        />
        <MetricTile
          label="均价"
          value={
            displaySku.business.averageSalePrice
              ? formatCurrency(displaySku.business.averageSalePrice, salesCurrency)
              : "—"
          }
          subtext={displaySku.business.primaryPlatformName ?? "暂无主销平台"}
        />
        <MetricTile
          label="成交额"
          value={formatCurrency(
            displaySku.analysis.profitOverview.salesAmount,
            profitCurrency
          )}
          subtext={`成本匹配 ${displaySku.analysis.profitOverview.fulfilledLineCount} 笔`}
        />
        <MetricTile
          label="估算单件毛利"
          value={
            displaySku.business.grossProfitPerUnit
              ? formatCurrency(displaySku.business.grossProfitPerUnit, profitCurrency)
              : "—"
          }
          subtext={
            displaySku.business.grossMarginRate
              ? `${displaySku.business.grossMarginRate}%`
              : "成交价/进货价币种不一致时不估算"
          }
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
                <InfoCell
                  label="系列"
                  value={displaySku.series || displaySku.meta.series || "—"}
                />
                <InfoCell
                  label="参考售价"
                  value={
                    displaySku.referencePrice
                      ? formatCurrency(
                          displaySku.referencePrice,
                          displaySku.currency ?? "CNY"
                        )
                      : "—"
                  }
                />
                <InfoCell
                  label="参考成本"
                  value={
                    displaySku.meta.referenceCost
                      ? formatCurrency(
                          displaySku.meta.referenceCost,
                          displaySku.currency ?? "CNY"
                        )
                      : "—"
                  }
                />
                <InfoCell
                  label="标签"
                  value={
                    displaySku.meta.tags?.length ? displaySku.meta.tags.join("、") : "—"
                  }
                />
              </dl>
              {displaySku.description ? (
                <InfoCell label="描述" value={displaySku.description} />
              ) : null}
              {displaySku.meta.notes ? (
                <InfoCell label="备注" value={displaySku.meta.notes} />
              ) : null}
            </CardContent>
          </Card>

          {(isProductGroup ||
            displaySku.parentSku ||
            variantEntries.length > 0) && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
                  <GitBranch className="h-3.5 w-3.5" />
                  变体与规格
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0 text-sm">
                {isProductGroup ? (
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        选择一个规格查看价格、采购、成交与利润
                      </p>
                      <Link href={`/inventory/skus/new?mode=variant&parentSkuId=${sku.id}`}>
                        <Button variant="outline" size="sm" className="h-8">
                          新增规格
                        </Button>
                      </Link>
                    </div>
                    {childDetails.length > 0 ? (
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {childDetails.map((child) => {
                          const selected = child.id === displaySku.id;
                          return (
                            <Link
                              key={child.id}
                              href={variantHref(child.id)}
                              className={`rounded-md border px-3 py-2 transition-colors ${
                                selected
                                  ? "border-primary bg-primary/5"
                                  : "hover:bg-muted/60"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="min-w-0 truncate font-medium">
                                  {variantDisplayName(sku, child)}
                                </span>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  成交 {child.business.salesCount} 次
                                </span>
                              </div>
                              <p className="mt-1 truncate text-xs text-muted-foreground">
                                {child.business.averageSalePrice
                                  ? `均价 ${formatCurrency(
                                      child.business.averageSalePrice,
                                      child.business.salesCurrency ?? child.currency ?? "CNY"
                                    )}`
                                  : "暂无成交价"}
                              </p>
                            </Link>
                          );
                        })}
                      </div>
                    ) : (
                      <EmptyHint>这个商品组还没有规格 SKU</EmptyHint>
                    )}
                  </div>
                ) : null}
                {displaySku.parentSku ? (
                  <p>
                    <span className="text-muted-foreground">归属商品组：</span>
                    <Link
                      href={`/inventory/skus/${displaySku.parentSku.id}`}
                      className="font-medium hover:underline"
                    >
                      {displaySku.parentSku.name}
                    </Link>
                  </p>
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
                <TrendingUp className="h-3.5 w-3.5" />
                价格走势
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <SkuPriceHistoryChart data={displaySku.analysis.priceHistory} />
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
              {displaySku.analysis.platformPerformance.length ? (
                <div className="grid gap-2">
                  {displaySku.analysis.platformPerformance.map((platform) => (
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
                {displaySku.reference.recentSalesLines.length ? (
                  <ul className="space-y-1.5 text-sm">
                    {displaySku.reference.recentSalesLines.map((line) => (
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
                {displaySku.reference.recentPurchaseLines.length ? (
                  <ul className="space-y-1.5 text-sm">
                    {displaySku.reference.recentPurchaseLines.map((line) => (
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
                  displaySku.analysis.profitOverview.salesAmount,
                  profitCurrency
                )}
              />
              <InfoCell
                label="已匹配成本销售额"
                value={formatCurrency(
                  displaySku.analysis.profitOverview.costMatchedSalesAmount,
                  profitCurrency
                )}
              />
              <InfoCell
                label="库存成本"
                value={formatCurrency(
                  displaySku.analysis.profitOverview.allocatedInventoryCost,
                  profitCurrency
                )}
              />
              <InfoCell
                label="毛利率"
                value={`${displaySku.analysis.profitOverview.profitRate}%`}
              />
              {displaySku.analysis.profitOverview.pendingCostLineCount > 0 ? (
                <p className="rounded-md bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">
                  还有 {displaySku.analysis.profitOverview.pendingCostLineCount} 笔销售未匹配库存成本。
                </p>
              ) : null}
            </CardContent>
          </Card>
          <SKUReferencePanel sku={displaySku} compact />
        </div>
      </div>
    </div>
  );
}
