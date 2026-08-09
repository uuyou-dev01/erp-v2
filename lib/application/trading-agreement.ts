import Decimal from "decimal.js";
import type { Prisma } from "@prisma/client";
import { convertMoney } from "@/lib/fx";

export const AGREEMENT_RULE_KINDS = [
  "MARGIN",
  "SALE_PERCENT",
  "FIXED_PER_UNIT",
  "SALE_PERCENT_PLUS_FIXED",
  "PROFIT_PERCENT",
  "MANUAL",
] as const;

export type AgreementRuleKind = (typeof AGREEMENT_RULE_KINDS)[number];

export const AGREEMENT_PROFIT_DEDUCTIONS = [
  "SUPPLY_COST",
  "PLATFORM_FEE",
  "FULFILLMENT_FEE",
  "SHIPPING_FEE",
] as const;

export type AgreementProfitDeduction = (typeof AGREEMENT_PROFIT_DEDUCTIONS)[number];

export type AgreementRule = {
  kind: AgreementRuleKind;
  rate?: string;
  fixedAmount?: string;
  fixedCurrency?: string;
  profitDeductions?: AgreementProfitDeduction[];
};

function optionalDecimal(value?: string | null) {
  if (value == null || value.trim() === "") return null;
  const parsed = new Decimal(value);
  if (!parsed.isFinite() || parsed.lt(0)) throw new Error("合作约定中的金额必须是非负有效数字");
  return parsed;
}

export function buildAgreementRule(input: {
  kind?: string | null;
  rate?: string | null;
  fixedAmount?: string | null;
  fixedCurrency?: string | null;
  profitDeductions?: string[] | null;
}): AgreementRule {
  const kind = (input.kind || "MARGIN") as AgreementRuleKind;
  if (!AGREEMENT_RULE_KINDS.includes(kind)) throw new Error("系统试算方式无效");

  const rate = optionalDecimal(input.rate);
  if (["SALE_PERCENT", "SALE_PERCENT_PLUS_FIXED", "PROFIT_PERCENT"].includes(kind)) {
    if (!rate || rate.gt(1)) throw new Error("当前试算方式需要填写 0 到 1 之间的比例");
  }

  const fixedAmount = optionalDecimal(input.fixedAmount);
  if (["FIXED_PER_UNIT", "SALE_PERCENT_PLUS_FIXED"].includes(kind) && !fixedAmount) {
    throw new Error("当前试算方式需要填写每件固定金额");
  }

  const profitDeductions = input.profitDeductions == null
    ? [...AGREEMENT_PROFIT_DEDUCTIONS]
    : input.profitDeductions.filter(
        (value): value is AgreementProfitDeduction =>
          AGREEMENT_PROFIT_DEDUCTIONS.includes(value as AgreementProfitDeduction),
      );
  if (input.profitDeductions && profitDeductions.length !== input.profitDeductions.length) {
    throw new Error("利润试算包含系统无法识别的费用项目");
  }

  return {
    kind,
    ...(rate ? { rate: rate.toString() } : {}),
    ...(fixedAmount ? { fixedAmount: fixedAmount.toString() } : {}),
    ...(fixedAmount && input.fixedCurrency?.trim()
      ? { fixedCurrency: input.fixedCurrency.trim().toUpperCase() }
      : {}),
    ...(kind === "PROFIT_PERCENT"
      ? {
          profitDeductions,
        }
      : {}),
  };
}

export function toAgreementJson(rule: AgreementRule): Prisma.InputJsonObject {
  return rule as unknown as Prisma.InputJsonObject;
}

export function parseAgreementRule(value: Prisma.JsonValue | null | undefined): AgreementRule {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("合作约定缺少可执行的系统试算规则");
  }
  const source = value as Record<string, unknown>;
  return buildAgreementRule({
    kind: typeof source.kind === "string" ? source.kind : undefined,
    rate: typeof source.rate === "string" || typeof source.rate === "number" ? String(source.rate) : undefined,
    fixedAmount:
      typeof source.fixedAmount === "string" || typeof source.fixedAmount === "number"
        ? String(source.fixedAmount)
        : undefined,
    fixedCurrency: typeof source.fixedCurrency === "string" ? source.fixedCurrency : undefined,
    profitDeductions: Array.isArray(source.profitDeductions)
      ? source.profitDeductions.filter((value): value is string => typeof value === "string")
      : undefined,
  });
}

export type AgreementCalculation = {
  automatic: boolean;
  currency: string;
  saleAmount: Decimal;
  supplyCost: Decimal;
  platformFee: Decimal;
  fulfillmentFee: Decimal;
  shippingFee: Decimal;
  distributableProfit: Decimal | null;
  resellerCommission: Decimal | null;
};

export async function calculateAgreement(input: {
  rule: AgreementRule;
  quantity: Decimal.Value;
  saleUnitPrice: Decimal.Value;
  saleCurrency: string;
  supplyUnitPrice?: Decimal.Value | null;
  supplyCurrency?: string | null;
  platformFeeRate?: Decimal.Value | null;
  fulfillmentFeePerUnit?: Decimal.Value | null;
  fulfillmentFeeCurrency?: string | null;
  shippingFee?: Decimal.Value | null;
  shippingCurrency?: string | null;
  effectiveAt?: Date;
}): Promise<AgreementCalculation> {
  const quantity = new Decimal(input.quantity);
  const currency = input.saleCurrency.trim().toUpperCase();
  const effectiveAt = input.effectiveAt ?? new Date();
  const saleAmount = new Decimal(input.saleUnitPrice).mul(quantity);
  const platformFee = input.platformFeeRate
    ? saleAmount.mul(new Decimal(input.platformFeeRate))
    : new Decimal(0);
  const supplyCost = input.supplyUnitPrice
    ? await convertMoney({
        amount: new Decimal(input.supplyUnitPrice).mul(quantity),
        fromCurrency: input.supplyCurrency,
        toCurrency: currency,
        effectiveAt,
      })
    : new Decimal(0);
  const fulfillmentFee = input.fulfillmentFeePerUnit
    ? await convertMoney({
        amount: new Decimal(input.fulfillmentFeePerUnit).mul(quantity),
        fromCurrency: input.fulfillmentFeeCurrency,
        toCurrency: currency,
        effectiveAt,
      })
    : new Decimal(0);
  const shippingFee = input.shippingFee
    ? await convertMoney({
        amount: input.shippingFee,
        fromCurrency: input.shippingCurrency,
        toCurrency: currency,
        effectiveAt,
      })
    : new Decimal(0);

  if (input.rule.kind === "MANUAL") {
    return {
      automatic: false,
      currency,
      saleAmount,
      supplyCost,
      platformFee,
      fulfillmentFee,
      shippingFee,
      distributableProfit: null,
      resellerCommission: null,
    };
  }

  let distributableProfit: Decimal | null = null;
  let resellerCommission = new Decimal(0);
  if (input.rule.kind === "SALE_PERCENT" || input.rule.kind === "SALE_PERCENT_PLUS_FIXED") {
    resellerCommission = resellerCommission.plus(saleAmount.mul(input.rule.rate ?? 0));
  }
  if (input.rule.kind === "FIXED_PER_UNIT" || input.rule.kind === "SALE_PERCENT_PLUS_FIXED") {
    const fixed = await convertMoney({
      amount: new Decimal(input.rule.fixedAmount ?? 0).mul(quantity),
      fromCurrency: input.rule.fixedCurrency,
      toCurrency: currency,
      effectiveAt,
    });
    resellerCommission = resellerCommission.plus(fixed);
  }
  if (input.rule.kind === "PROFIT_PERCENT") {
    const deductions = new Set(input.rule.profitDeductions ?? AGREEMENT_PROFIT_DEDUCTIONS);
    distributableProfit = saleAmount;
    if (deductions.has("SUPPLY_COST")) distributableProfit = distributableProfit.minus(supplyCost);
    if (deductions.has("PLATFORM_FEE")) distributableProfit = distributableProfit.minus(platformFee);
    if (deductions.has("FULFILLMENT_FEE")) distributableProfit = distributableProfit.minus(fulfillmentFee);
    if (deductions.has("SHIPPING_FEE")) distributableProfit = distributableProfit.minus(shippingFee);
    distributableProfit = Decimal.max(0, distributableProfit);
    resellerCommission = distributableProfit.mul(input.rule.rate ?? 0);
  }

  return {
    automatic: true,
    currency,
    saleAmount,
    supplyCost,
    platformFee,
    fulfillmentFee,
    shippingFee,
    distributableProfit,
    resellerCommission,
  };
}
