type SupplyOfferPriceItem = {
  unitPrice: string | null;
  currency: string | null;
};

export function formatMoney(currency: string | null, amount: string | null) {
  if (!amount) return "-";
  const value = Number(amount);
  const formatted = Number.isFinite(value) ? value.toFixed(2) : amount;
  return `${currency ?? ""} ${formatted}`.trim();
}

export function formatSupplyOfferPrice(
  currency: string | null,
  unitPrice: string | null,
  items: SupplyOfferPriceItem[]
) {
  if (unitPrice) return formatMoney(currency, unitPrice);

  const pricedItems = items.filter((item): item is SupplyOfferPriceItem & { unitPrice: string } =>
    Boolean(item.unitPrice)
  );
  if (pricedItems.length === 0) return "未定价";

  const currencies = new Set(pricedItems.map((item) => item.currency ?? currency ?? ""));
  if (currencies.size !== 1) return "逐项定价";

  const values = pricedItems.map((item) => Number(item.unitPrice)).filter(Number.isFinite);
  if (values.length !== pricedItems.length) return "逐项定价";
  const priceCurrency = [...currencies][0];
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (minimum === maximum) return `${priceCurrency} ${minimum.toFixed(2)}`.trim();
  return `${priceCurrency} ${minimum.toFixed(2)}–${maximum.toFixed(2)}`.trim();
}

export function formatSupplyOfferShipping(
  fulfillmentMode: string,
  providerName: string | null | undefined,
  organizationName: string | null | undefined
) {
  if (fulfillmentMode === "RESELLER_SHIPS") return "由代卖方提货后发货";
  if (fulfillmentMode === "CONTACT_ONLY") return "成交后线下确认";
  if (fulfillmentMode === "THIRD_PARTY_SHIPS") return providerName ?? "第三方代发服务商";
  return organizationName ?? providerName ?? "供货方";
}
