"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Box, ChevronDown, ExternalLink, Search } from "lucide-react";
import type { SkuCardProduct } from "@/app/actions/sku-card-overviews";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductImage } from "@/components/ui/product-image";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

interface SKUCardGridProps {
  products: SkuCardProduct[];
}

function platformInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "P";
}

function statusClass(status: string) {
  if (status === "已上架") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "在途") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "已售出") return "bg-slate-100 text-slate-600 border-slate-200";
  return "bg-gray-50 text-gray-600 border-gray-200";
}

function lifecycleClass(stage: string) {
  if (stage === "PROCURING") return "border-blue-200 bg-blue-50 text-blue-700";
  if (stage === "SELLING") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (stage === "COMPLETED") return "border-slate-200 bg-slate-100 text-slate-600";
  if (stage === "EXCEPTION") return "border-red-200 bg-red-50 text-red-700";
  return "border-violet-200 bg-violet-50 text-violet-700";
}

function PlatformDots({ platforms }: { platforms: Array<{ code: string; name: string }> }) {
  if (platforms.length === 0) {
    return <span className="text-xs text-muted-foreground">暂无上架平台</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {platforms.map((platform) => (
        <span
          key={`${platform.code}-${platform.name}`}
          title={platform.name}
          className="grid h-7 w-7 place-items-center rounded-lg border bg-white text-[11px] font-bold text-gray-700"
        >
          {platformInitial(platform.name)}
        </span>
      ))}
    </div>
  );
}

function platformStatusClass(status: string) {
  if (status === "SYNC_OK" || status === "LISTED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "SYNC_EXCEPTION") return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function PlatformOpsStrip({
  platforms,
  limit,
}: {
  platforms: NonNullable<SkuCardProduct["variants"][number]["platformStatuses"]>;
  limit?: number;
}) {
  const visible = limit ? platforms.slice(0, limit) : platforms;
  if (visible.length === 0) {
    return <span className="text-xs text-muted-foreground">暂无平台配置</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((platform) => (
        <span
          key={platform.code}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium",
            platformStatusClass(platform.status)
          )}
          title={`${platform.name} · ${platform.stockLabel}`}
        >
          <span>{platform.name}</span>
          <span className="text-current/70">{platform.statusLabel}</span>
        </span>
      ))}
      {limit && platforms.length > limit && (
        <span className="inline-flex items-center rounded-md border bg-white px-2 py-1 text-[11px] text-muted-foreground">
          +{platforms.length - limit}
        </span>
      )}
    </div>
  );
}

function StockStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={statusClass(status)}>
      {status}
    </Badge>
  );
}

function lifecycleRank(stage: string) {
  if (stage === "EXCEPTION") return 0;
  if (stage === "PROCURING") return 1;
  if (stage === "SELLING") return 2;
  if (stage === "IN_STOCK") return 3;
  return 4;
}

function lifecycleStep(stage: string) {
  if (stage === "PROCURING") return 0;
  if (stage === "IN_STOCK") return 1;
  if (stage === "SELLING") return 3;
  if (stage === "COMPLETED") return 3;
  return 1;
}

function MiniLifecycle({ stage }: { stage: string }) {
  const steps = ["采购", "库存", "上架", "售出"];
  const activeStep = lifecycleStep(stage);

  return (
    <div className="flex items-center gap-1.5" title="采购 → 库存 → 上架 → 已售">
      {steps.map((step, index) => (
        <span key={step} className="flex items-center gap-1.5">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              index <= activeStep ? "bg-primary" : "bg-border",
              stage === "EXCEPTION" && index === activeStep && "bg-destructive"
            )}
          />
          {index < steps.length - 1 && <span className="h-px w-3 bg-border" />}
        </span>
      ))}
    </div>
  );
}

function SKUProductCard({
  product,
  densityMode,
}: {
  product: SkuCardProduct;
  densityMode: "compact" | "detail";
}) {
  const [activeSkuId, setActiveSkuId] = useState(product.variants[0]?.skuId);
  const [expanded, setExpanded] = useState(false);
  const [variantsExpanded, setVariantsExpanded] = useState(false);
  const active = product.variants.find((variant) => variant.skuId === activeSkuId) ?? product.variants[0];
  const summary = useMemo(() => {
    const variants = product.variants;
    const primary = [...variants].sort(
      (a, b) => lifecycleRank(a.lifecycleStage) - lifecycleRank(b.lifecycleStage)
    )[0];
    const riskTags = Array.from(new Set(variants.flatMap((variant) => variant.riskTags)));
    return {
      primary,
      newStockCount: variants.reduce((sum, variant) => sum + variant.newStockCount, 0),
      usedItemCount: variants.reduce((sum, variant) => sum + variant.usedItems.length, 0),
      lockedCount: variants.reduce((sum, variant) => sum + variant.lockedCount, 0),
      riskTags,
      platformSummary:
        variants.find((variant) => variant.platformSummary !== "暂无平台")?.platformSummary ?? "暂无平台",
    };
  }, [product.variants]);
  const isExpanded = expanded || densityMode === "detail";
  const visibleVariants = variantsExpanded || isExpanded ? product.variants : product.variants.slice(0, 3);
  const hiddenVariantCount = Math.max(product.variants.length - visibleVariants.length, 0);

  return (
    <article className="group overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="grid gap-4 p-4 sm:grid-cols-[112px,1fr]">
        <div className="flex h-28 items-center justify-center overflow-hidden rounded-xl bg-slate-50">
          <ProductImage src={product.imageUrl} alt={product.name} size="lg" />
        </div>
        <div className="min-w-0 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {product.brand || "未设置品牌"}
              </p>
              <h2 className="mt-1 truncate text-lg font-semibold tracking-tight">{product.name}</h2>
              {active && <p className="mt-1 font-mono text-xs text-muted-foreground">{active.skuCode}</p>}
            </div>
            {summary.primary && (
              <Badge variant="outline" className={cn("shrink-0", lifecycleClass(summary.primary.lifecycleStage))}>
                {summary.primary.lifecycleStageLabel}
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border bg-slate-50 px-2 py-1.5">
              <p className="font-semibold text-foreground">{product.variantCount}</p>
              <p className="text-muted-foreground">变体</p>
            </div>
            <div className="rounded-lg border bg-slate-50 px-2 py-1.5">
              <p className="font-semibold text-foreground">{summary.newStockCount}</p>
              <p className="text-muted-foreground">新品库存</p>
            </div>
            <div className="rounded-lg border bg-slate-50 px-2 py-1.5">
              <p className="font-semibold text-foreground">{summary.usedItemCount}</p>
              <p className="text-muted-foreground">中古单品</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {visibleVariants.map((variant) => (
              <button
                key={variant.skuId}
                type="button"
                onClick={() => setActiveSkuId(variant.skuId)}
                className={
                  active?.skuId === variant.skuId
                    ? "rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white shadow-sm"
                    : "rounded-md border bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:border-gray-900"
                }
              >
                {variant.variantName}
              </button>
            ))}
            {hiddenVariantCount > 0 && (
              <button
                type="button"
                onClick={() => setVariantsExpanded(true)}
                className="rounded-md border border-dashed bg-white px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                +{hiddenVariantCount}
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t pt-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <MiniLifecycle stage={summary.primary?.lifecycleStage ?? "IN_STOCK"} />
                <span className="truncate text-xs text-muted-foreground">
                  锁定 {summary.lockedCount} 件
                </span>
              </div>
              {summary.primary && (
                <div className="mt-2">
                  <PlatformOpsStrip platforms={summary.primary.platformStatuses} limit={2} />
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {summary.riskTags.length > 0 ? (
                  summary.riskTags.slice(0, 2).map((tag) => (
                    <Badge key={tag} variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                      {tag}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                    暂无风险
                  </Badge>
                )}
                {summary.riskTags.length > 2 && (
                  <Badge variant="outline" className="text-muted-foreground">
                    +{summary.riskTags.length - 2}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {summary.primary && (
                <Link href={summary.primary.nextActionHref}>
                  <Button size="sm" className="hidden h-8 sm:inline-flex">
                    {summary.primary.nextActionLabel}
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </Link>
              )}
              {densityMode === "detail" ? (
                <Badge variant="outline" className="h-8 rounded-md px-2.5 text-muted-foreground">
                  详细模式
                </Badge>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setExpanded((value) => !value)}
                >
                  {isExpanded ? "收起" : "展开"}
                  <ChevronDown className={cn("ml-1.5 h-3.5 w-3.5 transition", isExpanded && "rotate-180")} />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {isExpanded && active ? (
        <div className="border-t bg-slate-50/60 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">当前变体：{active.variantName}</p>
                <Badge variant="outline" className={lifecycleClass(active.lifecycleStage)}>
                  {active.lifecycleStageLabel}
                </Badge>
              </div>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{active.skuCode}</p>
            </div>
            <Link href={`/inventory/skus/${active.skuId}`}>
              <Button variant="outline" size="sm">
                <ExternalLink className="mr-1.5 h-4 w-4" />
                详情
              </Button>
            </Link>
          </div>

          <section className="mb-3 rounded-2xl border bg-white p-3">
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
              <div className="min-w-0">
                <p className="text-sm font-semibold">运营对象状态</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  新品库存 {active.newStockCount} · 中古单品 {active.usedItems.length} · 锁定 {active.lockedCount} 件
                </p>
                <div className="mt-2">
                  <PlatformOpsStrip platforms={active.platformStatuses} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {active.riskTags.length > 0 ? (
                    active.riskTags.map((tag) => (
                      <Badge key={tag} variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                        {tag}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                      暂无风险
                    </Badge>
                  )}
                </div>
              </div>
              <Link href={active.nextActionHref}>
                <Button size="sm" className="w-full justify-center md:w-auto">
                  {active.nextActionLabel}
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </section>

          <div className="space-y-3">
            <section className="rounded-2xl border bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">新品库存</h3>
                <Badge variant="secondary">{active.newStockCount} 件</Badge>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">新品合计：{active.newStockCount} 件</p>
                    <StockStatusBadge status={active.newStockStatus} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    均价{" "}
                    {active.newStockAvgCost
                      ? `${active.newStockCurrency} ${active.newStockAvgCost}`
                      : "-"}{" "}
                    · {active.newStockLocation || "-"}
                  </p>
                </div>
                <PlatformOpsStrip platforms={active.platformStatuses.filter((platform) => platform.status !== "NOT_CREATED")} />
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">中古单品</h3>
                <Badge variant="secondary">{active.usedItems.length} 件</Badge>
              </div>
              {active.usedItems.length === 0 ? (
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  暂无中古单品
                </div>
              ) : (
                <div className="space-y-2">
                  {active.usedItems.map((item) => (
                    <div
                      key={item.id}
                      className="grid gap-2 rounded-xl border bg-white px-3 py-2 sm:grid-cols-[1fr_auto]"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{item.code}</p>
                          <StockStatusBadge status={item.status} />
                        </div>
                        <p className="mt-1 truncate text-sm text-muted-foreground">
                          {item.condition} · 成本 {item.currency} {item.cost} · {item.location}
                        </p>
                      </div>
                      <PlatformDots platforms={item.platforms} />
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function SKUCardGrid({ products }: SKUCardGridProps) {
  const [query, setQuery] = useState("");
  const [densityMode, setDensityMode] = useState<"compact" | "detail">("compact");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((product) => {
      return (
        product.name.toLowerCase().includes(q) ||
        (product.brand || "").toLowerCase().includes(q) ||
        product.variants.some(
          (variant) =>
            variant.skuCode.toLowerCase().includes(q) ||
            variant.variantName.toLowerCase().includes(q)
        )
      );
    });
  }, [products, query]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-3xl border bg-white/80 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold">SKU 经营视图</h2>
          <p className="text-sm text-muted-foreground">
            默认只显示运营摘要；展开后查看变体、库存与平台细节。
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-xl">
          <div className="inline-flex rounded-md border bg-background p-0.5">
            <button
              type="button"
              onClick={() => setDensityMode("compact")}
              className={cn(
                "rounded px-2.5 py-1.5 text-xs font-medium",
                densityMode === "compact" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              )}
            >
              紧凑
            </button>
            <button
              type="button"
              onClick={() => setDensityMode("detail")}
              className={cn(
                "rounded px-2.5 py-1.5 text-xs font-medium",
                densityMode === "detail" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              )}
            >
              详细
            </button>
          </div>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
              placeholder="搜索商品、品牌、SKU 或变体"
            />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Box}
          title={products.length === 0 ? "暂无 SKU" : "没有匹配的商品"}
          description={products.length === 0 ? "先添加 SKU 或通过快速录入生成库存" : "调整关键词后再试"}
          actionLabel={products.length === 0 ? "添加 SKU" : undefined}
          actionHref={products.length === 0 ? "/inventory/skus/new" : undefined}
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {filtered.map((product) => (
            <SKUProductCard key={product.cardId} product={product} densityMode={densityMode} />
          ))}
        </div>
      )}
    </div>
  );
}
