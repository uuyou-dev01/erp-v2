import Decimal from "decimal.js";
import type { Prisma } from "@prisma/client";

export const LOGISTICS_COST_SOURCE_TYPES = {
  purchase: "PURCHASE_ORDER",
  transfer: "INBOUND_SHIPMENT",
  consolidation: "CONSOLIDATION_BATCH",
} as const;

export type LogisticsCostSourceType =
  (typeof LOGISTICS_COST_SOURCE_TYPES)[keyof typeof LOGISTICS_COST_SOURCE_TYPES];

export interface LogisticsCostInput {
  amount?: string;
  currency?: string;
}

export function normalizeLogisticsCostInput(
  input: LogisticsCostInput,
  fallbackCurrency: string,
): { amount: Decimal; currency: string } | null {
  const rawAmount = input.amount?.trim();
  if (!rawAmount) return null;

  const amount = new Decimal(rawAmount);
  if (!amount.isFinite() || amount.lt(0)) {
    throw new Error("邮费必须是大于或等于 0 的有效金额");
  }

  const currency = (input.currency?.trim() || fallbackCurrency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("邮费币种必须是 3 位币种代码，例如 CNY、JPY、USD");
  }
  return { amount: amount.toDecimalPlaces(4), currency };
}

type LogisticsCostClient = Pick<Prisma.TransactionClient, "logisticsCost">;

export async function saveLogisticsShippingCost(
  client: LogisticsCostClient,
  input: {
    storeId: string;
    sourceType: LogisticsCostSourceType;
    sourceId: string;
    amount?: string;
    currency?: string;
    fallbackCurrency: string;
    occurredAt?: Date;
    note?: string;
  },
) {
  const cost = normalizeLogisticsCostInput(input, input.fallbackCurrency);
  if (!cost) return null;

  const where = {
    storeId_sourceType_sourceId_feeType: {
      storeId: input.storeId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      feeType: "SHIPPING",
    },
  };

  if (cost.amount.eq(0)) {
    await client.logisticsCost.deleteMany({
      where: {
        storeId: input.storeId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        feeType: "SHIPPING",
      },
    });
    return null;
  }

  return client.logisticsCost.upsert({
    where,
    create: {
      storeId: input.storeId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      feeType: "SHIPPING",
      amount: cost.amount,
      currency: cost.currency,
      occurredAt: input.occurredAt ?? new Date(),
      note: input.note?.trim() || null,
    },
    update: {
      amount: cost.amount,
      currency: cost.currency,
      occurredAt: input.occurredAt ?? new Date(),
      note: input.note?.trim() || null,
    },
  });
}
