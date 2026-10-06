import { inferMarketFromPlatform } from "./sellable-market";

interface PriceContext {
  currency?: string | null;
  listedPrice?: { toString(): string } | null;
  defaultShippingFee?: { toString(): string } | null;
  platform?: { code: string; country?: string | null; defaultCurrency?: string | null };
}

/** Read-only checks: historical amounts and currency are never converted here. */
export function listingPriceRisks(value: PriceContext) {
  const risks: Array<{ key: string; label: string; tone: "amber" | "red" }> = [];
  const currency = value.currency?.trim().toUpperCase();
  const configured = value.platform?.defaultCurrency?.trim().toUpperCase();
  const market = value.platform
    ? inferMarketFromPlatform({ ...value.platform, country: value.platform.country ?? null })
    : "UNKNOWN";
  const regional = market === "JP" ? "JPY" : market === "CN" ? "CNY" : undefined;
  if (!currency) risks.push({ key: "currency", label: "原币币种待确认", tone: "red" });
  else if ((configured && currency !== configured) || (regional && currency !== regional)) {
    risks.push({
      key: "currency",
      label: `币种待核实：${currency}（${regional || configured} 平台）`,
      tone: "red",
    });
  }
  const price = Number(value.listedPrice?.toString());
  const shipping = Number(value.defaultShippingFee?.toString());
  if (value.listedPrice && (!Number.isFinite(price) || price <= 0)) {
    risks.push({ key: "amount", label: "售价须为有效正数", tone: "red" });
  } else if (price > 0 && shipping >= price) {
    risks.push({ key: "amount", label: "邮费不低于售价，请核实金额与币种", tone: "amber" });
  }
  return risks;
}
