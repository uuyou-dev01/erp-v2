"use client";

import { createContext, useContext, useId, useState } from "react";
import { Calculator, Copy, RotateCcw } from "lucide-react";
import { ActionDialog } from "@/components/ui/action-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  calculateMaxAcquisitionPrice,
  calculateSuggestedPrice,
  type SkuPricingBasis,
} from "@/lib/application/sku-pricing";
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
  const forwardResult = calculateSuggestedPrice({ ...draft, reference: basis?.reference ?? null });
  const reverseResult = calculateMaxAcquisitionPrice(draft);
  const reverse = draft.mode === "reverse";
  const resultValue = reverse ? reverseResult.maxCost : forwardResult.price;
  const resultCurrency = reverse ? draft.costCurrency : draft.currency;
  const resultSource = reverse
    ? (reverseResult.error ?? reverseResult.source)
    : (forwardResult.error ?? forwardResult.source);
  const profit = reverse ? reverseResult.profit : forwardResult.profit;
  const actualMargin = reverse
    ? reverseResult.actualMarginPercent
    : forwardResult.actualMarginPercent;
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
  const field = (key: Exclude<keyof PricingDraft, "mode">, label: string, placeholder?: string) => (
    <label className="block space-y-1.5 text-xs" htmlFor={`${id}-${key}`}>
      <span className="text-muted-foreground">{label}</span>
      <Input
        id={`${id}-${key}`}
        inputMode="decimal"
        value={draft[key] ?? ""}
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
      <div className="grid grid-cols-2 rounded-lg bg-muted p-1" aria-label="计算方向">
        {(
          [
            ["forward", "定售价", "知道进价"],
            ["reverse", "反推收货价", "知道售价"],
          ] as const
        ).map(([mode, label, hint]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={draft.mode === mode}
            className={`rounded-md px-3 py-2 text-left transition-colors ${
              draft.mode === mode ? "bg-background shadow-sm" : "text-muted-foreground"
            }`}
            onClick={() => {
              setCopied(null);
              onChange({
                ...draft,
                mode,
                ...(mode === "reverse" && !draft.salePrice && forwardResult.price
                  ? { salePrice: forwardResult.price }
                  : {}),
              });
            }}
          >
            <span className="block text-xs font-medium text-foreground">{label}</span>
            <span className="mt-0.5 block text-[10px]">{hint}</span>
          </button>
        ))}
      </div>
      <div className="rounded-lg bg-slate-100 px-4 py-3" aria-live="polite">
        <p className="text-xs text-slate-600">{reverse ? "最高收货价 / 件" : "建议售价 / 件"}</p>
        <p className="mt-1 break-all text-3xl font-semibold tabular-nums tracking-tight text-slate-950">
          {resultValue !== null ? formatCurrency(resultValue, resultCurrency) : "—"}
        </p>
        <div className="mt-3 grid grid-cols-2 border-t border-slate-200 pt-2.5">
          <div className="pr-3">
            <p className="text-[10px] text-slate-500">预计单件利润</p>
            <p className="mt-0.5 text-sm font-medium tabular-nums text-slate-900">
              {profit !== null ? formatCurrency(profit, draft.currency) : "—"}
            </p>
          </div>
          <div className="border-l border-slate-200 pl-3">
            <p className="text-[10px] text-slate-500">实际利润率</p>
            <p className="mt-0.5 text-sm font-medium tabular-nums text-slate-900">
              {actualMargin !== null ? `${actualMargin}%` : "—"}
            </p>
          </div>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-600">{resultSource}</p>
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
        {reverse
          ? field("salePrice", "已知售价 / 件", "输入售价")
          : field("cost", "每件进价", "输入金额")}
        {reverse
          ? currencyField("currency", "售价币种")
          : currencyField("costCurrency", "进价币种")}
        {field("shipping", `每件运费等（${draft.currency}）`, "暂按 0")}
        {reverse
          ? currencyField("costCurrency", "收货币种")
          : currencyField("currency", "售价币种")}
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
            {reverse
              ? "售价 ×（1 − 平台费率 − 目标利润率）− 运费，再按汇率换算为最高收货价。"
              : "（换算后进价 + 运费等）÷（1 − 平台费率 − 目标利润率）。同币种成交参考更高时取较高值。"}
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
          disabled={resultValue === null}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(resultValue!);
              setCopied(resultValue);
            } catch {
              setCopied("failed");
            }
          }}
        >
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          {copied !== null && copied === resultValue
            ? "已复制"
            : reverse
              ? "复制收货价"
              : "复制售价"}
        </Button>
      </div>
      {copied === "failed" ? (
        <p role="status" className="text-xs text-muted-foreground">
          复制失败，请手动选取上方结果。
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
