import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_CURRENCIES = ["CNY", "JPY"];

function normalizeCurrency(currency?: string | null): string | null {
  if (!currency) return null;
  const code = currency.trim().toUpperCase();
  return code.length > 0 ? code : null;
}

function startOfUtcDay(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function getTrackedCurrencies() {
  const [storeCurrencies, purchaseCurrencies, salesCurrencies, listingCurrencies] =
    await Promise.all([
      prisma.store.findMany({ select: { currency: true } }),
      prisma.purchaseOrder.findMany({ select: { currency: true } }),
      prisma.customerOrder.findMany({ select: { currency: true } }),
      prisma.listing.findMany({ select: { currency: true } }),
    ]);

  const all = [
    ...DEFAULT_CURRENCIES,
    ...storeCurrencies.map((row) => row.currency),
    ...purchaseCurrencies.map((row) => row.currency),
    ...salesCurrencies.map((row) => row.currency),
    ...listingCurrencies.map((row) => row.currency ?? null),
  ];

  return Array.from(
    new Set(all.map((code) => normalizeCurrency(code)).filter((code): code is string => Boolean(code))),
  );
}

function getSyncCurrencies(base: string[]) {
  // 按当前业务优先同步 CNY/JPY；美元后续按开关开启
  if (process.env.FX_INCLUDE_USD === "true") {
    return Array.from(new Set([...base, "USD"]));
  }
  return base.filter((code) => code !== "USD");
}

async function fetchRatesForBase(baseCurrency: string) {
  const response = await fetch(`https://open.er-api.com/v6/latest/${baseCurrency}`, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`汇率接口请求失败: ${response.status}`);
  }

  const payload = (await response.json()) as {
    result?: string;
    rates?: Record<string, number>;
    error_type?: string;
  };
  if (payload.result !== "success" || !payload.rates) {
    throw new Error(`汇率接口返回异常: ${payload.error_type ?? "unknown"}`);
  }

  return payload.rates;
}

export async function GET(req: Request) {
  const syncToken = process.env.FX_SYNC_TOKEN;
  if (syncToken) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${syncToken}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const trackedCurrencies = await getTrackedCurrencies();
    const currencies = getSyncCurrencies(trackedCurrencies);
    if (currencies.length === 0) {
      return NextResponse.json({ ok: true, syncedPairs: 0, message: "没有可同步币种" });
    }

    const effectiveDate = startOfUtcDay();
    let syncedPairs = 0;

    for (const baseCurrency of currencies) {
      const rates = await fetchRatesForBase(baseCurrency);
      const targets = currencies.filter((code) => code !== baseCurrency && typeof rates[code] === "number");
      if (targets.length === 0) continue;

      await prisma.$transaction(async (tx) => {
        await tx.fxRate.deleteMany({
          where: {
            fromCurrency: baseCurrency,
            effectiveDate,
          },
        });

        await tx.fxRate.createMany({
          data: targets.map((toCurrency) => ({
            fromCurrency: baseCurrency,
            toCurrency,
            rate: rates[toCurrency].toString(),
            effectiveDate,
          })),
        });
      });

      syncedPairs += targets.length;
    }

    return NextResponse.json({
      ok: true,
      effectiveDate: effectiveDate.toISOString(),
      currencyCount: currencies.length,
      syncedPairs,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "汇率同步失败",
      },
      { status: 500 },
    );
  }
}
