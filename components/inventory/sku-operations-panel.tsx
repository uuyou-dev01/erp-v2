import { BarChart3, CircleDollarSign, Clock3, History, PackageCheck, Tags, TrendingUp } from "lucide-react";
import type { SkuCatalogDetail } from "@/lib/application/sku-catalog";
import { SkuSalesLifecycleChart } from "@/components/inventory/sku-sales-lifecycle-chart";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatQuantity } from "@/lib/decimal";
import Link from "next/link";

interface SkuOperationsPanelProps {
  sku: SkuCatalogDetail;
  variantFilter?: {
    label: string;
    addHref?: string;
    options: Array<{
      id: string;
      label: string;
      href: string;
      selected: boolean;
      meta: string;
    }>;
    selectedAttributes?: Array<{ label: string; value: string }>;
  };
}

function formatDateLabel(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function formatDaysToSell(value: number | null) {
  if (value === null) return "-";
  if (value === 0) return "当天";
  return `${value} 天`;
}

function OperationMetric({
  label,
  value,
  subtext,
}: {
  label: string;
  value: React.ReactNode;
  subtext?: React.ReactNode;
}) {
  return (
    <div className="rounded-md bg-white px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold leading-tight text-foreground">{value}</p>
      {subtext ? <p className="mt-1 truncate text-[11px] text-muted-foreground">{subtext}</p> : null}
    </div>
  );
}

function PriceMetric({
  label,
  value,
  subtext,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  subtext?: React.ReactNode;
  tone?: "default" | "green" | "amber" | "red" | "blue";
}) {
  const toneClass =
    tone === "green"
      ? "text-emerald-700"
      : tone === "amber"
        ? "text-amber-700"
        : tone === "red"
          ? "text-rose-700"
          : tone === "blue"
            ? "text-blue-700"
            : "text-slate-950";
  return (
    <div className="rounded-md bg-white px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`mt-1 text-base font-semibold leading-tight ${toneClass}`}>{value}</p>
      {subtext ? <p className="mt-1 truncate text-[11px] text-slate-500">{subtext}</p> : null}
    </div>
  );
}

function EmptyRows({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed px-3 py-5 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}

function buildSaleSignal(sku: SkuCatalogDetail) {
  const salesCount = sku.analysis.skuAverages.salesCount;
  const avgMonthlyQty = Number(sku.analysis.salesVelocity.averageMonthlyQty);
  const avgDaysToSell = sku.analysis.listingSellThrough.averageDaysToSell
    ? Number(sku.analysis.listingSellThrough.averageDaysToSell)
    : null;

  if (salesCount === 0) {
    return {
      label: "暂无验证",
      detail: "没有真实销售样本",
      tone: "default" as const,
    };
  }

  if ((avgDaysToSell !== null && avgDaysToSell <= 15) || avgMonthlyQty >= 4) {
    return {
      label: "好卖",
      detail: avgDaysToSell !== null ? `平均 ${avgDaysToSell.toFixed(1)} 天售出` : `月均 ${avgMonthlyQty.toFixed(2)} 件`,
      tone: "green" as const,
    };
  }

  if ((avgDaysToSell !== null && avgDaysToSell <= 45) || avgMonthlyQty >= 1) {
    return {
      label: "可观察",
      detail: avgDaysToSell !== null ? `平均 ${avgDaysToSell.toFixed(1)} 天售出` : `月均 ${avgMonthlyQty.toFixed(2)} 件`,
      tone: "amber" as const,
    };
  }

  return {
    label: "慢动销",
    detail: avgDaysToSell !== null ? `平均 ${avgDaysToSell.toFixed(1)} 天售出` : `月均 ${avgMonthlyQty.toFixed(2)} 件`,
    tone: "red" as const,
  };
}

export function SkuOperationsPanel({ sku, variantFilter }: SkuOperationsPanelProps) {
  const profitCurrency = sku.analysis.profitOverview.currency ?? sku.business.salesCurrency ?? sku.currency ?? "CNY";
  const itemSummary = sku.inventorySections.itemUnitSummary;
  const sellThrough = sku.analysis.listingSellThrough;
  const averages = sku.analysis.skuAverages;
  const salesCurrency = averages.salesCurrency ?? sku.business.salesCurrency ?? sku.currency ?? "CNY";
  const purchaseCurrency = averages.purchaseCurrency ?? sku.business.purchaseCurrency ?? sku.currency ?? "CNY";
  const saleSignal = buildSaleSignal(sku);
  const hasAnyRows =
    sku.inventorySections.newStockLots.length > 0 ||
    sku.inventorySections.itemUnits.length > 0 ||
    sku.analysis.activeListings.length > 0 ||
    sku.reference.recentSalesLines.length > 0 ||
    sku.reference.recentPurchaseLines.length > 0;

  return (
    <section className="overflow-hidden rounded-lg border border-blue-200 bg-white shadow-sm">
      <div className="border-b border-blue-100 bg-gradient-to-r from-white via-sky-50 to-white px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-950">SKU 经营表现</h2>
            <p className="mt-1 text-xs text-slate-500">
              当前选择 SKU 的真实采购、销售、动销和利润表现，不混入商品情报观察记录。
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="bg-white text-[10px]">
              {sku.code}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {saleSignal.label}
            </Badge>
          </div>
        </div>

        <div className="mt-3 rounded-md border border-blue-100 bg-white/80 p-2">
          {variantFilter ? (
            <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-blue-50 pb-2">
              <span className="text-xs font-medium text-slate-600">规格</span>
              {variantFilter.options.map((option) => (
                <Link
                  key={option.id}
                  href={option.href}
                  className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                    option.selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-white hover:bg-muted/60"
                  }`}
                >
                  <span className="font-medium">{option.label}</span>
                  <span
                    className={`ml-1 ${
                      option.selected ? "text-primary-foreground/80" : "text-muted-foreground"
                    }`}
                  >
                    {option.meta}
                  </span>
                </Link>
              ))}
              {variantFilter.addHref ? (
                <Link
                  href={variantFilter.addHref}
                  className="rounded-md border bg-white px-2.5 py-1 text-xs hover:bg-muted/60"
                >
                  + 新增规格
                </Link>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-600">样本</span>
            <span className="rounded-md border border-primary bg-primary/5 px-2.5 py-1 text-xs text-primary">
              成交 {averages.salesCount} 笔 / {formatQuantity(averages.soldQty)} 件
            </span>
            <span className="rounded-md border bg-white px-2.5 py-1 text-xs">
              采购 {averages.purchaseCount} 笔 / {formatQuantity(averages.purchasedQty)} 件
            </span>
            <span className="rounded-md border bg-white px-2.5 py-1 text-xs">
              平均售出 {sellThrough.averageDaysToSell ? `${sellThrough.averageDaysToSell} 天` : "-"}
            </span>
            <span className="rounded-md border bg-white px-2.5 py-1 text-xs">
              月均动销 {formatQuantity(sku.analysis.salesVelocity.averageMonthlyQty)}
            </span>
          </div>
          {variantFilter?.selectedAttributes?.length ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {variantFilter.selectedAttributes.map((item) => (
                <Badge key={`${item.label}:${item.value}`} variant="outline" className="bg-white text-[10px]">
                  {item.label}: {item.value}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
            <PriceMetric
              label="参考售价"
              value={sku.referencePrice ? formatCurrency(sku.referencePrice, sku.currency ?? salesCurrency) : "-"}
              subtext="档案维护价"
            />
            <PriceMetric
              label="平均成交价"
              value={averages.averageSalePrice ? formatCurrency(averages.averageSalePrice, salesCurrency) : "-"}
              subtext={averages.latestSalePrice ? `近销 ${formatCurrency(averages.latestSalePrice, salesCurrency)}` : "暂无成交"}
              tone="blue"
            />
            <PriceMetric
              label="成交低 / 高"
              value={
                averages.minSalePrice && averages.maxSalePrice
                  ? `${formatCurrency(averages.minSalePrice, salesCurrency)} - ${formatCurrency(averages.maxSalePrice, salesCurrency)}`
                  : "-"
              }
              subtext={`${averages.salesCount} 笔真实销售`}
            />
            <PriceMetric
              label="平均进价"
              value={averages.averagePurchasePrice ? formatCurrency(averages.averagePurchasePrice, purchaseCurrency) : "-"}
              subtext={
                averages.minPurchasePrice && averages.maxPurchasePrice
                  ? `${formatCurrency(averages.minPurchasePrice, purchaseCurrency)} - ${formatCurrency(averages.maxPurchasePrice, purchaseCurrency)}`
                  : "暂无采购"
              }
            />
            <PriceMetric
              label="平均毛利"
              value={averages.averageGrossProfit ? formatCurrency(averages.averageGrossProfit, profitCurrency) : "-"}
              subtext={averages.grossMarginRate ? `${averages.grossMarginRate}%` : "需成交/进价同币种"}
              tone={averages.averageGrossProfit && Number(averages.averageGrossProfit) > 0 ? "green" : "default"}
            />
            <PriceMetric
              label="好不好卖"
              value={saleSignal.label}
              subtext={saleSignal.detail}
              tone={saleSignal.tone}
            />
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          <OperationMetric
            label="月均动销"
            value={formatQuantity(sku.analysis.salesVelocity.averageMonthlyQty)}
            subtext={
              sku.analysis.salesVelocity.averageDaysBetweenSales
                ? `${sku.analysis.salesVelocity.averageDaysBetweenSales} 天/次`
                : "暂无节奏"
            }
          />
          <OperationMetric
            label="平均售出"
            value={sellThrough.averageDaysToSell ? `${sellThrough.averageDaysToSell} 天` : "-"}
            subtext={`匹配 ${sellThrough.matchedSaleCount}/${sellThrough.soldCount} 笔`}
          />
          <OperationMetric
            label="销售件数"
            value={formatQuantity(averages.soldQty)}
            subtext={`${averages.salesCount} 笔成交`}
          />
          <OperationMetric
            label="销售额"
            value={formatCurrency(sku.analysis.profitOverview.salesAmount, profitCurrency)}
            subtext={`毛利率 ${sku.analysis.profitOverview.profitRate}%`}
          />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50/70 px-4 py-3">
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-950">
                <TrendingUp className="h-3.5 w-3.5" />
                动销时间线
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                按真实销售订单汇总销售件数，并叠加当日新增上架数。
              </p>
            </div>
            <span className="rounded-md bg-white px-2 py-1 text-xs text-muted-foreground">
              {sku.analysis.salesTimeline.length} 个经营日期
            </span>
          </div>
          <div className="p-4">
            <SkuSalesLifecycleChart data={sku.analysis.salesTimeline} />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50/70 px-4 py-3">
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <Clock3 className="h-3.5 w-3.5" />
                上架到售出
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                优先按单件匹配；没有直接记录时，按同 SKU、同平台、售出日晚于上架日推断。
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
              <span className="rounded-md bg-white px-2 py-1">
                中位 {sellThrough.medianDaysToSell ? `${sellThrough.medianDaysToSell} 天` : "-"}
              </span>
              <span className="rounded-md bg-white px-2 py-1">
                最快 {formatDaysToSell(sellThrough.fastestDaysToSell)}
              </span>
              <span className="rounded-md bg-white px-2 py-1">
                最慢 {formatDaysToSell(sellThrough.slowestDaysToSell)}
              </span>
            </div>
          </div>
          <div className="p-4">
            {sku.analysis.listingLifecycle.length > 0 ? (
              <div className="overflow-x-auto">
                <Table className="min-w-[760px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>订单</TableHead>
                      <TableHead>平台</TableHead>
                      <TableHead>数量</TableHead>
                      <TableHead>金额</TableHead>
                      <TableHead>上架日</TableHead>
                      <TableHead>售出日</TableHead>
                      <TableHead>耗时</TableHead>
                      <TableHead>口径</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sku.analysis.listingLifecycle.slice(0, 8).map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="font-medium">{line.orderNumber}</TableCell>
                        <TableCell>{line.platformName ?? "未记录"}</TableCell>
                        <TableCell>{formatQuantity(line.quantity)}</TableCell>
                        <TableCell>{formatCurrency(line.lineAmount, line.currency)}</TableCell>
                        <TableCell>{formatDateLabel(line.listedAt)}</TableCell>
                        <TableCell>{formatDateLabel(line.soldAt)}</TableCell>
                        <TableCell>{formatDaysToSell(line.daysToSell)}</TableCell>
                        <TableCell>
                          <Badge variant={line.daysToSell === null ? "secondary" : "outline"} className="text-[10px]">
                            {line.matchQuality}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyRows>暂无可复盘的销售记录</EmptyRows>
            )}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b bg-slate-50/70 px-4 py-3">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <PackageCheck className="h-3.5 w-3.5" />
                仓库库存
              </h3>
              <span className="text-xs text-muted-foreground">
                批次 {sku.inventorySections.newStockLots.length} / 单件 {itemSummary.totalCount}
              </span>
            </div>
            <div className="space-y-3 p-4">
              {sku.inventorySections.newStockLots.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table className="min-w-[620px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>仓位</TableHead>
                        <TableHead>数量</TableHead>
                        <TableHead>成本</TableHead>
                        <TableHead>入库日</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sku.inventorySections.newStockLots.slice(0, 6).map((lot) => (
                        <TableRow key={lot.id}>
                          <TableCell>
                            <div className="font-medium">{lot.locationName}</div>
                            <div className="text-xs text-muted-foreground">{lot.batchLabel || lot.locationCode}</div>
                          </TableCell>
                          <TableCell>{formatQuantity(lot.quantity)}</TableCell>
                          <TableCell>{formatCurrency(lot.unitCost, lot.costCurrency)}</TableCell>
                          <TableCell>{formatDateLabel(lot.receivedAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}

              {sku.inventorySections.itemUnits.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {sku.inventorySections.itemUnits.slice(0, 6).map((unit) => (
                    <div key={unit.id} className="rounded-md border px-2.5 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{unit.unitCode || unit.labelCode || "单件商品"}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {unit.status}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-muted-foreground">{unit.locationName}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {!sku.inventorySections.newStockLots.length && !sku.inventorySections.itemUnits.length ? (
                <EmptyRows>暂无仓库库存</EmptyRows>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b bg-slate-50/70 px-4 py-3">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <Tags className="h-3.5 w-3.5" />
                上架记录
              </h3>
              <span className="text-xs text-muted-foreground">{sku.analysis.activeListings.length} 条 ACTIVE</span>
            </div>
            <div className="p-4">
              {sku.analysis.activeListings.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table className="min-w-[620px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>平台</TableHead>
                        <TableHead>对象</TableHead>
                        <TableHead>挂牌价</TableHead>
                        <TableHead>上架日</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sku.analysis.activeListings.slice(0, 8).map((listing) => (
                        <TableRow key={listing.id}>
                          <TableCell className="font-medium">{listing.platformName}</TableCell>
                          <TableCell>{listing.listingType === "ITEM_UNIT" ? listing.unitCode || "单件" : listing.skuCode}</TableCell>
                          <TableCell>
                            {listing.listedPrice
                              ? formatCurrency(listing.listedPrice, listing.currency ?? "CNY")
                              : "-"}
                          </TableCell>
                          <TableCell>{formatDateLabel(listing.listedAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyRows>暂无有效上架记录</EmptyRows>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b bg-slate-50/70 px-4 py-3">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <BarChart3 className="h-3.5 w-3.5" />
                销售记录
              </h3>
              <span className="text-xs text-muted-foreground">{sku.reference.salesLineCount} 笔</span>
            </div>
            <div className="p-4">
              {sku.reference.recentSalesLines.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table className="min-w-[620px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>订单</TableHead>
                        <TableHead>平台</TableHead>
                        <TableHead>数量</TableHead>
                        <TableHead>金额</TableHead>
                        <TableHead>日期</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sku.reference.recentSalesLines.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell className="font-medium">{line.orderNumber}</TableCell>
                          <TableCell>{line.platformName ?? "未记录"}</TableCell>
                          <TableCell>{formatQuantity(line.quantity)}</TableCell>
                          <TableCell>{formatCurrency(line.lineAmount, line.currency)}</TableCell>
                          <TableCell>{formatDateLabel(line.orderDate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyRows>暂无销售记录</EmptyRows>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b bg-slate-50/70 px-4 py-3">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <History className="h-3.5 w-3.5" />
                采购记录
              </h3>
              <span className="text-xs text-muted-foreground">{sku.reference.purchaseLineCount} 笔</span>
            </div>
            <div className="p-4">
              {sku.reference.recentPurchaseLines.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table className="min-w-[620px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>采购单</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>数量</TableHead>
                        <TableHead>金额</TableHead>
                        <TableHead>日期</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sku.reference.recentPurchaseLines.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell className="font-medium">{line.orderNo}</TableCell>
                          <TableCell>{line.status}</TableCell>
                          <TableCell>{formatQuantity(line.quantity)}</TableCell>
                          <TableCell>{formatCurrency(line.lineAmount, line.currency)}</TableCell>
                          <TableCell>{formatDateLabel(line.orderedAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyRows>暂无采购记录</EmptyRows>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b bg-slate-50/70 px-4 py-3">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <CircleDollarSign className="h-3.5 w-3.5" />
              利润与成本匹配
            </h3>
            <span className="text-xs text-muted-foreground">
              未匹配 {sku.analysis.profitOverview.pendingCostLineCount} 笔
            </span>
          </div>
          <div className="grid gap-2 p-4 sm:grid-cols-4">
            <OperationMetric
              label="已匹配销售额"
              value={formatCurrency(sku.analysis.profitOverview.costMatchedSalesAmount, profitCurrency)}
            />
            <OperationMetric
              label="库存成本"
              value={formatCurrency(sku.analysis.profitOverview.allocatedInventoryCost, profitCurrency)}
            />
            <OperationMetric
              label="毛利"
              value={formatCurrency(sku.analysis.profitOverview.grossProfit, profitCurrency)}
            />
            <OperationMetric
              label="毛利率"
              value={`${sku.analysis.profitOverview.profitRate}%`}
            />
          </div>
        </div>

        {!hasAnyRows ? (
          <p className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            这个 SKU 还没有产生本店经营记录，后续入库、上架和成交后会自动沉淀到这里。
          </p>
        ) : null}
      </div>
    </section>
  );
}
