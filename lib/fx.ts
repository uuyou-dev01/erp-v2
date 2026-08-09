import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";

const FIXED_BASE_CURRENCY = "CNY";
const DEFAULT_MAX_RATE_AGE_DAYS = 31;

function normalizeCurrency(currency?: string | null, label = "币种"): string {
  const normalized = currency?.trim().toUpperCase();
  if (!normalized) throw new Error(`${label}不能为空`);
  return normalized;
}

const FX_BRIDGE_CANDIDATES = ["CNY", "JPY", "USD"] as const;

type FxRateQuote = {
  rate: Decimal;
  effectiveDate: Date;
  path: string[];
};

export class FxRateUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FxRateUnavailableError";
  }
}

async function lookupDirectOrInverseRate(
  from: string,
  to: string,
  effectiveAt: Date,
): Promise<FxRateQuote | null> {
  const directByDate = await prisma.fxRate.findFirst({
    where: {
      fromCurrency: from,
      toCurrency: to,
      effectiveDate: { lte: effectiveAt },
    },
    orderBy: { effectiveDate: "desc" },
    select: { rate: true, effectiveDate: true },
  });
  if (directByDate?.rate) {
    return {
      rate: new Decimal(directByDate.rate.toString()),
      effectiveDate: directByDate.effectiveDate,
      path: [from, to],
    };
  }

  const inverseByDate = await prisma.fxRate.findFirst({
    where: {
      fromCurrency: to,
      toCurrency: from,
      effectiveDate: { lte: effectiveAt },
    },
    orderBy: { effectiveDate: "desc" },
    select: { rate: true, effectiveDate: true },
  });
  if (inverseByDate?.rate) {
    const inverseRate = new Decimal(inverseByDate.rate.toString());
    if (inverseRate.gt(0)) {
      return {
        rate: new Decimal(1).div(inverseRate),
        effectiveDate: inverseByDate.effectiveDate,
        path: [from, to],
      };
    }
  }

  return null;
}

export async function getLatestFxQuote(
  fromCurrency: string,
  toCurrency: string,
  effectiveAt: Date = new Date(),
): Promise<FxRateQuote | null> {
  const from = normalizeCurrency(fromCurrency, "原币种");
  const to = normalizeCurrency(toCurrency, "目标币种");

  if (from === to) return { rate: new Decimal(1), effectiveDate: effectiveAt, path: [from] };

  const directQuote = await lookupDirectOrInverseRate(from, to, effectiveAt);
  if (directQuote) return directQuote;

  for (const bridge of FX_BRIDGE_CANDIDATES) {
    if (bridge === from || bridge === to) continue;
    const fromToBridge = await lookupDirectOrInverseRate(from, bridge, effectiveAt);
    const bridgeToTarget = await lookupDirectOrInverseRate(bridge, to, effectiveAt);
    if (fromToBridge && bridgeToTarget) {
      return {
        rate: fromToBridge.rate.mul(bridgeToTarget.rate),
        effectiveDate:
          fromToBridge.effectiveDate < bridgeToTarget.effectiveDate
            ? fromToBridge.effectiveDate
            : bridgeToTarget.effectiveDate,
        path: [from, bridge, to],
      };
    }
  }

  return null;
}

export async function getLatestFxRate(
  fromCurrency: string,
  toCurrency: string,
  effectiveAt: Date = new Date(),
): Promise<Decimal | null> {
  return (await getLatestFxQuote(fromCurrency, toCurrency, effectiveAt))?.rate ?? null;
}

interface ConvertMoneyInput {
  amount: Decimal.Value;
  fromCurrency?: string | null;
  toCurrency: string;
  effectiveAt?: Date;
  preferredRate?: Decimal.Value | null;
  maxRateAgeDays?: number | null;
}

export async function convertMoney({
  amount,
  fromCurrency,
  toCurrency,
  effectiveAt = new Date(),
  preferredRate,
  maxRateAgeDays = DEFAULT_MAX_RATE_AGE_DAYS,
}: ConvertMoneyInput): Promise<Decimal> {
  const from = normalizeCurrency(fromCurrency, "原币种");
  const to = normalizeCurrency(toCurrency, "目标币种");
  const value = new Decimal(amount);

  if (from === to) return value;

  if (preferredRate != null) {
    const rate = new Decimal(preferredRate);
    if (rate.gt(0)) {
      return value.mul(rate);
    }
  }

  const quote = await getLatestFxQuote(from, to, effectiveAt);
  if (!quote) {
    throw new FxRateUnavailableError(
      `缺少 ${from}→${to} 在 ${effectiveAt.toISOString().slice(0, 10)} 或之前的汇率，不能确认金额`,
    );
  }

  if (maxRateAgeDays != null) {
    const ageDays = Math.floor((effectiveAt.getTime() - quote.effectiveDate.getTime()) / 86_400_000);
    if (ageDays > maxRateAgeDays) {
      throw new FxRateUnavailableError(
        `${from}→${to} 最近汇率距业务日期 ${ageDays} 天，超过允许的 ${maxRateAgeDays} 天；请补录或明确确认汇率`,
      );
    }
  }

  return value.mul(quote.rate);
}

interface ConvertToStoreBaseOptions {
  effectiveAt?: Date;
  preferredRate?: Decimal.Value | null;
  maxRateAgeDays?: number | null;
}

export async function createStoreMoneyConverter(_storeId: string) {
  // 业务约定：全局统计统一折算为 CNY，不再按店铺币种切换
  const baseCurrency = FIXED_BASE_CURRENCY;
  const rateCache = new Map<string, Promise<FxRateQuote | null>>();

  async function convertToBase(
    amount: Decimal.Value,
    fromCurrency?: string | null,
    options: ConvertToStoreBaseOptions = {},
  ): Promise<Decimal> {
    const from = normalizeCurrency(fromCurrency, "原币种");
    if (from === baseCurrency) {
      return new Decimal(amount);
    }

    if (options.preferredRate != null) {
      return convertMoney({
        amount,
        fromCurrency: from,
        toCurrency: baseCurrency,
        effectiveAt: options.effectiveAt,
        preferredRate: options.preferredRate,
        maxRateAgeDays: options.maxRateAgeDays,
      });
    }

    const effectiveAt = options.effectiveAt ?? new Date();
    const dayKey = effectiveAt.toISOString().slice(0, 10);
    const cacheKey = `${from}->${baseCurrency}@${dayKey}`;

    if (!rateCache.has(cacheKey)) {
      rateCache.set(cacheKey, getLatestFxQuote(from, baseCurrency, effectiveAt));
    }

    const quote = await rateCache.get(cacheKey);
    if (!quote) {
      throw new FxRateUnavailableError(
        `缺少 ${from}→${baseCurrency} 在 ${dayKey} 或之前的汇率，不能确认金额`,
      );
    }

    const maxRateAgeDays = options.maxRateAgeDays ?? DEFAULT_MAX_RATE_AGE_DAYS;
    if (options.maxRateAgeDays !== null) {
      const ageDays = Math.floor(
        (effectiveAt.getTime() - quote.effectiveDate.getTime()) / 86_400_000,
      );
      if (ageDays > maxRateAgeDays) {
        throw new FxRateUnavailableError(
          `${from}→${baseCurrency} 最近汇率距业务日期 ${ageDays} 天，超过允许的 ${maxRateAgeDays} 天；请补录或明确确认汇率`,
        );
      }
    }
    return new Decimal(amount).mul(quote.rate);
  }

  return {
    baseCurrency,
    convertToBase,
  };
}
