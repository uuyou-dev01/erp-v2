export type PlatformShippingRule = {
  name?: string;
  carrier?: string | null;
  sizeClass?: string | null;
  maxWeightKg?: string | null;
  fee?: string | null;
  currency?: string | null;
  notes?: string | null;
};

export type PlatformListingDefaultsSource = {
  defaultCurrency?: string | null;
  defaultFeeRate?: string | number | { toString(): string } | null;
  defaultShippingFee?: string | number | { toString(): string } | null;
  shippingRules?: unknown;
};

export type PlatformListingDefaults = {
  currency: string | null;
  feeRate: string | null;
  shippingFee: string | null;
};

function toDecimalString(value?: string | number | { toString(): string } | null) {
  if (value == null || value === "") return null;
  const text = typeof value === "object" && "toString" in value ? value.toString() : String(value);
  const trimmed = text.trim();
  return trimmed || null;
}

export function parsePlatformShippingRules(rules: unknown): PlatformShippingRule[] {
  if (!Array.isArray(rules)) return [];
  return rules as PlatformShippingRule[];
}

export function getFirstShippingRuleFee(rules: unknown): string | null {
  for (const rule of parsePlatformShippingRules(rules)) {
    const fee = rule.fee?.trim();
    if (fee) return fee;
  }
  return null;
}

export function resolvePlatformListingDefaults(
  platform: PlatformListingDefaultsSource
): PlatformListingDefaults {
  const currency = platform.defaultCurrency?.trim() || null;
  const feeRate = toDecimalString(platform.defaultFeeRate);
  const shippingFee =
    toDecimalString(platform.defaultShippingFee) ??
    getFirstShippingRuleFee(platform.shippingRules);

  return { currency, feeRate, shippingFee };
}

export function formatFeeRatePercent(feeRate: string | null) {
  if (!feeRate) return null;
  const value = Number(feeRate);
  if (Number.isNaN(value)) return null;
  return `${(value * 100).toFixed(1)}%`;
}
