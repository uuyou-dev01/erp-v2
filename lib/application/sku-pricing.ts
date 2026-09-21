import Decimal from "decimal.js";
import type { SkuCatalogDetail } from "@/lib/application/sku-catalog";

export interface PricingMoney {
  amount: string;
  currency: string;
  source: string;
}

export interface SkuPricingBasis {
  cost: PricingMoney | null;
  reference: PricingMoney | null;
  unavailable: string | null;
}

function nonnegative(value: string | null | undefined): Decimal | null {
  if (!value?.trim()) return null;
  try {
    const number = new Decimal(value);
    return number.isFinite() && number.gte(0) ? number : null;
  } catch {
    return null;
  }
}

export function buildSkuPricingBasis(sku: SkuCatalogDetail, now = new Date()): SkuPricingBasis {
  if (sku.childSkus.length > 0) {
    return { cost: null, reference: null, unavailable: "请选择具体规格后查看建议售价" };
  }
  if (sku.productKind === "USED") {
    return { cost: null, reference: null, unavailable: "中古商品请结合具体单件的成本和成色定价" };
  }
  // Keep source currencies separate: mixed-currency averages cannot support pricing.
  const purchases = sku.reference.recentPurchaseLines
    .filter(
      (line) =>
        !line.status.toUpperCase().includes("CANCEL") &&
        Boolean(nonnegative(line.quantity)?.gt(0)) &&
        nonnegative(line.lineAmount) !== null &&
        Boolean(line.currency) &&
        (!line.orderedAt || new Date(line.orderedAt).getTime() <= now.getTime())
    )
    .sort(
      (a, b) =>
        (b.orderedAt ? Date.parse(b.orderedAt) : 0) - (a.orderedAt ? Date.parse(a.orderedAt) : 0)
    );
  const costCurrency = purchases[0]?.currency;
  const matchingPurchases = purchases.filter((line) => line.currency === costCurrency);
  let cost: PricingMoney | null = null;
  if (matchingPurchases.length) {
    const amount = matchingPurchases.reduce(
      (sum, line) => sum.plus(line.lineAmount),
      new Decimal(0)
    );
    const quantity = matchingPurchases.reduce(
      (sum, line) => sum.plus(line.quantity),
      new Decimal(0)
    );
    cost = {
      amount: amount.div(quantity).toFixed(4),
      currency: costCurrency,
      source: `${matchingPurchases.length} 笔同币种采购均价`,
    };
  } else if (nonnegative(sku.meta.referenceCost) && sku.meta.referenceCostCurrency) {
    cost = {
      amount: sku.meta.referenceCost!,
      currency: sku.meta.referenceCostCurrency,
      source: "档案参考成本",
    };
  }
  const latest = sku.reference.recentSalesLines
    .filter(
      (line) =>
        nonnegative(line.quantity)?.gt(0) &&
        nonnegative(line.lineAmount)?.gt(0) &&
        line.currency &&
        Date.parse(line.orderDate) <= now.getTime()
    )
    .sort((a, b) => Date.parse(b.orderDate) - Date.parse(a.orderDate))[0];
  const reference: PricingMoney | null = latest
    ? {
        amount: new Decimal(latest.lineAmount).div(latest.quantity).toFixed(4),
        currency: latest.currency,
        source: `最近成交 · ${new Date(latest.orderDate).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
      }
    : nonnegative(sku.referencePrice)?.gt(0) && (sku.meta.referencePriceCurrency || sku.currency)
      ? {
          amount: sku.referencePrice!,
          currency: (sku.meta.referencePriceCurrency || sku.currency)!,
          source: "档案参考售价",
        }
      : null;
  return { cost, reference, unavailable: null };
}

export function calculateSuggestedPrice(input: {
  cost: string;
  costCurrency: string;
  currency: string;
  exchangeRate: string;
  marginPercent: string;
  feePercent: string;
  shipping: string;
  reference: PricingMoney | null;
}): {
  price: string | null;
  floor: string | null;
  profit: string | null;
  actualMarginPercent: string | null;
  source: string;
  error: string | null;
} {
  const fail = (error: string) => ({
    price: null,
    floor: null,
    profit: null,
    actualMarginPercent: null,
    source: "",
    error,
  });
  const margin = nonnegative(input.marginPercent);
  const fee = nonnegative(input.feePercent || "0");
  const shipping = nonnegative(input.shipping || "0");
  if (!margin || !fee || !shipping) return fail("请输入有效的非负利润率、费率和运费");
  if (margin.plus(fee).gte(100)) return fail("目标利润率与平台费率合计必须小于 100%");
  const cost = nonnegative(input.cost);
  if (input.cost.trim() && !cost) return fail("请输入有效的每件进价");
  const reference =
    input.reference?.currency === input.currency ? nonnegative(input.reference.amount) : null;
  if (!cost) {
    return reference?.gt(0)
      ? {
          price: reference.toFixed(2),
          floor: null,
          profit: null,
          actualMarginPercent: null,
          source: `${input.reference!.source}；待补进价核验利润`,
          error: null,
        }
      : fail("请补充进价，或维护当前币种的参考售价");
  }
  const rate =
    input.costCurrency === input.currency ? new Decimal(1) : nonnegative(input.exchangeRate);
  if (!rate?.gt(0)) return fail(`请填写汇率：1 ${input.costCurrency} 等于多少 ${input.currency}`);
  const floor = cost
    .mul(rate)
    .plus(shipping)
    .div(new Decimal(1).minus(margin.plus(fee).div(100)));
  const useReference = reference && reference.gte(floor);
  const rounding = input.currency === "JPY" ? 0 : 2;
  const price = (useReference ? reference : floor).toDecimalPlaces(rounding, Decimal.ROUND_CEIL);
  const profit = price
    .mul(new Decimal(1).minus(fee.div(100)))
    .minus(cost.mul(rate))
    .minus(shipping);
  return {
    price: price.toFixed(rounding),
    floor: floor.toDecimalPlaces(rounding, Decimal.ROUND_CEIL).toFixed(rounding),
    profit: profit.toDecimalPlaces(rounding, Decimal.ROUND_HALF_UP).toFixed(rounding),
    actualMarginPercent: profit.div(price).mul(100).toFixed(2),
    source: useReference
      ? `${input.reference!.source}，不低于目标利润售价`
      : "按进价、已填费用和目标利润率估算",
    error: null,
  };
}

export function calculateMaxAcquisitionPrice(input: {
  salePrice: string;
  costCurrency: string;
  currency: string;
  exchangeRate: string;
  marginPercent: string;
  feePercent: string;
  shipping: string;
}): {
  maxCost: string | null;
  profit: string | null;
  actualMarginPercent: string | null;
  source: string;
  error: string | null;
} {
  const fail = (error: string) => ({
    maxCost: null,
    profit: null,
    actualMarginPercent: null,
    source: "",
    error,
  });
  const salePrice = nonnegative(input.salePrice);
  const margin = nonnegative(input.marginPercent);
  const fee = nonnegative(input.feePercent || "0");
  const shipping = nonnegative(input.shipping || "0");
  if (!salePrice?.gt(0)) return fail("请输入有效的已知售价");
  if (!margin || !fee || !shipping) return fail("请输入有效的非负利润率、费率和运费");
  if (margin.plus(fee).gte(100)) return fail("目标利润率与平台费率合计必须小于 100%");
  const rate =
    input.costCurrency === input.currency ? new Decimal(1) : nonnegative(input.exchangeRate);
  if (!rate?.gt(0)) return fail(`请填写汇率：1 ${input.costCurrency} 等于多少 ${input.currency}`);
  const availableCost = salePrice
    .mul(new Decimal(1).minus(margin.plus(fee).div(100)))
    .minus(shipping);
  if (availableCost.lte(0)) return fail("当前售价不足以覆盖费用和目标利润");
  const rounding = input.costCurrency === "JPY" ? 0 : 2;
  const maxCost = availableCost.div(rate).toDecimalPlaces(rounding, Decimal.ROUND_FLOOR);
  const profit = salePrice
    .mul(new Decimal(1).minus(fee.div(100)))
    .minus(maxCost.mul(rate))
    .minus(shipping);
  const profitRounding = input.currency === "JPY" ? 0 : 2;
  return {
    maxCost: maxCost.toFixed(rounding),
    profit: profit.toDecimalPlaces(profitRounding, Decimal.ROUND_HALF_UP).toFixed(profitRounding),
    actualMarginPercent: profit.div(salePrice).mul(100).toFixed(2),
    source: "按售价扣除平台费、运费和目标利润后反推",
    error: null,
  };
}
