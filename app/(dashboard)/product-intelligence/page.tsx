import Link from "next/link";
import { ImageIcon, Plus, Search } from "lucide-react";
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

export const dynamic = "force-dynamic";

type ProductIntelligenceListItem = Awaited<ReturnType<typeof getProductIntelligenceItems>>[number];

function saleRangeText(ranges?: Array<{ currency: string; min: string; max: string }>) {
  if (!ranges || ranges.length === 0) return "暂无售价";
  return ranges.map((range) => `${formatCurrency(range.min, range.currency)} 起`).join(" / ");
}

function conditionRank(condition: string) {
  const rank: Record<string, number> = {
    全新: 1,
    "二手 S": 2,
    "二手 A": 3,
    "二手 B": 4,
    未标注: 9,
    综合: 10,
  };
  return rank[condition] ?? 8;
}

function skuMarketSignals(item: ProductIntelligenceListItem, limit = 3) {
  return item.variantSummaries
    .flatMap((variant) => {
      const conditionSignals = variant.conditionSummaries
        .filter((summary) => summary.saleRanges.length > 0)
        .map((summary) => ({
          key: `${variant.id}-${summary.condition}`,
          sku: variant.title,
          condition: summary.condition,
          priceText: saleRangeText(summary.saleRanges),
          weight: summary.observationCount,
        }));

      if (conditionSignals.length > 0) return conditionSignals;
      if (variant.summary.saleRanges.length > 0) {
        return [
          {
            key: `${variant.id}-all`,
            sku: variant.title,
            condition: "综合",
            priceText: saleRangeText(variant.summary.saleRanges),
            weight: variant.summary.observationCount,
          },
        ];
      }
      return [];
    })
    .sort((a, b) => (
      conditionRank(a.condition) - conditionRank(b.condition)
      || b.weight - a.weight
      || a.sku.localeCompare(b.sku, "zh-CN")
    ))
    .slice(0, limit);
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
  if (contributors.length <= 1) return `贡献方：${contributors[0] ?? item.store.name}`;
  return `贡献方：${contributors[0]} 等 ${contributors.length} 方`;
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
  }>;
}) {
  const params = await searchParams;
  const columnCount = params.cols === "5" || params.cols === "6" ? params.cols : "4";
  const gridClass = {
    "4": "grid gap-3 md:grid-cols-2 xl:grid-cols-4",
    "5": "grid gap-3 md:grid-cols-2 xl:grid-cols-5",
    "6": "grid gap-3 md:grid-cols-3 xl:grid-cols-6",
  }[columnCount];
  const signalLimit = columnCount === "6" ? 3 : columnCount === "5" ? 4 : 5;
  const cardMediaClass = {
    "4": "h-[96px] w-[96px]",
    "5": "h-[78px] w-[78px]",
    "6": "h-[68px] w-[68px]",
  }[columnCount];
  const cardTopGridClass = {
    "4": "grid-cols-[96px_1fr]",
    "5": "grid-cols-[78px_1fr]",
    "6": "grid-cols-[68px_1fr]",
  }[columnCount];
  const [items, categories, conditions] = await Promise.all([
    getProductIntelligenceItems(params),
    getProductIntelligenceCategories(),
    getProductIntelligenceConditionOptions(),
  ]);

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-30 -mx-1 bg-background/95 px-1 pb-3 pt-2 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">商品情报</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              按商品组、SKU 和成色聚合会员贡献的地区售价、平台来源和品类经验；这里只展示数据，不承接库存和交易。
            </p>
          </div>
          <Link href="/product-intelligence/new">
            <Button size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              添加情报
            </Button>
          </Link>
        </div>

        <Card>
          <CardContent className="p-3">
            <form className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_150px_130px_130px_130px_110px_auto]">
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
              <div className="flex items-center gap-2 lg:col-span-full">
                <span className="text-xs text-muted-foreground">视图</span>
                <select
                  name="cols"
                  defaultValue={columnCount}
                  className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-xs"
                >
                  <option value="4">每行 4 个</option>
                  <option value="5">每行 5 个</option>
                  <option value="6">每行 6 个</option>
                </select>
                <span className="text-xs text-muted-foreground">
                  更多卡片会压缩图片和价格行，适合快速扫货。
                </span>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Search}
          title="暂无商品情报"
          description="先添加一条你熟悉的商品、行情或价格观察。"
          actionHref="/product-intelligence/new"
          actionLabel="添加情报"
        />
      ) : (
        <div className={gridClass}>
          {items.map((item) => {
            const signals = skuMarketSignals(item, signalLimit);
            return (
              <Link key={item.id} href={`/product-intelligence/${item.id}`}>
                <Card className="h-full overflow-hidden transition-colors hover:border-primary">
                  <div className={`grid gap-3 border-b bg-muted/20 p-3 ${cardTopGridClass}`}>
                    <div className={`relative overflow-hidden rounded-md bg-background/60 text-muted-foreground shadow-sm ${cardMediaClass}`}>
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <ImageIcon className="h-8 w-8" />
                          </div>
                        )}
                    </div>
                    <div className="flex min-w-0 flex-col justify-between gap-2">
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="line-clamp-2 text-sm leading-5">{item.title}</CardTitle>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                          <VisibilityBadge visibility={item.visibility} />
                          <IntelligenceStatusBadge status={item.status} />
                          </div>
                        </div>
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {[item.brand, item.model, item.category].filter(Boolean).join(" · ") || "未分类"}
                        </p>
                      </div>
                      <div className={`flex flex-wrap gap-1 text-[11px] ${columnCount === "6" ? "hidden 2xl:flex" : ""}`}>
                        <span className="rounded bg-background px-1.5 py-0.5 text-muted-foreground">
                          {item.category || "未分类"}
                        </span>
                        <span className="rounded bg-background px-1.5 py-0.5 text-muted-foreground">
                          {item.variantCount > 0 ? `${item.variantCount} SKU` : "独立 SKU"}
                        </span>
                        <span className="rounded bg-background px-1.5 py-0.5 text-muted-foreground">
                          {signals.length > 0 ? "有售价参考" : "待补售价"}
                        </span>
                        </div>
                    </div>
                  </div>
                  <CardContent className="space-y-2 p-3">
                    <div className="rounded-md bg-muted/30 p-2">
                      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>SKU 成色售价参考</span>
                        <span>最低价</span>
                      </div>
                      {signals.length > 0 ? (
                        <div className="space-y-1">
                          {signals.map((signal) => (
                            <div key={signal.key} className="flex items-center justify-between gap-2 text-xs">
                              <span className="min-w-0 truncate">
                                {signal.sku} · {signal.condition}
                              </span>
                              <span className="shrink-0 font-semibold">{signal.priceText}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">暂无 SKU 售价，可进入详情添加观察。</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>{item.variantCount > 0 ? `${item.variantCount} SKU` : "独立 SKU"}</span>
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
  );
}
