"use client";

import { createContext, useContext, useId, useState } from "react";
import { Calculator, Copy, RotateCcw } from "lucide-react";
import { ActionDialog } from "@/components/ui/action-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { calculateSuggestedPrice, type SkuPricingBasis } from "@/lib/application/sku-pricing";
import {
  applyPricingBasis,
  applyPricingPreset,
  emptyPricingDraft,
  PRICING_PRESETS,
  type PricingDraft,
} from "@/lib/application/pricing-calculator";
import { formatCurrency } from "@/lib/decimal";

interface PricingContext {
  openCalculator: (source?: { basis: SkuPricingBasis; name: string }) => void;
}
const Context = createContext<PricingContext | null>(null);
export function usePricingCalculator() {
  const context = useContext(Context);
  if (!context) throw new Error("PricingCalculatorProvider is required");
  return context;
}

/** Standalone calculation body; callers own the draft and can embed it in another surface. */
export function PricingCalculator({
  draft,
  onChange,
  basis,
  name,
  onReset,
}: {
  draft: PricingDraft;
  onChange: (next: PricingDraft) => void;
  basis: SkuPricingBasis | null;
  name?: string;
  onReset: () => void;
}) {
  const id = useId();
  const [copied, setCopied] = useState<string | null>(null);
  const result = calculateSuggestedPrice({ ...draft, reference: basis?.reference ?? null });
  const currencies = [
    ...new Set(
      [draft.currency, draft.costCurrency, basis?.reference?.currency, "CNY", "JPY", "USD"].filter(
        (v): v is string => Boolean(v)
      )
    ),
  ];
  const change = (field: keyof PricingDraft, value: string) => {
    setCopied(null);
    onChange({
      ...draft,
      [field]: value,
      ...(field === "currency" ? { shipping: "", exchangeRate: "" } : {}),
      ...(field === "costCurrency" ? { cost: "", exchangeRate: "" } : {}),
    });
  };
  const field = (key: keyof PricingDraft, label: string, placeholder?: string) => (
    <label className="block space-y-1.5 text-xs" htmlFor={`${id}-${key}`}>
      <span className="text-muted-foreground">{label}</span>
      <Input
        id={`${id}-${key}`}
        inputMode="decimal"
        value={draft[key]}
        onChange={(e) => change(key, e.target.value)}
        placeholder={placeholder}
        className="h-10 bg-background text-sm tabular-nums"
      />
    </label>
  );
  const currencyField = (key: "currency" | "costCurrency", label: string) => (
    <label className="block space-y-1.5 text-xs" htmlFor={`${id}-${key}`}>
      <span className="text-muted-foreground">{label}</span>
      <select
        id={`${id}-${key}`}
        className="h-10 w-full rounded-md border bg-background px-2 text-sm"
        value={draft[key]}
        onChange={(e) => change(key, e.target.value)}
      >
        {currencies.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="space-y-4">
      {name ? (
        <p className="truncate text-xs text-muted-foreground" title={name}>
          {name}
        </p>
      ) : null}
      <div className="rounded-lg bg-slate-100 px-4 py-3" aria-live="polite">
        <p className="text-xs text-slate-600">建议售价 / 件</p>
        <p className="mt-1 break-all text-3xl font-semibold tabular-nums tracking-tight text-slate-950">
          {result.price !== null ? formatCurrency(result.price, draft.currency) : "—"}
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-600">{result.error ?? result.source}</p>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="定价预设">
        {PRICING_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              onChange(applyPricingPreset(draft, preset.id));
              setCopied(null);
            }}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-3">
        {field("cost", "每件进价", "输入金额")}
        {currencyField("costCurrency", "进价币种")}
        {field("shipping", `每件运费等（${draft.currency}）`, "暂按 0")}
        {currencyField("currency", "售价币种")}
      </div>
      {draft.currency !== draft.costCurrency
        ? field(
            "exchangeRate",
            `汇率：1 ${draft.costCurrency} = 多少 ${draft.currency}`,
            "请输入汇率"
          )
        : null}
      <div className="grid grid-cols-2 gap-3">
        {field("feePercent", "平台费率（%）", "暂按 0")}
        {field("marginPercent", "目标利润率（%）")}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="mr-auto text-muted-foreground">利润率快捷值</span>
        {["20", "30", "40"].map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={draft.marginPercent === value ? "default" : "outline"}
            className="h-7 px-2.5 text-xs"
            aria-pressed={draft.marginPercent === value}
            onClick={() => change("marginPercent", value)}
          >
            {value}%
          </Button>
        ))}
      </div>
      <details className="text-[11px] text-muted-foreground">
        <summary className="cursor-pointer">计算依据与带入数据</summary>
        <div className="mt-2 space-y-1 leading-5">
          <p>
            （换算后进价 + 运费等）÷（1 − 平台费率 − 目标利润率）。同币种成交参考更高时取较高值。
          </p>
          {basis?.cost ? (
            <p>
              {basis.cost.source}：{formatCurrency(basis.cost.amount, basis.cost.currency)}
            </p>
          ) : null}
          {basis?.reference ? (
            <p>
              {basis.reference.source}：
              {formatCurrency(basis.reference.amount, basis.reference.currency)}
            </p>
          ) : null}
          <p>
            预设是计算模板，不代表平台实际收费。费用为 0 或未填时未计该项；测算不修改商品或上架价。
          </p>
        </div>
      </details>
      <div className="flex items-center justify-between gap-3 border-t pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            onReset();
            setCopied(null);
          }}
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          清空重算
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={result.price === null}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(result.price!);
              setCopied(result.price);
            } catch {
              setCopied("failed");
            }
          }}
        >
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          {copied !== null && copied === result.price ? "已复制" : "复制售价"}
        </Button>
      </div>
      {copied === "failed" ? (
        <p role="status" className="text-xs text-muted-foreground">
          复制失败，请手动选取上方售价。
        </p>
      ) : null}
    </div>
  );
}

export function PricingCalculatorProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(emptyPricingDraft);
  const [source, setSource] = useState<{ basis: SkuPricingBasis; name: string } | null>(null);
  return (
    <Context.Provider
      value={{
        openCalculator(next) {
          if (next) {
            setSource(next);
            setDraft((previous) => applyPricingBasis(previous, next.basis));
          }
          setOpen(true);
        },
      }}
    >
      {children}
      <ActionDialog open={open} onOpenChange={setOpen} title="售价计算器" size="sm">
        <PricingCalculator
          draft={draft}
          onChange={setDraft}
          basis={source?.basis ?? null}
          name={source?.name}
          onReset={() => {
            setDraft(emptyPricingDraft());
            setSource(null);
          }}
        />
      </ActionDialog>
    </Context.Provider>
  );
}

export function PricingCalculatorTrigger({
  basis,
  name,
}: {
  basis: SkuPricingBasis;
  name: string;
}) {
  const { openCalculator } = usePricingCalculator();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 text-xs"
      disabled={Boolean(basis.unavailable)}
      title={basis.unavailable ?? "带入当前规格进价"}
      onClick={() => openCalculator({ basis, name })}
    >
      <Calculator className="mr-1.5 h-3.5 w-3.5" />
      售价计算器
    </Button>
  );
}
