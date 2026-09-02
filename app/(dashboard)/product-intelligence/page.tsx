import Link from "next/link";
import { ImageIcon, Search } from "lucide-react";
import {
  getProductIntelligenceCategories,
  getProductIntelligenceConditionOptions,
  getProductIntelligenceItems,
} from "@/app/actions/product-intelligence";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/decimal";
import {
  IntelligenceStatusBadge,
  VisibilityBadge,
} from "@/components/product-intelligence/product-intelligence-status";
import { ProductWorkspaceNav } from "@/components/inventory/product-workspace-nav";
import { requireUserContext } from "@/lib/auth/user-context";

export const dynamic = "force-dynamic";

type ProductIntelligenceListItem = Awaited<ReturnType<typeof getProductIntelligenceItems>>[number];

type PriceView = "AUTO" | "NEW" | "USED";
type CardColumnCount = "6" | "8" | "10";

type SkuMarketSignal = {
  key: string;
  sku: string;
  condition: string;
  priceText: string;
  weight: number;
};

function compactCurrency(value: string, currency: string) {
  return formatCurrency(value, currency).replace(/\.00\b/g, "");
}

function saleRangeText(ranges?: Array<{ currency: string; min: string; max: string }>) {
  if (!ranges || ranges.length === 0) return "暂无售价";
  return ranges.map((range) => `${compactCurrency(range.min, range.currency)} 起`).join(" / ");
}

function conditionRank(condition: string) {
  const normalized = condition.trim().replace(/\s+/g, " ");
  const rank: Record<string, number> = {
    全新: 1,
    "二手 S": 2,
    "二手 A": 3,
    "二手 B": 4,
    "二手 C": 5,
    未标注: 9,
    综合: 10,
  };
  return rank[normalized] ?? 8;
}

function conditionDisplayLabel(condition: string) {
  const normalized = condition.trim().replace(/\s+/g, " ");
  if (normalized === "全新") return "全新";
  if (normalized === "未标注") return "未标";
  if (normalized === "综合") return "综合";
  const usedMatch = normalized.match(/^二手\s*([A-Z])$/i);
  if (usedMatch) return usedMatch[1].toUpperCase();
  return normalized.replace(/^二手\s*/i, "");
}

function conditionToneClass(condition: string) {
  const label = conditionDisplayLabel(condition);
  if (label === "全新") return "border-sky-500/25 bg-sky-500/10 text-sky-700";
  if (label === "S") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700";
  if (label === "A") return "border-blue-500/25 bg-blue-500/10 text-blue-700";
  if (label === "B") return "border-amber-500/30 bg-amber-500/10 text-amber-800";
  if (label === "C") return "border-rose-500/25 bg-rose-500/10 text-rose-700";
  return "border-border bg-muted/50 text-muted-foreground";
}

function isNewCondition(condition: string) {
  return conditionDisplayLabel(condition) === "全新";
}

function isUsedCondition(condition: string) {
  const normalized = condition.trim().replace(/\s+/g, " ");
  const label = conditionDisplayLabel(condition);
  return normalized.startsWith("二手") || ["S", "A", "B", "C"].includes(label);
}

function skuMarketSignalGroups(item: ProductIntelligenceListItem, priceView: PriceView, limit = 3) {
  const signals: SkuMarketSignal[] = [];

  for (const variant of item.variantSummaries) {
    const conditionSignals = variant.conditionSummaries
      .filter((summary) => summary.saleRanges.length > 0)
      .map((summary) => ({
        key: `${variant.id}-${summary.condition}`,
        sku: variant.title,
        condition: summary.condition,
        priceText: saleRangeText(summary.saleRanges),
        weight: summary.observationCount,
      }))
      .sort(
        (a, b) =>
          conditionRank(a.condition) - conditionRank(b.condition) ||
          b.weight - a.weight ||
          a.condition.localeCompare(b.condition, "zh-CN")
      );

    if (conditionSignals.length > 0) {
      signals.push(...conditionSignals);
    } else if (variant.summary.saleRanges.length > 0) {
      signals.push({
        key: `${variant.id}-all`,
        sku: variant.title,
        condition: "综合",
        priceText: saleRangeText(variant.summary.saleRanges),
        weight: variant.summary.observationCount,
      });
    }
  }

  const newSignals = signals.filter((signal) => isNewCondition(signal.condition));
  const usedSignals = signals.filter((signal) => isUsedCondition(signal.condition));
  const scopedSignals =
    priceView === "NEW"
      ? newSignals
      : priceView === "USED"
        ? usedSignals
        : newSignals.length > 0
          ? newSignals
          : usedSignals.length > 0
            ? usedSignals
            : signals;

  const grouped = new Map<string, { key: string; sku: string; signals: SkuMarketSignal[] }>();
  for (const signal of scopedSignals.slice(0, limit)) {
    const group = grouped.get(signal.sku) ?? {
      key: signal.sku,
      sku: signal.sku,
      signals: [],
    };
    group.signals.push(signal);
    grouped.set(signal.sku, group);
  }

  return {
    groups: Array.from(grouped.values()),
    totalCount: scopedSignals.length,
    visibleCount: Math.min(scopedSignals.length, limit),
  };
}

function productIntelligenceHref(
  params: Record<string, string | undefined>,
  nextParams: Record<string, string | undefined>
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...nextParams })) {
    if (value) query.set(key, value);
  }
  const search = query.toString();
  return `/product-intelligence${search ? `?${search}` : ""}`;
}

function contributorSummary(item: ProductIntelligenceListItem) {
  const names = new Set<string>();
  names.add(item.store.name);

  for (const observation of item.observations ?? []) {
    if (observation.store?.name) names.add(observation.store.name);
  }
  for (const child of item.childItems ?? []) {
    for (const observation of child.observations ?? []) {
      if (observation.store?.name) names.add(observation.store.name);
    }
  }

  const contributors = Array.from(names);
  if (contributors.length <= 1) return `记录方：${contributors[0] ?? item.store.name}`;
  return `记录方：${contributors[0]} 等 ${contributors.length} 方`;
}

export default async function ProductIntelligencePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    visibility?: string;
    currency?: string;
    condition?: string;
    hasPrice?: string;
    cols?: string;
    priceView?: string;
  }>;
}) {
  const [params, context] = await Promise.all([searchParams, requireUserContext()]);
  const columnCount: CardColumnCount =
    params.cols === "8" || params.cols === "10" ? params.cols : "6";
  const priceView: PriceView =
    params.priceView === "NEW" || params.priceView === "USED" ? params.priceView : "AUTO";
  const priceViewLabel = {
    AUTO: "智能",
    NEW: "全新",
    USED: "二手",
  }[priceView];
  const gridClass = {
    "6": "grid gap-3 md:grid-cols-3 xl:grid-cols-6",
    "8": "grid gap-3 md:grid-cols-4 xl:grid-cols-8",
    "10": "grid gap-2 md:grid-cols-5 xl:grid-cols-10",
  }[columnCount];
  const signalLimit = columnCount === "6" ? 3 : 2;
  const cardMediaClass = {
    "6": "h-[68px] w-[68px]",
    "8": "h-[54px] w-[54px]",
    "10": "h-[44px] w-[44px]",
  }[columnCount];
  const cardTopGridClass = {
    "6": "grid-cols-[68px_1fr] gap-3 p-3",
    "8": "grid-cols-[54px_1fr] gap-2 p-2.5",
    "10": "grid-cols-[44px_1fr] gap-2 p-2",
  }[columnCount];
  const cardTitleClass = {
    "6": "line-clamp-2 text-sm leading-5",
    "8": "line-clamp-2 text-xs leading-4",
    "10": "line-clamp-2 text-[11px] leading-[0.95rem]",
  }[columnCount];
  const cardContentClass = {
    "6": "flex flex-1 flex-col p-3",
    "8": "flex flex-1 flex-col p-2.5",
    "10": "flex flex-1 flex-col p-2",
  }[columnCount];
  const pricePanelClass = {
    "6": "rounded-md bg-muted/25 p-2",
    "8": "rounded-md bg-muted/25 p-1.5",
    "10": "rounded-md bg-muted/25 p-1.5",
  }[columnCount];
  const singleSignalRowClass = {
    "6": "grid grid-cols-[minmax(24px,0.8fr)_auto_minmax(0,1.7fr)] items-center gap-1.5 text-xs",
    "8": "grid grid-cols-[minmax(22px,0.75fr)_auto_minmax(58px,1.9fr)] items-center gap-1 text-[11px]",
    "10": "grid grid-cols-[minmax(18px,0.55fr)_auto_minmax(60px,2fr)] items-center gap-1 text-[10px]",
  }[columnCount];
  const multiSignalRowClass = {
    "6": "grid grid-cols-[42px_minmax(0,1fr)] items-center gap-2 text-xs",
    "8": "grid grid-cols-[34px_minmax(0,1fr)] items-center gap-1.5 text-[11px]",
    "10": "grid grid-cols-[28px_minmax(0,1fr)] items-center gap-1 text-[10px]",
  }[columnCount];
  const conditionBadgeClass = {
    "6": "inline-flex h-5 min-w-[30px] shrink-0 items-center justify-center whitespace-nowrap rounded border px-1.5 text-[10px] font-medium",
    "8": "inline-flex h-4 min-w-[26px] shrink-0 items-center justify-center whitespace-nowrap rounded border px-1 text-[9px] font-medium",
    "10": "inline-flex h-4 min-w-[26px] shrink-0 items-center justify-center whitespace-nowrap rounded border px-1 text-[9px] font-medium",
  }[columnCount];
  const signalSkuClass = {
    "6": "min-w-0 truncate text-[11px] font-medium text-foreground",
    "8": "min-w-0 truncate text-[10px] font-medium text-foreground",
    "10": "min-w-0 truncate text-[10px] font-medium text-foreground",
  }[columnCount];
  const [items, categories, conditions] = await Promise.all([
    getProductIntelligenceItems(params),
    getProductIntelligenceCategories(),
    getProductIntelligenceConditionOptions(),
  ]);

  return (
    <div className="-m-4 flex h-full min-h-0 flex-col overflow-hidden bg-background md:-m-6">
      <div className="shrink-0 border-b bg-background px-4 pb-3 pt-4 shadow-sm md:px-6 md:pt-6">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">市场参考</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              查看外部平台的价格、成色与来源记录；这些数据只用于参考，不替代采购和销售单据。
            </p>
          </div>
        </div>

        <ProductWorkspaceNav active="market" role={context.role} />

        <Card className="mt-3">
          <CardContent className="p-3">
            <form className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_150px_130px_130px_130px_110px_auto]">
              <input type="hidden" name="cols" value={columnCount} />
              <input type="hidden" name="priceView" value={priceView === "AUTO" ? "" : priceView} />
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  name="q"
                  defaultValue={params.q ?? ""}
                  placeholder="搜索商品组、品牌、货号、SKU"
                  className="flex h-10 w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm"
                />
              </div>
              <select
                name="category"
                defaultValue={params.category ?? ""}
                className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">全部品类</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <select
                name="visibility"
                defaultValue={params.visibility ?? ""}
                className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">全部可见性</option>
                <option value="PUBLIC">公开</option>
                <option value="ORGANIZATION">组织内</option>
                <option value="PRIVATE">仅自己</option>
              </select>
              <select
                name="currency"
                defaultValue={params.currency ?? ""}
                className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">全部币种</option>
                <option value="CNY">CNY</option>
                <option value="JPY">JPY</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
              <select
                name="condition"
                defaultValue={params.condition ?? ""}
                className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">全部成色</option>
                {conditions.map((condition) => (
                  <option key={condition} value={condition}>
                    {condition}
                  </option>
                ))}
              </select>
              <select
                name="hasPrice"
                defaultValue={params.hasPrice ?? ""}
                className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">全部记录</option>
                <option value="1">有售价</option>
              </select>
              <Button type="submit" variant="outline">
                筛选
              </Button>
              <div className="flex flex-wrap items-center gap-3 lg:col-span-full">
                <div className="flex items-center gap-1">
                  <span className="mr-1 text-xs text-muted-foreground">价格</span>
                  {[
                    { value: "AUTO", label: "智能" },
                    { value: "NEW", label: "全新" },
                    { value: "USED", label: "二手" },
                  ].map((option) => (
                    <Link
                      key={option.value}
                      href={productIntelligenceHref(params, {
                        priceView: option.value === "AUTO" ? undefined : option.value,
                      })}
                    >
                      <Button
                        type="button"
                        size="sm"
                        variant={priceView === option.value ? "default" : "outline"}
                        className="h-8 px-3"
                      >
                        {option.label}
                      </Button>
                    </Link>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <span className="mr-1 text-xs text-muted-foreground">视图</span>
                  {(["6", "8", "10"] satisfies CardColumnCount[]).map((cols) => (
                    <Link key={cols} href={productIntelligenceHref(params, { cols })}>
                      <Button
                        type="button"
                        size="sm"
                        variant={columnCount === cols ? "default" : "outline"}
                        className="h-8 px-3"
                      >
                        每行 {cols}
                      </Button>
                    </Link>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">
                  智能模式优先看全新价；没有全新样本时自动展示二手价。
                </span>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
        {items.length === 0 ? (
          <EmptyState
            icon={Search}
            title="暂无市场参考"
            description="先整理一条外部商品采集，确认来源后会在这里形成价格参考。"
            actionHref="/product-intelligence/captures"
            actionLabel="整理采集"
          />
        ) : (
          <div className={gridClass}>
            {items.map((item) => {
              const signalPreview = skuMarketSignalGroups(item, priceView, signalLimit);
              const signalGroups = signalPreview.groups;
              const hasSignals = signalGroups.length > 0;
              const overflowSignalCount = signalPreview.totalCount - signalPreview.visibleCount;
              return (
                <Link key={item.id} href={`/product-intelligence/${item.id}`}>
                  <Card className="flex h-full flex-col overflow-hidden transition-colors hover:border-primary">
                    <div className={`grid border-b bg-muted/20 ${cardTopGridClass}`}>
                      <div
                        className={`relative overflow-hidden rounded-md bg-background/60 text-muted-foreground shadow-sm ${cardMediaClass}`}
                      >
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.imageUrl}
                            alt={item.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <ImageIcon className="h-8 w-8" />
                          </div>
                        )}
                      </div>
                      <div className="flex min-w-0 flex-col justify-between gap-2">
                        <div className="space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className={cardTitleClass}>{item.title}</CardTitle>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <VisibilityBadge visibility={item.visibility} />
                              <IntelligenceStatusBadge status={item.status} />
                            </div>
                          </div>
                          {item.brand ? (
                            <p className="truncate text-[11px] text-muted-foreground">
                              {item.brand}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <CardContent className={cardContentClass}>
                      <div className={pricePanelClass}>
                        <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          <span>SKU 售价参考 · {priceViewLabel}</span>
                          <span>成色 / 最低价</span>
                        </div>
                        {hasSignals ? (
                          <>
                            <div className="space-y-1.5">
                              {signalGroups.map((group) => (
                                <div
                                  key={group.key}
                                  className="rounded-md border bg-background/80 px-2 py-1.5"
                                >
                                  {group.signals.length === 1 ? (
                                    group.signals.map((signal) => (
                                      <div key={signal.key} className={singleSignalRowClass}>
                                        <span className={signalSkuClass}>{group.sku}</span>
                                        <span
                                          className={`${conditionBadgeClass} ${conditionToneClass(signal.condition)}`}
                                        >
                                          {conditionDisplayLabel(signal.condition)}
                                        </span>
                                        <span
                                          className="min-w-0 truncate text-right font-semibold tabular-nums"
                                          title={signal.priceText}
                                        >
                                          {signal.priceText}
                                        </span>
                                      </div>
                                    ))
                                  ) : (
                                    <>
                                      <p className="mb-1 truncate text-[11px] font-medium text-foreground">
                                        {group.sku}
                                      </p>
                                      <div className="space-y-1">
                                        {group.signals.map((signal) => (
                                          <div key={signal.key} className={multiSignalRowClass}>
                                            <span
                                              className={`${conditionBadgeClass} ${conditionToneClass(signal.condition)}`}
                                            >
                                              {conditionDisplayLabel(signal.condition)}
                                            </span>
                                            <span className="min-w-0 truncate text-right font-semibold tabular-nums">
                                              {signal.priceText}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </>
                                  )}
                                </div>
                              ))}
                            </div>
                            {overflowSignalCount > 0 ? (
                              <div className="rounded-md border border-dashed bg-background/70 px-2 py-1.5 text-[11px] text-muted-foreground">
                                还有 {overflowSignalCount} 条成色/价格，进入详情查看完整行情。
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            暂无 SKU 售价，可进入详情添加观察。
                          </p>
                        )}
                      </div>

                      <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-[11px] text-muted-foreground">
                        <span>
                          {item.variantCount > 0 ? `${item.variantCount} SKU` : "独立 SKU"}
                        </span>
                        <span className="truncate">{contributorSummary(item)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
