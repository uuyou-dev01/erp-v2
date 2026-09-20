import type { SkuPricingBasis } from "./sku-pricing";

export const PRICING_PRESETS = [
  { id: "basic", label: "基础估价", fee: "0", shipping: "0", margin: "30" },
  { id: "fee", label: "含 10% 平台费", fee: "10", shipping: "", margin: "30" },
] as const;

export interface PricingDraft {
  cost: string;
  costCurrency: string;
  currency: string;
  exchangeRate: string;
  marginPercent: string;
  feePercent: string;
  shipping: string;
}

export function emptyPricingDraft(): PricingDraft {
  return {
    cost: "",
    costCurrency: "CNY",
    currency: "CNY",
    exchangeRate: "",
    marginPercent: "30",
    feePercent: "0",
    shipping: "0",
  };
}

export function applyPricingBasis(draft: PricingDraft, basis: SkuPricingBasis): PricingDraft {
  const costCurrency = basis.cost?.currency ?? basis.reference?.currency ?? draft.currency;
  const currency = basis.reference?.currency ?? costCurrency;
  return {
    ...draft,
    cost: basis.cost?.amount ?? "",
    costCurrency,
    currency,
    exchangeRate:
      costCurrency === draft.costCurrency && currency === draft.currency ? draft.exchangeRate : "",
    shipping: currency === draft.currency ? draft.shipping : "",
  };
}

export function applyPricingPreset(draft: PricingDraft, id: string): PricingDraft {
  const preset = PRICING_PRESETS.find((item) => item.id === id);
  return preset
    ? { ...draft, feePercent: preset.fee, shipping: preset.shipping, marginPercent: preset.margin }
    : draft;
}
