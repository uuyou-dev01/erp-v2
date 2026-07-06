"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { ConfidenceBadge, VisibilityBadge } from "@/components/product-intelligence/product-intelligence-status";
import { DeleteObservationButton, ObservationForm } from "@/components/product-intelligence/observation-form";
import {
  ProductIntelligencePriceChart,
  type ProductIntelligencePricePoint,
} from "@/components/product-intelligence/price-chart";
import { VariantForm } from "@/components/product-intelligence/variant-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatCurrency, formatQuantity } from "@/lib/decimal";

const priceTypeLabels: Record<string, string> = {
  PURCHASE: "参考进货价",
  SALE: "参考售价",
  WHOLESALE: "批发/收货价",
  RESALE: "代卖价",
  OFFER: "报价",
};

const sourceTypeLabels: Record<string, string> = {
  MANUAL: "人工整理",
  REAL_PURCHASE: "真实采购",
  REAL_SALE: "真实销售",
  MARKET_SEEN: "看到的行情",
  PLATFORM_LISTING: "平台挂牌",
  SUPPLY_OFFER: "货盘报价",
};

type ObservationRow = {
  id: string;
  amount: string;
  currency: string;
  priceType: string;
  sourceType: string;
  sourceName: string | null;
  platformName: string | null;
  quantity: string | null;
  confidence: string;
  visibility: string;
  observedAt: string | Date;
  note: string | null;
  conditionGrade: string | null;
  store: { id: string; name: string; code: string };
};

type MarketGroup = {
  id: string;
  title: string;
  subtitle: string;
  visibility: string;
  observations: ObservationRow[];
};

function observationDate(value: string | Date) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function isSalePrice(priceType: string) {
  return ["SALE", "RESALE", "OFFER"].includes(priceType);
}

function buildChartData(groups: MarketGroup[]): ProductIntelligencePricePoint[] {
  return groups.flatMap((group) =>
    group.observations
      .filter((observation) => isSalePrice(observation.priceType))
      .map((observation) => ({
        date: observationDate(observation.observedAt),
        variant: group.title,
        condition: observation.conditionGrade?.trim() || "未标注",
        currency: observation.currency,
        price: Number(observation.amount),
      })),
  );
}

export function VariantMarketPanel({
  parentItemId,
  activeStoreId,
  defaultVisibility,
  variants,
}: {
  parentItemId: string;
  activeStoreId: string;
  defaultVisibility: string;
  variants: MarketGroup[];
}) {
  const [selectedId, setSelectedId] = useState("all");
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [showVariantForm, setShowVariantForm] = useState(false);
  const [showObservationForm, setShowObservationForm] = useState(false);
  const allGroups = useMemo(() => variants, [variants]);
  const selectedGroups = useMemo(() => {
    if (selectedId === "all") return allGroups;
    const selected = allGroups.find((group) => group.id === selectedId);
    return selected ? [selected] : allGroups;
  }, [allGroups, selectedId]);
  const allObservationCount = allGroups.reduce((total, group) => total + group.observations.length, 0);
  const chartData = buildChartData(selectedGroups);
  const conditionOptions = useMemo(
    () => Array.from(new Set(chartData.map((point) => point.condition || "未标注"))).sort(),
    [chartData],
  );
  const activeConditions = selectedConditions.filter((condition) => conditionOptions.includes(condition));
  const selectedObservationRows = selectedGroups.flatMap((group) =>
    group.observations
      .filter((observation) => {
        if (activeConditions.length === 0) return true;
        return activeConditions.includes(observation.conditionGrade?.trim() || "未标注");
      })
      .map((observation) => ({ group, observation })),
  );
  const selectedTargetItemId = selectedId !== "all" ? selectedId : variants[0]?.id;
  const toggleCondition = (condition: string) => {
    setSelectedConditions((current) => {
      const next = current.includes(condition)
        ? current.filter((item) => item !== condition)
        : [...current, condition];
      return next.length === conditionOptions.length ? [] : next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        <div className="space-y-4">
          <section className="overflow-hidden rounded-lg border border-blue-200 bg-white shadow-sm">
            <div className="border-b border-blue-100 bg-gradient-to-r from-white via-sky-50 to-white px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">价格图表</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    按 SKU 和成色拆分曲线，横轴为观察日期。
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setShowVariantForm(true)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-white px-3 text-xs font-medium transition-colors hover:bg-muted"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    添加 SKU
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowObservationForm((value) => !value)}
                    disabled={variants.length === 0}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    添加观察
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-2 rounded-md border border-blue-100 bg-white/80 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-600">SKU</span>
                  <button
                    type="button"
                    onClick={() => setSelectedId("all")}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-left text-xs transition-colors",
                      selectedId === "all"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-input bg-white hover:border-primary/70",
                    )}
                  >
                    全部 SKU
                    <span className="ml-1 text-muted-foreground">{allObservationCount} 条</span>
                  </button>
                  {variants.map((variant) => (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => setSelectedId(variant.id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors",
                        selectedId === variant.id
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-input bg-white hover:border-primary/70",
                      )}
                    >
                      <span className="font-medium">{variant.title}</span>
                      <VisibilityBadge visibility={variant.visibility} />
                      <span className="text-muted-foreground">{variant.observations.length} 条</span>
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-600">成色</span>
                  <button
                    type="button"
                    onClick={() => setSelectedConditions([])}
                    disabled={conditionOptions.length === 0}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                      activeConditions.length === 0
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-input bg-white hover:border-primary/70",
                    )}
                  >
                    全部成色
                  </button>
                  {conditionOptions.map((condition) => {
                    const active = activeConditions.includes(condition);
                    return (
                      <button
                        key={condition}
                        type="button"
                        onClick={() => toggleCondition(condition)}
                        className={cn(
                          "rounded-md border px-2.5 py-1 text-xs transition-colors",
                          active
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-input bg-white hover:border-primary/70",
                        )}
                      >
                        {condition}
                      </button>
                    );
                  })}
                  {variants.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      商品组只作为父级容器，请先添加 42码、小南、10cm 这类规格。
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="max-h-[calc(100vh-260px)] overflow-y-auto p-4 pr-3">
              <ProductIntelligencePriceChart data={chartData} activeConditions={activeConditions} />

              <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="flex flex-row items-center justify-between gap-3 border-b bg-slate-50/70 px-4 py-3">
                  <h3 className="text-sm font-semibold text-slate-950">观察记录</h3>
                  <span className="rounded-md bg-white px-2 py-1 text-xs text-muted-foreground">
                    {selectedObservationRows.length} 条
                  </span>
                </div>
                {selectedObservationRows.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">当前筛选下暂无观察记录。</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="min-w-[1080px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>SKU</TableHead>
                          <TableHead>价格</TableHead>
                          <TableHead>类型</TableHead>
                          <TableHead>成色</TableHead>
                          <TableHead>平台/来源</TableHead>
                          <TableHead>数量</TableHead>
                          <TableHead>贡献会员</TableHead>
                          <TableHead>观察日</TableHead>
                          <TableHead>可信度/可见</TableHead>
                          <TableHead className="text-right">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedObservationRows.map(({ group, observation }) => (
                          <TableRow key={observation.id}>
                            <TableCell>
                              <div className="font-medium">{group.title}</div>
                              {group.subtitle ? (
                                <div className="text-xs text-muted-foreground">{group.subtitle}</div>
                              ) : null}
                            </TableCell>
                            <TableCell className="whitespace-nowrap font-semibold">
                              {formatCurrency(observation.amount, observation.currency)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {priceTypeLabels[observation.priceType] ?? observation.priceType}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{observation.conditionGrade || "未标注"}</TableCell>
                            <TableCell>
                              <div className="font-medium">
                                {observation.platformName || observation.sourceName || "未填写"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {sourceTypeLabels[observation.sourceType] ?? observation.sourceType}
                              </div>
                              {observation.note ? (
                                <div className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground">
                                  备注：{observation.note}
                                </div>
                              ) : null}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {observation.quantity ? formatQuantity(observation.quantity) : "未填"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{observation.store.name}</TableCell>
                            <TableCell className="whitespace-nowrap">{observationDate(observation.observedAt)}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1.5">
                                <ConfidenceBadge confidence={observation.confidence} />
                                <VisibilityBadge visibility={observation.visibility} />
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <DeleteObservationButton
                                id={observation.id}
                                isOwner={observation.store.id === activeStoreId}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      {showObservationForm && selectedTargetItemId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowObservationForm(false)} />
          <Card className="relative z-10 max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto">
            <CardHeader className="flex flex-row items-start justify-between gap-4 border-b">
              <div>
                <CardTitle className="text-base">添加观察记录</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  记录某个 SKU 在平台或地区看到的售价。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowObservationForm(false)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="pt-4">
              <ObservationForm
                key={selectedTargetItemId}
                itemId={parentItemId}
                variantOptions={variants.map((variant) => ({ id: variant.id, title: variant.title }))}
                defaultTargetItemId={selectedTargetItemId}
                baseItemLabel={null}
                onCancel={() => setShowObservationForm(false)}
                onSuccess={() => setShowObservationForm(false)}
              />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {showVariantForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowVariantForm(false)} />
          <Card className="relative z-10 w-full max-w-lg">
            <CardHeader className="flex flex-row items-start justify-between gap-4 border-b">
              <div>
                <CardTitle className="text-base">添加 SKU</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  只填规格显示名，例如尺码、角色、长度或颜色尺码组合。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowVariantForm(false)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="pt-4">
              <VariantForm
                parentItemId={parentItemId}
                defaultVisibility={defaultVisibility}
                onCancel={() => setShowVariantForm(false)}
                onSuccess={() => setShowVariantForm(false)}
              />
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
