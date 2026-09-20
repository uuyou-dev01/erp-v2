"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, Plus, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductImage } from "@/components/ui/product-image";
import type {
  ListingCoverageProduct,
  ListingCoverageVariantRow,
} from "@/lib/application/listing-coverage";
import { type ReplenishmentPolicy } from "@/lib/application/replenishment";
import {
  formatReplenishmentCoverage,
  buildReplenishmentPoolGroups,
  countReplenishmentPoolGroups,
  replenishmentCategoryFor as categoryFor,
  isSlowReplenishmentRow as isSlow,
  isExcludedReplenishmentRow as isExcluded,
  type ReplenishmentPoolFilter as PoolFilter,
  type ReplenishmentPoolRow as PoolRow,
  type ReplenishmentPoolGroup as PoolGroup,
} from "@/lib/application/replenishment-view";
import { cn } from "@/lib/utils";

interface StockingPoolBoardProps {
  products: ListingCoverageProduct[];
  policy: ReplenishmentPolicy;
  marketLabel?: string;
}

const PAGE_SIZE = 25;
const POLICY_QUERY_KEYS = new Set(["leadDays", "bufferDays", "coverDays"]);
const FILTERS: { key: PoolFilter; label: string; activeClass: string }[] = [
  { key: "all", label: "全部商品组", activeClass: "border-primary text-primary" },
  { key: "urgent", label: "紧急补货", activeClass: "border-red-600 text-red-700" },
  { key: "soon", label: "即将补货", activeClass: "border-amber-600 text-amber-800" },
  { key: "healthy", label: "暂不需补", activeClass: "border-primary text-primary" },
  { key: "slow", label: "动销慢 / 库龄高", activeClass: "border-primary text-primary" },
  { key: "insufficient", label: "数据不足", activeClass: "border-primary text-primary" },
  { key: "excluded", label: "停用 / 中古", activeClass: "border-primary text-primary" },
];

function statusStyle(row: PoolRow) {
  switch (categoryFor(row)) {
    case "urgent":
      return "border-red-200 bg-red-50 text-red-700";
    case "soon":
      return "border-amber-200 bg-amber-50 text-amber-800";
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

function stockLabel(row: PoolRow) {
  if ((row.variant.catalogStatus ?? row.product.catalogStatus) === "disabled") return "已停用";
  if ((row.variant.productKind ?? row.product.productKind) === "USED") return "中古单件";
  return row.decision?.label ?? "数据待补充";
}

function dateLabel(value: string | null | undefined) {
  return value ? value.slice(0, 10).replace(/-/g, "/") : "—";
}

function dayQuantity(value: number) {
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function variantName(product: ListingCoverageProduct, variant: ListingCoverageVariantRow) {
  const prefix = `${product.skuName} `;
  return (
    variant.skuName.startsWith(prefix) ? variant.skuName.slice(prefix.length) : variant.skuName
  ).replace(/^[·・]\s*/, "");
}

export function StockingPoolBoard({ products, policy, marketLabel }: StockingPoolBoardProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<PoolFilter>("all");
  const [page, setPage] = useState(1);

  const viewFilters = useMemo(
    () => ({
      q: searchParams.get("q") ?? undefined,
      kind: searchParams.get("kind") ?? undefined,
      category: searchParams.get("category") ?? undefined,
      risk: searchParams.get("risk") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      stockType: searchParams.get("stockType") ?? undefined,
    }),
    [searchParams]
  );
  const groups = useMemo(
    () => buildReplenishmentPoolGroups(products, viewFilters),
    [products, viewFilters]
  );
  const counts = useMemo(() => countReplenishmentPoolGroups(groups), [groups]);
  const filteredGroups = useMemo(
    () => (filter === "all" ? groups : buildReplenishmentPoolGroups(products, viewFilters, filter)),
    [filter, groups, products, viewFilters]
  );
  const variantCount = groups.reduce((total, group) => total + group.rows.length, 0);
  const filteredVariantCount = filteredGroups.reduce(
    (total, group) => total + group.rows.length,
    0
  );
  const pageCount = Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * PAGE_SIZE;
  const pageGroups = filteredGroups.slice(firstIndex, firstIndex + PAGE_SIZE);
  const policyIsCustom = [...POLICY_QUERY_KEYS].some((key) => searchParams.has(key));
  const preservedParams = Array.from(searchParams.entries()).filter(
    ([key]) => !POLICY_QUERY_KEYS.has(key)
  );

  return (
    <section aria-label="经营池与补货预警" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div>
          <h2 className="text-base font-semibold">经营池与补货预警</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {marketLabel ?? "当前库存范围"} · 共 {groups.length} 个商品组 / {variantCount} 个规格。
            展开商品组查看各款补货建议，售罄待补的规格也会保留。
          </p>
        </div>
        <p className="pt-0.5 text-xs leading-5 text-muted-foreground">
          补货 {policy.leadTimeDays} 天 + 缓冲 {policy.safetyDays} 天 · 目标备货{" "}
          {policy.targetCoverDays} 天
          <span className="ml-2 rounded border px-1.5 py-0.5 text-[11px]">
            {policyIsCustom ? "本次规则" : "暂估规则"}
          </span>
        </p>
      </div>

      <details className="group rounded-lg border bg-background">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          调整补货周期与计算口径
          <ChevronDown
            className="ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="space-y-3 border-t px-3 py-3">
          <form action={pathname} method="get" className="flex flex-wrap items-end gap-3">
            {preservedParams.map(([name, value], index) => (
              <input key={`${name}-${index}`} type="hidden" name={name} value={value} />
            ))}
            <label className="space-y-1.5 text-xs">
              <span className="block">采购到可售（天）</span>
              <Input
                key={`lead-${policy.leadTimeDays}`}
                name="leadDays"
                type="number"
                min={1}
                max={180}
                step={1}
                required
                defaultValue={policy.leadTimeDays}
                className="h-8 w-32 text-xs"
              />
            </label>
            <label className="space-y-1.5 text-xs">
              <span className="block">安全缓冲（天）</span>
              <Input
                key={`buffer-${policy.safetyDays}`}
                name="bufferDays"
                type="number"
                min={0}
                max={60}
                step={1}
                required
                defaultValue={policy.safetyDays}
                className="h-8 w-32 text-xs"
              />
            </label>
            <label className="space-y-1.5 text-xs">
              <span className="block">目标备货（天）</span>
              <Input
                key={`cover-${policy.targetCoverDays}`}
                name="coverDays"
                type="number"
                min={1}
                max={180}
                step={1}
                required
                defaultValue={policy.targetCoverDays}
                className="h-8 w-32 text-xs"
              />
            </label>
            <Button type="submit" size="sm">
              应用规则
            </Button>
            <p className="pb-1 text-[11px] text-muted-foreground">
              按实际采购与运输时间调整；规则保留在当前页面链接中。
            </p>
          </form>
          <div className="grid gap-x-8 gap-y-2 border-t pt-3 text-xs leading-5 text-muted-foreground lg:grid-cols-2">
            <p>
              销量按具体规格统计并扣除实际退货。已分配或出库的销量归入来源仓，未分配的归入销售平台地区；选定仓位时只计能归属该仓的销量。
              日均取近 7 天与近 30 天较高值；还可售天数 = 扣除预留后的现货 ÷ 日均销量。
            </p>
            <p>
              采购与在途单独展示。仅明确预计在补货窗口内到货的数量抵扣计划补量；窗口取采购交期与现货覆盖天数的较长者。到货时间未知的库存需先核实。
            </p>
            <p>
              近 30 天至少销售 3 件且有 2 单才预测日期与数量，否则标明“小样本”。建议补量 = 日均
              ×（补货周期 + 安全缓冲 + 目标备货天数）− 现货 − 窗口内预计到货量，向上取整。
            </p>
            <p>
              停用与中古规格不自动建议补货。商品组只汇总当前筛选下的库存和销量，补货仍按规格独立计算；组内其他款的库存不会抵消缺货。可售天数展示组内最短值，不用合计库存估算。
            </p>
          </div>
        </div>
      </details>

      <div className="overflow-hidden rounded-lg border bg-background">
        <div className="overflow-x-auto border-b">
          <div className="flex min-w-max gap-4 px-3" aria-label="按经营状态筛选">
            {FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={filter === item.key}
                onClick={() => {
                  setFilter(item.key);
                  setPage(1);
                }}
                className={cn(
                  "flex min-h-11 items-center gap-1.5 border-b-2 px-1 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  filter === item.key
                    ? cn("font-medium", item.activeClass)
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
                <span className="tabular-nums">{counts[item.key]}</span>
              </button>
            ))}
          </div>
        </div>

        <p className="border-b bg-muted/15 px-3 py-2 text-[11px] leading-4 text-muted-foreground">
          分类数字为包含该状态的商品组数，同组可出现在多个分类。合计仅含当前筛选的规格。
        </p>

        {pageGroups.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <p className="text-sm font-medium">
              {groups.length === 0
                ? "当前筛选下没有可分析的商品组"
                : "当前没有包含这类规格的商品组"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {groups.length === 0
                ? "调整市场、仓位或搜索条件后查看。"
                : "可以切换到全部商品组，查看库存与销售依据。"}
            </p>
            {filter !== "all" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  setFilter("all");
                  setPage(1);
                }}
              >
                查看全部商品组
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <p className="border-b px-3 py-2 text-[11px] text-muted-foreground lg:hidden">
              左右滑动查看销量、补货时间和建议数量
            </p>
            <table className="w-full min-w-[1180px] border-collapse text-left text-xs">
              <caption className="sr-only">按商品组展示的库存与采购建议，展开查看具体规格</caption>
              <thead className="border-b bg-muted/35 text-[11px] text-muted-foreground">
                <tr>
                  <th scope="col" className="min-w-[260px] px-3 py-2.5 font-medium">
                    商品组 / 具体规格
                  </th>
                  <th scope="col" className="min-w-[116px] px-3 py-2.5 font-medium">
                    可售现货 / 待到货
                  </th>
                  <th scope="col" className="min-w-[94px] px-3 py-2.5 font-medium">
                    近 7 / 30 天销量
                  </th>
                  <th scope="col" className="min-w-[106px] px-3 py-2.5 font-medium">
                    现货还可售
                  </th>
                  <th scope="col" className="min-w-[108px] px-3 py-2.5 font-medium">
                    建议下单时间
                  </th>
                  <th scope="col" className="w-[230px] min-w-[210px] px-3 py-2.5 font-medium">
                    建议补量 / 依据
                  </th>
                  <th scope="col" className="w-[104px] px-3 py-2.5 font-medium">
                    操作
                  </th>
                </tr>
              </thead>
              {pageGroups.map((group) => (
                <PoolProductGroup key={`${filter}:${group.key}`} group={group} />
              ))}
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/15 px-3 py-2">
          <p className="text-[11px] text-muted-foreground" aria-live="polite">
            {filteredGroups.length > 0
              ? `第 ${firstIndex + 1}–${Math.min(firstIndex + PAGE_SIZE, filteredGroups.length)} 组，共 ${filteredGroups.length} 个商品组 / ${filteredVariantCount} 个规格`
              : "0 个商品组"}{" "}
            · 按组内最紧急规格排序
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2"
              aria-label="上一页商品组"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              上一页
            </Button>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {currentPage} / {pageCount}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2"
              aria-label="下一页商品组"
              disabled={currentPage >= pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              下一页
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function PoolProductGroup({ group }: { group: PoolGroup }) {
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const { product, rows } = group;
  const stateCounts = new Map<PoolFilter, number>();
  for (const row of rows) {
    const category = categoryFor(row);
    stateCounts.set(category, (stateCounts.get(category) ?? 0) + 1);
  }
  const attentionRows = rows.filter((row) => ["urgent", "soon"].includes(categoryFor(row)));
  const soldOutRows = attentionRows.filter((row) => row.decision?.status === "out_of_stock");
  const purchaseRows = attentionRows.filter((row) => row.decision?.suggestedQty !== 0);
  const pendingEstimate = purchaseRows.filter((row) => row.decision?.suggestedQty == null).length;
  const urgentPendingEstimate = purchaseRows.filter(
    (row) => categoryFor(row) === "urgent" && row.decision?.suggestedQty == null
  ).length;
  const followIncoming = attentionRows.length - purchaseRows.length;
  const suggestedQty = purchaseRows.reduce(
    (total, row) => total + (row.decision?.suggestedQty ?? 0),
    0
  );
  const stockQty = rows.reduce((total, row) => total + row.variant.sellableQty, 0);
  const onOrderQty = rows.reduce((total, row) => total + (row.decision?.onOrderQty ?? 0), 0);
  const inTransitQty = rows.reduce(
    (total, row) => total + (row.decision?.inTransitQty ?? row.variant.inTransitQty),
    0
  );
  const sales7 = rows.every((row) => row.decision)
    ? rows.reduce((total, row) => total + row.decision!.sales7Qty, 0)
    : null;
  const sales30 = rows.every((row) => row.decision || row.variant.stockingDecision)
    ? rows.reduce(
        (total, row) =>
          total + (row.decision?.sales30Qty ?? row.variant.stockingDecision!.sales30Qty),
        0
      )
    : null;
  const shortest = rows
    .filter((row) => !isExcluded(row) && row.decision?.coverageDays != null)
    .sort((a, b) => a.decision!.coverageDays! - b.decision!.coverageDays!)[0];
  const earliestOrder = (attentionRows.length > 0 ? purchaseRows : rows)
    .filter(
      (row) =>
        !isExcluded(row) &&
        row.decision?.suggestedQty !== 0 &&
        row.decision?.daysUntilReorder != null
    )
    .sort((a, b) => a.decision!.daysUntilReorder! - b.decision!.daysUntilReorder!)[0];
  const variantLabel =
    rows.length < group.totalVariantCount
      ? `${rows.length} / ${group.totalVariantCount} 个规格符合筛选`
      : `${rows.length} 个规格`;
  const groupStateLabels: Partial<Record<PoolFilter, string>> = {
    urgent: "紧急补货",
    soon: "即将补货",
    healthy: "暂不需补",
    slow: "动销慢 / 库龄高",
    insufficient: "数据不足",
    excluded: "停用 / 中古",
  };

  return (
    <>
      <tbody className="border-t first:border-t-0" data-product-group={group.key}>
        <tr className="align-top hover:bg-muted/15">
          <th scope="row" className="px-3 py-3 text-left font-normal">
            <div className="flex items-start gap-2">
              <button
                type="button"
                aria-label={`${expanded ? "收起" : "展开"}商品组 ${product.skuName}`}
                aria-expanded={expanded}
                aria-controls={detailId}
                onClick={() => setExpanded(!expanded)}
                className="-ml-1 mt-1 flex h-7 w-6 shrink-0 items-center justify-center rounded hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronRight
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform",
                    expanded && "rotate-90"
                  )}
                />
              </button>
              <ProductImage
                src={product.imageUrl ?? rows[0].variant.imageUrl}
                alt={product.skuName}
                size="sm"
                className="mt-0.5 shrink-0"
              />
              <div className="min-w-0 max-w-[330px]">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={detailId}
                  onClick={() => setExpanded(!expanded)}
                  className="text-left text-sm font-medium leading-5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {product.skuName}
                </button>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  {product.skuCode} · {variantLabel}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1">
                  {FILTERS.filter((item) => stateCounts.has(item.key)).map((item) => (
                    <span
                      key={item.key}
                      className={cn(
                        "text-[11px] leading-4",
                        item.key === "urgent"
                          ? "text-red-700"
                          : item.key === "soon"
                            ? "text-amber-800"
                            : "text-muted-foreground"
                      )}
                    >
                      {groupStateLabels[item.key]} {stateCounts.get(item.key)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </th>
          <td className="px-3 py-3 tabular-nums">
            <p className="text-sm font-medium leading-5">
              {stockQty} <span className="text-xs font-normal text-muted-foreground">件</span>
            </p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              采购 {onOrderQty} · 在途 {inTransitQty}
            </p>
          </td>
          <td className="px-3 py-3 tabular-nums">
            <p className="leading-5">
              <span className="font-medium">{sales7 ?? "—"}</span>
              <span className="mx-1.5 text-muted-foreground">/</span>
              {sales30 ?? "—"}
              <span className="ml-1 text-muted-foreground">件</span>
            </p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              {rows.length} 个规格合计
            </p>
          </td>
          <td className="px-3 py-3">
            <p
              className={cn(
                "font-medium leading-5",
                (soldOutRows.length > 0 || (shortest && categoryFor(shortest) === "urgent")) &&
                  "text-red-700",
                soldOutRows.length === 0 &&
                  shortest &&
                  categoryFor(shortest) === "soon" &&
                  "text-amber-800"
              )}
            >
              {soldOutRows.length > 0
                ? `${soldOutRows.length} 个规格已售罄`
                : shortest
                  ? formatReplenishmentCoverage(shortest.decision)
                  : "—"}
            </p>
            <p className="mt-1 max-w-[150px] text-[11px] leading-4 text-muted-foreground">
              {soldOutRows.length > 0
                ? `售罄 · ${variantName(product, soldOutRows[0].variant)}${soldOutRows.length > 1 ? "等" : ""}`
                : shortest
                  ? `最短 · ${variantName(product, shortest.variant)}`
                  : "暂无可估算的规格"}
            </p>
          </td>
          <td className="px-3 py-3">
            <p className="font-medium leading-5">
              {urgentPendingEstimate > 0
                ? "需人工确认"
                : earliestOrder
                  ? earliestOrder.decision!.daysUntilReorder! <= 0
                    ? "现在安排"
                    : dateLabel(earliestOrder.decision?.reorderByDate)
                  : pendingEstimate > 0
                    ? "需人工确认"
                    : followIncoming > 0
                      ? "跟进到货"
                      : "—"}
            </p>
            <p className="mt-1 max-w-[150px] text-[11px] leading-4 text-muted-foreground">
              {urgentPendingEstimate > 0
                ? `${urgentPendingEstimate} 个缺货规格待估算`
                : earliestOrder
                  ? `最早 · ${variantName(product, earliestOrder.variant)}`
                  : attentionRows.length > 0
                    ? `${attentionRows.length} 个规格需关注`
                    : "按规格独立判断"}
            </p>
          </td>
          <td className="px-3 py-3">
            <p className="font-medium leading-5">
              {suggestedQty > 0
                ? `${suggestedQty} 件`
                : pendingEstimate > 0
                  ? "待估算"
                  : followIncoming > 0
                    ? "已安排到货"
                    : "—"}
              {suggestedQty > 0 && (
                <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                  需补规格合计
                </span>
              )}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              {purchaseRows.length > 0
                ? `${purchaseRows.length} 个规格待补，展开查看`
                : followIncoming > 0
                  ? `${followIncoming} 个规格需跟进到货`
                  : "展开查看各规格依据"}
            </p>
            {pendingEstimate > 0 && (
              <p className="mt-1 text-[11px] leading-4 text-amber-800">
                {pendingEstimate} 个规格样本不足，补量待确认
              </p>
            )}
            {followIncoming > 0 && purchaseRows.length > 0 && (
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                另 {followIncoming} 个规格已安排到货
              </p>
            )}
          </td>
          <td className="px-3 py-3">
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={detailId}
              onClick={() => setExpanded(!expanded)}
              className="inline-flex min-h-7 items-center gap-1 whitespace-nowrap text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {expanded ? "收起规格" : "展开规格"}
              <ChevronDown className={cn("h-3 w-3", expanded && "rotate-180")} />
            </button>
          </td>
        </tr>
      </tbody>
      <tbody id={detailId} hidden={!expanded}>
        {expanded && rows.map((row) => <PoolVariantRow key={row.variant.skuId} row={row} />)}
      </tbody>
    </>
  );
}

function PoolVariantRow({ row }: { row: PoolRow }) {
  const { product, variant, decision } = row;
  const stocking = variant.stockingDecision;
  const name = variantName(product, variant);
  const category = categoryFor(row);
  const needsAttention = !isExcluded(row) && (category === "urgent" || category === "soon");
  const needsPurchase = needsAttention && decision?.suggestedQty !== 0;
  const incomingQty =
    (decision?.onOrderQty ?? 0) + (decision?.inTransitQty ?? variant.inTransitQty);
  const uncertainIncoming = incomingQty > (decision?.timelyIncomingQty ?? 0);
  const skuHref = `/inventory/skus/${encodeURIComponent(variant.skuId)}`;
  const purchaseQuery = new URLSearchParams({ skuId: variant.skuId });
  if (decision?.suggestedQty && decision.suggestedQty > 0) {
    purchaseQuery.set("quantity", String(decision.suggestedQty));
  }
  const purchaseHref = `/procurement/new?${purchaseQuery.toString()}`;
  return (
    <tr
      data-variant-row={variant.skuId}
      className="border-t border-border/60 bg-muted/20 align-top hover:bg-muted/35"
    >
      <td className="py-2 pl-[104px] pr-3">
        <div className="flex items-start gap-2.5">
          <div className="min-w-0 max-w-[330px] space-y-0.5">
            <Link
              href={skuHref}
              className="block text-xs font-normal leading-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {name}
            </Link>
            <p className="text-[11px] leading-4 text-muted-foreground">{variant.skuCode}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant="outline"
                className={cn("px-1.5 py-0 text-[10px] leading-5", statusStyle(row))}
              >
                {stockLabel(row)}
              </Badge>
              {isSlow(row) && (
                <span className="text-[10px] text-muted-foreground">
                  {stocking?.pool === "clearance" ? "库龄偏高" : "动销偏慢"}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2 tabular-nums">
        <p
          className={cn(
            "font-medium leading-5",
            variant.sellableQty === 0 && category === "urgent" && "text-red-700"
          )}
        >
          {variant.sellableQty} <span className="font-normal text-muted-foreground">件</span>
        </p>
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
          采购 {decision?.onOrderQty ?? 0} · 在途 {decision?.inTransitQty ?? variant.inTransitQty}
        </p>
        {variant.incomingSummary?.nextArrivalDate && (
          <p className="mt-1 text-[11px] leading-4" title={variant.incomingSummary.nextArrivalDate}>
            预计 {variant.incomingSummary.nextArrivalDate.slice(5).replace("-", "/")} 到货
          </p>
        )}
        {(variant.incomingSummary?.unknownEtaQty ?? 0) > 0 && (
          <p className="mt-1 text-[10px] leading-4 text-amber-800">
            {variant.incomingSummary!.unknownEtaQty} 件交期待确认
          </p>
        )}
        {(variant.incomingSummary?.overdueQty ?? 0) > 0 && (
          <p className="mt-1 text-[10px] leading-4 text-red-700">
            {variant.incomingSummary!.overdueQty} 件到货已超期
          </p>
        )}
        {!variant.incomingSummary && uncertainIncoming && (
          <p className="mt-1 text-[10px] leading-4 text-amber-800">部分到货需核实</p>
        )}
      </td>
      <td className="px-3 py-2 tabular-nums">
        <p className="leading-5">
          <span className="font-medium">{decision?.sales7Qty ?? "—"}</span>
          <span className="mx-1.5 text-muted-foreground">/</span>
          <span>{decision?.sales30Qty ?? stocking?.sales30Qty ?? "—"}</span>
          <span className="ml-1 text-muted-foreground">件</span>
        </p>
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
          30 天 {decision?.orderCount30 ?? "—"} 单
        </p>
        {decision?.confidence === "low" && decision.sales30Qty > 0 && (
          <p className="mt-1 text-[10px] text-amber-800">小样本</p>
        )}
      </td>
      <td className="px-3 py-2 tabular-nums">
        <p
          className={cn(
            "font-medium leading-5",
            category === "urgent" && "text-red-700",
            category === "soon" && "text-amber-800"
          )}
        >
          {formatReplenishmentCoverage(decision)}
        </p>
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
          {decision && decision.dailySales > 0
            ? `日均 ${dayQuantity(decision.dailySales)} 件`
            : "暂无稳定动销"}
        </p>
        {stocking?.oldestStockAgeDays !== null && stocking?.oldestStockAgeDays !== undefined && (
          <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
            最老库龄 {stocking.oldestStockAgeDays} 天
          </p>
        )}
      </td>
      <td className="px-3 py-2 tabular-nums">
        <p className={cn("leading-5", needsAttention && "font-medium")}>
          {needsAttention && decision?.suggestedQty === 0
            ? "跟进到货"
            : decision?.daysUntilReorder != null && decision.daysUntilReorder <= 0
              ? "现在安排"
              : dateLabel(decision?.reorderByDate)}
        </p>
        <p
          className={cn(
            "mt-1 text-[11px] leading-4",
            category === "urgent" ? "text-red-700" : "text-muted-foreground"
          )}
        >
          {decision?.daysUntilReorder === null || decision?.daysUntilReorder === undefined
            ? "暂无法估算"
            : decision.daysUntilReorder <= 0
              ? "已到补货点"
              : `约 ${Math.floor(decision.daysUntilReorder)} 天后`}
        </p>
      </td>
      <td className="px-3 py-2">
        <p className="leading-5">
          <span className="font-medium tabular-nums">
            {isExcluded(row) ||
            decision?.suggestedQty === null ||
            decision?.suggestedQty === undefined
              ? "—"
              : `${decision.suggestedQty} 件`}
          </span>
          {decision?.suggestedQty !== null &&
            decision?.suggestedQty !== undefined &&
            !isExcluded(row) && (
              <span className="ml-2 text-[11px] text-muted-foreground">
                {decision.suggestedQty > 0
                  ? "建议量"
                  : decision.timelyIncomingQty > 0
                    ? "已安排到货"
                    : "暂不追加"}
              </span>
            )}
        </p>
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
          {decision?.action ?? "先补充有效销售记录"}
        </p>
        <details className="mt-1 text-[11px] leading-5">
          <summary className="w-fit cursor-pointer text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">
            查看依据
          </summary>
          <div className="mt-1 space-y-1 rounded bg-muted/35 p-2 text-muted-foreground">
            <p>{decision?.reason ?? "当前没有足够数据形成补货建议。"}</p>
            {decision?.projectedStockoutDate && (
              <p>按现货预计售罄：{dateLabel(decision.projectedStockoutDate)}</p>
            )}
            {decision?.reorderByDate && (
              <p>按周期计算的下单点：{dateLabel(decision.reorderByDate)}</p>
            )}
            {decision && incomingQty > 0 && (
              <p>
                窗口内预计到货 {decision.timelyIncomingQty} 件，其余{" "}
                {Math.max(0, incomingQty - decision.timelyIncomingQty)}{" "}
                件未抵扣，需核对到货窗口与仓位。
              </p>
            )}
            {isSlow(row) && stocking && <p>{stocking.reason}</p>}
          </div>
        </details>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col items-start gap-2">
          {needsPurchase && (
            <Link
              href={purchaseHref}
              className="inline-flex min-h-7 items-center gap-1 whitespace-nowrap text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              登记采购
            </Link>
          )}
          <Link
            href={skuHref}
            className="inline-flex min-h-7 items-center whitespace-nowrap text-xs text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            查看规格
          </Link>
        </div>
      </td>
    </tr>
  );
}
