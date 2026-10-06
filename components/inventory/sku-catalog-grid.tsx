"use client";
import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Box, Search, ChevronDown, ChevronRight } from "lucide-react";
import Decimal from "decimal.js";
import {
  buildSkuCatalogDisplayGroups,
  type SkuCatalogDisplayGroup,
} from "@/lib/application/catalog-display-groups";
import {
  catalogPriceRanges,
  combineCatalogOperations,
  type CatalogPrice,
} from "@/lib/application/catalog-operations";
import type { SkuCatalogListItem } from "@/lib/application/sku-catalog";
import { SkuCatalogRowActions } from "./sku-catalog-row-actions";
import { bulkUpdateSkuCatalogAction } from "@/app/actions/skus";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ProductImage } from "@/components/ui/product-image";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatQuantity } from "@/lib/decimal";

type Period = { range: string; from: string; to: string; error: string | null };
interface SkuCatalogGridProps {
  items: SkuCatalogListItem[];
  period?: Period;
  initialView?: "stock" | "business";
}
function dateLabel(date: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}
function Prices({ values, empty }: { values: CatalogPrice[]; empty: string }) {
  const ranges = catalogPriceRanges(values);
  return ranges.length ? (
    <>
      {ranges.map((v) => (
        <p key={v.currency} className="whitespace-nowrap tabular-nums">
          {formatCurrency(v.min, v.currency)}
          {v.min !== v.max ? ` ～ ${formatCurrency(v.max, v.currency)}` : ""}
        </p>
      ))}
    </>
  ) : (
    <span className="text-xs text-muted-foreground">{empty}</span>
  );
}
function words(value: string) {
  return value
    .replace(/[·・|/：:()（）]/g, " ")
    .replace(/[-_]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
}

function compactVariantName(group: SkuCatalogDisplayGroup, variant: SkuCatalogListItem) {
  if (variant.variantLabel) return variant.variantLabel;

  const raw = variant.name.trim();
  const directPrefixes = [group.displayName, group.head.name, group.head.series]
    .filter((item): item is string => Boolean(item?.trim()))
    .sort((a, b) => b.length - a.length);

  for (const prefix of directPrefixes) {
    if (!raw.startsWith(prefix) || raw.length <= prefix.length) continue;
    const stripped = raw
      .slice(prefix.length)
      .replace(/^[\s·・\-_:：|/]+/, "")
      .trim();
    if (stripped) return stripped;
  }

  const rawWords = words(raw);
  const groupWords = words(group.displayName);
  let commonCount = 0;
  while (
    commonCount < rawWords.length &&
    commonCount < groupWords.length &&
    rawWords[commonCount].toLowerCase() === groupWords[commonCount].toLowerCase()
  ) {
    commonCount += 1;
  }

  if (commonCount >= 2 && commonCount < rawWords.length) {
    return rawWords.slice(commonCount).join(" ");
  }

  return raw;
}

export function SkuCatalogGrid({ items, period, initialView = "stock" }: SkuCatalogGridProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const updateFilter = (key: string, value: string, reset = true) => {
    const params = new URLSearchParams(window.location.search);
    params.set(key, value);
    if (reset) params.delete("page");
    window.history.replaceState(null, "", `?${params.toString()}`);
  };
  const query = searchParams.get("q") ?? "";
  const status = searchParams.get("status") ?? "active";
  const brand = searchParams.get("brand") ?? "";
  const category = searchParams.get("category") ?? "";
  const view = searchParams.has("view")
    ? searchParams.get("view") === "business"
      ? "business"
      : "stock"
    : initialView;
  const setQuery = (value: string) => updateFilter("q", value);
  const setStatus = (value: string) => updateFilter("status", value);
  const setBrand = (value: string) => updateFilter("brand", value);
  const setCategory = (value: string) => updateFilter("category", value);
  const setView = (value: string) => updateFilter("view", value, false);
  const returnHref = `/inventory/skus?${searchParams.toString()}`;
  const detailHref = (id: string) =>
    `/inventory/skus/${id}?returnTo=${encodeURIComponent(returnHref)}`;
  const [range, setRange] = useState(period?.range ?? "30d");
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const setPage = (value: number) => updateFilter("page", String(value), false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState<"disabled" | "category" | null>(null);
  const [bulkCategory, setBulkCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const brands = [...new Set(items.flatMap((i) => (i.brand ? [i.brand] : [])))].sort();
  const categories = [...new Set(items.flatMap((i) => (i.category ? [i.category] : [])))].sort();
  const grouped = useMemo(() => buildSkuCatalogDisplayGroups(items), [items]);
  const filtered = useMemo(
    () =>
      grouped.flatMap((group) => {
        const q = query.trim().toLocaleLowerCase();
        const textMatches = (i: SkuCatalogListItem) =>
          [i.name, i.code, i.manufacturerCode, i.variantLabel, i.brand, i.category, i.series]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase()
            .includes(q);
        const matches = (i: SkuCatalogListItem) =>
          (!status || i.catalogStatus === status) &&
          (!brand || i.brand === brand) &&
          (!category || i.category === category) &&
          (!q || textMatches(i) || textMatches(group.head));
        if (group.variantItems.length) {
          const variants = group.variantItems.filter(matches);
          return variants.length ? [{ ...group, variantItems: variants }] : [];
        }
        return matches(group.head) ? [group] : [];
      }),
    [grouped, query, status, brand, category]
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 25));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * 25, current * 25);
  const idsFor = (group: SkuCatalogDisplayGroup) => [
    ...new Set([
      ...(group.isDisplayGroup ? [] : [group.head.id]),
      ...group.variantItems.map((v) => v.id),
    ]),
  ];
  const pageIds = [...new Set(visible.flatMap(idsFor))];
  const resetPage = () => {
    setPage(1);
    setSelected(new Set());
  };
  const toggle = (ids: string[]) =>
    setSelected((previous) => {
      const next = new Set(previous);
      const all = ids.every((id) => next.has(id));
      ids.forEach((id) => (all ? next.delete(id) : next.add(id)));
      return next;
    });
  const updateBulk = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await bulkUpdateSkuCatalogAction({
        ids: [...selected],
        ...(bulkMode === "category" ? { category: bulkCategory } : { status: "disabled" as const }),
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setNotice(`已更新 ${selected.size} 个档案。`);
      setSelected(new Set());
      setBulkMode(null);
      router.refresh();
    } catch {
      setError("更新失败，请重试。");
    } finally {
      setBusy(false);
    }
  };
  const renderData = (rows: SkuCatalogListItem[]) => {
    const metrics = combineCatalogOperations(
      rows.flatMap((i) => (i.operations ? [i.operations] : []))
    );
    const qty = rows.reduce((sum, i) => sum.plus(i.business.sellableQty), new Decimal(0));
    const transit = rows.reduce((sum, i) => sum.plus(i.business.inTransitQty), new Decimal(0));
    const profit = new Decimal(metrics.matchedRevenue).minus(metrics.matchedCost);
    const rate = new Decimal(metrics.matchedRevenue).gt(0)
      ? profit.div(metrics.matchedRevenue).mul(100).toFixed(1)
      : null;
    return (
      <>
        {view === "stock" ? (
          <>
            <TableCell className="text-right tabular-nums">
              <p className={qty.gt(0) ? "font-medium" : "text-muted-foreground"}>
                {formatQuantity(qty.toString())} 件
              </p>
              {transit.gt(0) && (
                <p className="text-xs text-muted-foreground">
                  在途 {formatQuantity(transit.toString())} 件
                </p>
              )}
            </TableCell>
            <TableCell>
              <p className="max-w-44">{metrics.platforms.join("、") || "未上架"}</p>
            </TableCell>
          </>
        ) : (
          <>
            <TableCell className="text-right">
              <Prices values={metrics.purchasePrices} empty="暂无有效采购" />
            </TableCell>
            <TableCell className="text-right">
              <Prices values={metrics.salePrices} empty="期间无成交" />
            </TableCell>
          </>
        )}
        <TableCell className="text-right tabular-nums">
          <p className="font-medium">{formatQuantity(metrics.soldQty)} 件</p>
          <p className="text-xs text-muted-foreground">{metrics.orderIds.length} 单</p>
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {metrics.latest ? (
            <>
              <p className="whitespace-nowrap">
                {formatCurrency(metrics.latest.price, metrics.latest.currency)}
              </p>
              <p className="text-xs text-muted-foreground">{dateLabel(metrics.latest.date)}</p>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">期间无成交</span>
          )}
        </TableCell>
        {view === "business" && (
          <TableCell className="text-right tabular-nums">
            {metrics.matchedLines > 0 ? (
              <>
                <p className={profit.lt(0) ? "text-red-600" : "font-medium"}>
                  {formatCurrency(profit.toFixed(2), "CNY")}
                </p>
                <p className="text-xs text-muted-foreground">
                  毛利率 {rate === null ? "不适用" : `${rate}%`}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {metrics.pendingLines ? "待核算" : "期间无成交"}
              </p>
            )}
            {metrics.pendingLines > 0 && (
              <p className="text-xs text-amber-700">{metrics.pendingLines} 条明细待核算</p>
            )}
          </TableCell>
        )}
      </>
    );
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border p-1" aria-label="商品视图">
          {(
            [
              ["stock", "商品与库存"],
              ["business", "经营数据"],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={view === key ? "default" : "ghost"}
              aria-pressed={view === key}
              onClick={() => setView(key)}
            >
              {label}
            </Button>
          ))}
        </div>
        <form method="get" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="view" value={view} />
          <input type="hidden" name="q" value={query} />
          <input type="hidden" name="status" value={status} />
          <input type="hidden" name="brand" value={brand} />
          <input type="hidden" name="category" value={category} />
          <label htmlFor="catalog-period" className="text-xs text-muted-foreground">
            销售统计
          </label>
          <select
            id="catalog-period"
            name="range"
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="30d">近30天</option>
            <option value="90d">近90天</option>
            <option value="month">本月</option>
            <option value="custom">自定义日期</option>
          </select>
          {range === "custom" && (
            <>
              <Input
                name="from"
                type="date"
                aria-label="开始日期"
                defaultValue={period?.from}
                required
                className="w-40"
              />
              <span className="text-xs">至</span>
              <Input
                name="to"
                type="date"
                aria-label="结束日期"
                defaultValue={period?.to}
                required
                className="w-40"
              />
            </>
          )}
          <Button type="submit" size="sm" variant="outline">
            查询
          </Button>
        </form>
      </div>
      <div className="rounded-lg border bg-card p-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label="搜索商品"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                resetPage();
              }}
              placeholder="搜索商品、规格、编码或品牌"
              className="pl-9"
            />
          </div>
          <select
            aria-label="档案状态"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              resetPage();
            }}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="active">启用商品</option>
            <option value="disabled">已停用</option>
            <option value="">全部状态</option>
          </select>
          <select
            aria-label="品牌"
            value={brand}
            onChange={(e) => {
              setBrand(e.target.value);
              resetPage();
            }}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">全部品牌</option>
            {brands.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
          <select
            aria-label="分类"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              resetPage();
            }}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">全部分类</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          {(query || brand || category || status !== "active") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setBrand("");
                setCategory("");
                setStatus("active");
                resetPage();
              }}
            >
              重置
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        销售期间：{period ? `${period.from} 至 ${period.to}（北京时间）` : "所选期间"} ·
        仅计有效成交订单；库存与在售平台为当前状态。商品组数据仅汇总筛选后可见的规格。
      </p>
      {period?.error && (
        <p role="alert" className="text-sm text-amber-700">
          {period.error}
        </p>
      )}
      {view === "business" && (
        <p className="rounded-md bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
          采购均价按全部有效采购计算；销售均价按所选期间销售金额 ÷
          件数计算，多规格展示各规格均价区间，各币种分别显示。毛利统一折算
          CNY，仅计成本完整匹配的销售，未扣平台费和运费；待核算明细暂不计入。
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-700">
          {notice}
        </p>
      )}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
          <span>已选 {selected.size} 个档案（含所选商品的可见规格）</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setError(null);
              setBulkMode("category");
            }}
          >
            批量分类
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setError(null);
              setBulkMode("disabled");
            }}
          >
            批量停用
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            取消选择
          </Button>
        </div>
      )}
      {!filtered.length ? (
        <EmptyState
          icon={Box}
          title="没有符合条件的商品"
          description="调整搜索或筛选条件，或新增商品档案。"
        />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full min-w-[980px] text-sm">
              <TableHeader className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label="选择本页商品及规格"
                      checked={pageIds.length > 0 && pageIds.every((id) => selected.has(id))}
                      onChange={() => toggle(pageIds)}
                    />
                  </TableHead>
                  <TableHead className="min-w-72">商品 / 规格</TableHead>
                  <TableHead className="text-right">
                    {view === "stock" ? "当前可售" : "采购均价 / 区间"}
                  </TableHead>
                  <TableHead className={view === "business" ? "text-right" : ""}>
                    {view === "stock" ? "当前在售平台" : "期间均售价 / 区间"}
                  </TableHead>
                  <TableHead className="text-right">期间销量 / 订单</TableHead>
                  <TableHead className="text-right">期间最近售价</TableHead>
                  {view === "business" && (
                    <TableHead className="text-right">已核算毛利 / 毛利率</TableHead>
                  )}
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((group) => {
                  const variants = group.variantItems;
                  const dataRows = variants.length ? variants : [group.head];
                  const open = expanded.has(group.key);
                  const ids = idsFor(group);
                  return (
                    <Fragment key={group.key}>
                      <TableRow>
                        <TableCell>
                          <input
                            type="checkbox"
                            aria-label={`选择 ${group.displayName}`}
                            checked={ids.every((id) => selected.has(id))}
                            onChange={() => toggle(ids)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <ProductImage
                              src={group.head.imageUrl}
                              alt={group.displayName}
                              className="h-11 w-11 shrink-0 rounded-md"
                            />
                            <div className="min-w-0">
                              {group.isDisplayGroup ? (
                                <button
                                  className="text-left font-medium hover:text-primary"
                                  onClick={() =>
                                    setExpanded((prev) => {
                                      const n = new Set(prev);
                                      if (n.has(group.key)) n.delete(group.key);
                                      else n.add(group.key);
                                      return n;
                                    })
                                  }
                                >
                                  {group.displayName}
                                </button>
                              ) : (
                                <Link
                                  className="font-medium hover:text-primary hover:underline"
                                  href={detailHref(group.head.id)}
                                >
                                  {group.displayName}
                                </Link>
                              )}
                              <p className="mt-1 text-xs text-muted-foreground">
                                {[group.head.brand, group.head.category]
                                  .filter(Boolean)
                                  .join(" · ")}{" "}
                                <span className="ml-2" title={group.displayCode}>
                                  {group.isDisplayGroup ? "" : group.displayCode}
                                </span>
                              </p>
                              {variants.length === 1 && (
                                <Link
                                  href={detailHref(variants[0].id)}
                                  className="mt-1 inline-block text-xs text-muted-foreground hover:text-primary"
                                >
                                  规格：{compactVariantName(group, variants[0])}
                                </Link>
                              )}
                              {variants.length > 1 && (
                                <button
                                  className="mt-1 flex items-center gap-1 text-xs text-primary"
                                  aria-expanded={open}
                                  onClick={() =>
                                    setExpanded((prev) => {
                                      const n = new Set(prev);
                                      if (n.has(group.key)) n.delete(group.key);
                                      else n.add(group.key);
                                      return n;
                                    })
                                  }
                                >
                                  {open ? (
                                    <ChevronDown className="h-3 w-3" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3" />
                                  )}
                                  {open ? "收起" : "展开"} {variants.length} 个规格
                                </button>
                              )}
                              {group.head.catalogStatus === "disabled" && (
                                <Badge variant="secondary" className="ml-2 text-[10px]">
                                  已停用
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        {renderData(dataRows)}
                        <TableCell className="text-right">
                          {group.isDisplayGroup ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setExpanded((prev) => new Set([...prev, group.key]))}
                            >
                              查看规格
                            </Button>
                          ) : (
                            <SkuCatalogRowActions item={group.head} returnHref={returnHref} />
                          )}
                        </TableCell>
                      </TableRow>
                      {open &&
                        variants.length > 1 &&
                        variants.map((variant) => (
                          <TableRow
                            key={variant.id}
                            className="bg-muted/20 text-xs leading-4 [&>td]:py-2"
                          >
                            <TableCell>
                              <input
                                type="checkbox"
                                aria-label={`选择规格 ${variant.name}`}
                                checked={selected.has(variant.id)}
                                onChange={() => toggle([variant.id])}
                              />
                            </TableCell>
                            <TableCell className="pl-8">
                              <Link
                                className="font-normal hover:text-primary"
                                href={detailHref(variant.id)}
                              >
                                {compactVariantName(group, variant)}
                              </Link>
                              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                                {variant.code}
                                {variant.catalogStatus === "disabled" ? " · 已停用" : ""}
                              </p>
                            </TableCell>
                            {renderData([variant])}
                            <TableCell>
                              <SkuCatalogRowActions item={variant} returnHref={returnHref} />
                            </TableCell>
                          </TableRow>
                        ))}
                    </Fragment>
                  );
                })}
              </TableBody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
            <span>
              共 {filtered.length} 个商品 · 每页25个 · 第 {current} / {pages} 页
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={current === 1}
                onClick={() => {
                  setPage(current - 1);
                  setSelected(new Set());
                }}
              >
                上一页
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={current === pages}
                onClick={() => {
                  setPage(current + 1);
                  setSelected(new Set());
                }}
              >
                下一页
              </Button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={bulkMode !== null}
        title={bulkMode === "category" ? "批量修改分类" : "批量停用商品"}
        description={`将更新所选的 ${selected.size} 个档案。历史库存和业务记录会保留。`}
        loading={busy}
        error={error}
        confirmDisabled={bulkMode === "category" && !bulkCategory.trim()}
        onCancel={() => setBulkMode(null)}
        onConfirm={updateBulk}
      >
        {bulkMode === "category" && (
          <>
            <Input
              aria-label="目标分类"
              placeholder="输入分类名称"
              list="catalog-categories"
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
            />
            <datalist id="catalog-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
