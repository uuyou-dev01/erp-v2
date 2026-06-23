import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";

const FIXED_BASE_CURRENCY = "CNY";

function normalizeCurrency(currency?: string | null): string {
  return (currency || FIXED_BASE_CURRENCY).trim().toUpperCase();
}

const FX_BRIDGE_CANDIDATES = ["CNY", "JPY", "USD"] as const;

async function lookupDirectOrInverseRate(
  from: string,
  to: string,
  effectiveAt: Date,
): Promise<Decimal | null> {
  const directByDate = await prisma.fxRate.findFirst({
    where: {
      fromCurrency: from,
      toCurrency: to,
      effectiveDate: { lte: effectiveAt },
    },
    orderBy: { effectiveDate: "desc" },
    select: { rate: true },
  });
  if (directByDate?.rate) {
    return new Decimal(directByDate.rate.toString());
  }

  const inverseByDate = await prisma.fxRate.findFirst({
    where: {
      fromCurrency: to,
      toCurrency: from,
      effectiveDate: { lte: effectiveAt },
    },
    orderBy: { effectiveDate: "desc" },
    select: { rate: true },
  });
  if (inverseByDate?.rate) {
    const inverseRate = new Decimal(inverseByDate.rate.toString());
    if (inverseRate.gt(0)) return new Decimal(1).div(inverseRate);
  }

  const directLatest = await prisma.fxRate.findFirst({
    where: {
      fromCurrency: from,
      toCurrency: to,
    },
    orderBy: { effectiveDate: "desc" },
    select: { rate: true },
  });
  if (directLatest?.rate) {
    return new Decimal(directLatest.rate.toString());
  }

  const inverseLatest = await prisma.fxRate.findFirst({
    where: {
      fromCurrency: to,
      toCurrency: from,
    },
    orderBy: { effectiveDate: "desc" },
    select: { rate: true },
  });
  if (inverseLatest?.rate) {
    const inverseRate = new Decimal(inverseLatest.rate.toString());
    if (inverseRate.gt(0)) return new Decimal(1).div(inverseRate);
  }

  return null;
}

export async function getLatestFxRate(
  fromCurrency: string,
  toCurrency: string,
  effectiveAt: Date = new Date(),
): Promise<Decimal | null> {
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);

  if (from === to) return new Decimal(1);

  const directRate = await lookupDirectOrInverseRate(from, to, effectiveAt);
  if (directRate) return directRate;

  // 兜底：尝试通过中间币种换算（优先 CNY/JPY，最后 USD）
  for (const bridge of FX_BRIDGE_CANDIDATES) {
    if (bridge === from || bridge === to) continue;
    const fromToBridge = await lookupDirectOrInverseRate(from, bridge, effectiveAt);
    const bridgeToTarget = await lookupDirectOrInverseRate(bridge, to, effectiveAt);
    if (fromToBridge && bridgeToTarget) {
      return fromToBridge.mul(bridgeToTarget);
    }
  }

  return null;
}

interface ConvertMoneyInput {
  amount: Decimal.Value;
  fromCurrency?: string | null;
  toCurrency: string;
  effectiveAt?: Date;
  preferredRate?: Decimal.Value | null;
}

export async function convertMoney({
  amount,
  fromCurrency,
  toCurrency,
  effectiveAt = new Date(),
  preferredRate,
}: ConvertMoneyInput): Promise<Decimal> {
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);
  const value = new Decimal(amount);

  if (from === to) return value;

  if (preferredRate != null) {
    const rate = new Decimal(preferredRate);
    if (rate.gt(0)) {
      return value.mul(rate);
    }
  }

  const rate = await getLatestFxRate(from, to, effectiveAt);
  if (!rate) {
    // 没有可用汇率时保持原值，避免统计中断；后续由汇率同步任务补齐
    return value;
  }

  return value.mul(rate);
}

interface ConvertToStoreBaseOptions {
  effectiveAt?: Date;
  preferredRate?: Decimal.Value | null;
}

export async function createStoreMoneyConverter(_storeId: string) {
  // 业务约定：全局统计统一折算为 CNY，不再按店铺币种切换
  const baseCurrency = FIXED_BASE_CURRENCY;
  const rateCache = new Map<string, Promise<Decimal | null>>();

  async function convertToBase(
    amount: Decimal.Value,
    fromCurrency?: string | null,
    options: ConvertToStoreBaseOptions = {},
  ): Promise<Decimal> {
    const from = normalizeCurrency(fromCurrency);
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
      });
    }

    const effectiveAt = options.effectiveAt ?? new Date();
    const dayKey = effectiveAt.toISOString().slice(0, 10);
    const cacheKey = `${from}->${baseCurrency}@${dayKey}`;

    if (!rateCache.has(cacheKey)) {
      rateCache.set(cacheKey, getLatestFxRate(from, baseCurrency, effectiveAt));
    }

    const rate = await rateCache.get(cacheKey);
    if (!rate) {
      return new Decimal(amount);
    }

    return new Decimal(amount).mul(rate);
  }

  return {
    baseCurrency,
    convertToBase,
  };
}
