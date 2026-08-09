"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, PackagePlus, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

export interface MobileSkuCandidate {
  skuId: string;
  code: string;
  name: string;
  parentName: string | null;
  variantLabel: string | null;
  brand: string | null;
  imageUrl: string | null;
  barcode: string | null;
  manufacturerCode: string | null;
  score: number;
  reasons: string[];
  latestMarketPrice?: string | null;
  latestMarketCurrency?: string | null;
  latestPurchasePrice?: string | null;
  purchaseVsMarketRate?: number | null;
}

export function MobileSkuMatcher({
  lineNumber,
  query,
  brand,
  variant,
  selected,
  pendingCreation,
  unmatchedLabel,
  searchEndpoint = "/api/v1/mobile/skus/search",
  required = true,
  onSelect,
  onCreatePending,
  onClear,
}: {
  lineNumber: number;
  query: string;
  brand?: string;
  variant?: string;
  selected?: { skuId: string; code: string; name: string } | null;
  pendingCreation: boolean;
  unmatchedLabel?: string;
  searchEndpoint?: string;
  required?: boolean;
  onSelect: (candidate: MobileSkuCandidate) => void;
  onCreatePending?: () => void;
  onClear: () => void;
}) {
  const defaultSearch = useMemo(
    () => [query, variant].filter(Boolean).join(" ").trim(),
    [query, variant]
  );
  const [searchText, setSearchText] = useState(defaultSearch);
  const [results, setResults] = useState<MobileSkuCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(!selected && !pendingCreation);

  useEffect(() => {
    if (!selected && !pendingCreation) setSearchText(defaultSearch);
  }, [defaultSearch, pendingCreation, selected]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: searchText, limit: "6" });
        if (brand) params.set("brand", brand);
        if (variant) params.set("variant", variant);
        const response = await fetch(`${searchEndpoint}?${params.toString()}`, {
          signal: controller.signal,
        });
        const body = (await response.json()) as { results?: MobileSkuCandidate[] };
        if (response.ok) setResults(body.results ?? []);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [brand, open, searchEndpoint, searchText, variant]);

  if (selected) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
            <Check className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-emerald-950">{selected.name}</p>
            <p className="mt-0.5 font-mono text-[11px] text-emerald-700">{selected.code}</p>
            <p className="mt-1 text-[11px] text-emerald-700">
              采购行将直接使用这个正式 SKU，不再按名称重新猜测。
            </p>
          </div>
          <button
            type="button"
            aria-label={`清除商品 ${lineNumber} SKU`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-emerald-700"
            onClick={() => {
              onClear();
              setOpen(true);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  if (pendingCreation) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
        <div className="flex items-start gap-3">
          <PackagePlus className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-950">
              {unmatchedLabel || "创建待整理 SKU"}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-amber-800">
              {unmatchedLabel
                ? "原始价格证据会先进入采集箱，稍后再确认正式 SKU。"
                : "确认后会创建标记为“待整理”的正式 SKU，后续可以合并，不会静默关联到相似商品。"}
            </p>
          </div>
          <button
            type="button"
            aria-label={`重新匹配商品 ${lineNumber}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-amber-700"
            onClick={() => {
              onClear();
              setOpen(true);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label
        htmlFor={`sku-search-${lineNumber}`}
        className="block text-xs font-semibold text-slate-600"
      >
        匹配正式 SKU{required ? " *" : "（可稍后确认）"}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          id={`sku-search-${lineNumber}`}
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          onFocus={() => setOpen(true)}
          className="h-11 rounded-xl pl-9 pr-9"
          placeholder="输入名称、SKU 编码、款号或条码"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-blue-600" />
        ) : null}
      </div>
      {open ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {results.length ? (
            results.map((candidate) => (
              <button
                key={candidate.skuId}
                type="button"
                className="flex w-full items-start gap-3 border-b border-slate-100 px-3 py-3 text-left last:border-b-0 active:bg-blue-50"
                onClick={() => {
                  onSelect(candidate);
                  setOpen(false);
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900">
                      {candidate.name}
                    </span>
                    {candidate.score >= 0.95 ? (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                        精确
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 font-mono text-[10px] text-slate-500">
                    {candidate.code}
                    {candidate.manufacturerCode ? ` · ${candidate.manufacturerCode}` : ""}
                  </p>
                  <p className="mt-1 truncate text-[11px] text-slate-500">
                    {candidate.reasons.join(" · ")}
                  </p>
                  {candidate.latestMarketPrice ? (
                    <p className="mt-1 text-[11px] font-medium text-slate-700">
                      最近市场价 {candidate.latestMarketCurrency}{" "}
                      {Number(candidate.latestMarketPrice).toLocaleString()}
                    </p>
                  ) : null}
                </div>
                <span className="mt-0.5 text-xs font-semibold tabular-nums text-blue-700">
                  {Math.round(candidate.score * 100)}%
                </span>
              </button>
            ))
          ) : (
            <p className="px-3 py-4 text-center text-xs text-slate-500">
              {loading ? "正在查找正式 SKU…" : "没有找到可信候选"}
            </p>
          )}
          {onCreatePending ? (
            <button
              type="button"
              className="flex min-h-11 w-full items-center justify-center gap-2 border-t border-slate-100 px-3 py-2 text-xs font-semibold text-amber-700"
              onClick={() => {
                onCreatePending();
                setOpen(false);
              }}
            >
              <PackagePlus className="h-4 w-4" />
              {unmatchedLabel || "这是新商品，创建待整理 SKU"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
