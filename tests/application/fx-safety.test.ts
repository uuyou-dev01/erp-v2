import { afterAll, describe, expect, it } from "vitest";
import { convertMoney, FxRateUnavailableError } from "@/lib/fx";
import { prisma } from "@/lib/prisma";

const suffix = Date.now().toString(36).toUpperCase();
const staleCurrency = `OLD${suffix}`;
const futureCurrency = `FUT${suffix}`;

describe("FX safety boundaries", () => {
  afterAll(async () => {
    await prisma.fxRate.deleteMany({
      where: { fromCurrency: { in: [staleCurrency, futureCurrency] } },
    });
  });

  it("blocks a financial conversion when no rate exists", async () => {
    await expect(
      convertMoney({
        amount: 100,
        fromCurrency: `MISS${suffix}`,
        toCurrency: "CNY",
        effectiveAt: new Date("2026-08-03T00:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(FxRateUnavailableError);
  });

  it("does not use a future rate for an earlier business date", async () => {
    await prisma.fxRate.create({
      data: {
        fromCurrency: futureCurrency,
        toCurrency: "CNY",
        rate: 7,
        effectiveDate: new Date("2026-08-04T00:00:00.000Z"),
      },
    });

    await expect(
      convertMoney({
        amount: 100,
        fromCurrency: futureCurrency,
        toCurrency: "CNY",
        effectiveAt: new Date("2026-08-03T00:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(FxRateUnavailableError);
  });

  it("blocks stale rates unless an explicit workflow confirms that rate", async () => {
    await prisma.fxRate.create({
      data: {
        fromCurrency: staleCurrency,
        toCurrency: "CNY",
        rate: 7,
        effectiveDate: new Date("2020-01-01T00:00:00.000Z"),
      },
    });

    await expect(
      convertMoney({
        amount: 100,
        fromCurrency: staleCurrency,
        toCurrency: "CNY",
        effectiveAt: new Date("2026-08-03T00:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(FxRateUnavailableError);

    const explicitlyConfirmed = await convertMoney({
      amount: 100,
      fromCurrency: staleCurrency,
      toCurrency: "CNY",
      effectiveAt: new Date("2026-08-03T00:00:00.000Z"),
      maxRateAgeDays: null,
    });
    expect(explicitlyConfirmed.toFixed(2)).toBe("700.00");
  });
});
