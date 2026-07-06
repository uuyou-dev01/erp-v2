"use server";

import Decimal from "decimal.js";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { requireUserContext } from "@/lib/auth/user-context";
import { createStoreMoneyConverter, getLatestFxRate } from "@/lib/fx";
import { prisma } from "@/lib/prisma";

type StringableDecimal = { toString(): string };

export type SerializedSettlement = {
  id: string;
  storeId: string;
  partnerId: string | null;
  fulfillmentRequestId: string | null;
  customerOrderId: string | null;
  settlementNo: string;
  direction: string;
  status: string;
  currency: string;
  totalAmount: string;
  baseCurrency: string | null;
  fxRate: string | null;
  baseAmount: string | null;
  confirmedAt: Date | null;
  paidAt: Date | null;
  voidedAt: Date | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  partner: { id: string; name: string } | null;
  fulfillmentRequest: {
    id: string;
    requestNo: string;
    status: string;
    resaleListing: { id: string; title: string } | null;
  } | null;
  lines: Array<{
    id: string;
    lineType: string;
    description: string;
    amount: string;
    currency: string;
    direction: string;
    sourceType: string | null;
    sourceId: string | null;
  }>;
};

type RawSettlement = Omit<
  SerializedSettlement,
  "totalAmount" | "fxRate" | "baseAmount" | "lines"
> & {
  totalAmount: StringableDecimal;
  fxRate: StringableDecimal | null;
  baseAmount: StringableDecimal | null;
  lines: Array<Omit<SerializedSettlement["lines"][number], "amount"> & { amount: StringableDecimal }>;
};

function serializeSettlement(settlement: RawSettlement): SerializedSettlement {
  return {
    ...settlement,
    totalAmount: settlement.totalAmount.toString(),
    fxRate: settlement.fxRate?.toString() ?? null,
    baseAmount: settlement.baseAmount?.toString() ?? null,
    lines: settlement.lines.map((line) => ({
      ...line,
      amount: line.amount.toString(),
    })),
  };
}

function nextSettlementNo() {
  return `ST-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function revalidateSettlementSurfaces(id?: string, fulfillmentRequestId?: string) {
  revalidatePath("/finance/settlements");
  if (id) revalidatePath(`/finance/settlements/${id}`);
  if (fulfillmentRequestId) revalidatePath(`/fulfillment/requests/${fulfillmentRequestId}`);
}

async function buildSettlementLine(input: {
  lineType: string;
  description: string;
  amount: Decimal;
  currency: string;
  direction: "PAYABLE" | "RECEIVABLE";
  sourceType: string;
  sourceId: string;
  baseCurrency: string;
  effectiveAt: Date;
}) {
  const fxRate = await getLatestFxRate(input.currency, input.baseCurrency, input.effectiveAt);
  const baseAmount = fxRate ? input.amount.mul(fxRate) : input.amount;

  return {
    lineType: input.lineType,
    description: input.description,
    amount: input.amount,
    currency: input.currency,
    direction: input.direction,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    baseCurrency: input.baseCurrency,
    fxRate,
    baseAmount,
  };
}

const settlementInclude = {
  partner: true,
  fulfillmentRequest: {
    include: {
      resaleListing: true,
    },
  },
  lines: {
    orderBy: { createdAt: "asc" as const },
  },
} as const;

export async function getSettlements(storeId?: string) {
  const context = await requireUserContext(storeId ? { storeId } : undefined);
  const settlements = await prisma.settlement.findMany({
    where: { storeId: context.activeStoreId },
    include: settlementInclude,
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
  return settlements.map(serializeSettlement);
}

export async function getSettlementById(id: string, storeId?: string) {
  const context = await requireUserContext(storeId ? { storeId } : undefined);
  const settlement = await prisma.settlement.findFirst({
    where: { id, storeId: context.activeStoreId },
    include: settlementInclude,
  });
  return settlement ? serializeSettlement(settlement) : null;
}

export async function createSettlementFromFulfillmentAction(fulfillmentRequestId: string, storeId?: string) {
  try {
    const context = await requireUserContext(storeId ? { storeId } : undefined);
    const request = await prisma.fulfillmentRequest.findFirst({
      where: {
        id: fulfillmentRequestId,
        storeId: context.activeStoreId,
        status: { in: ["SHIPPED", "DELIVERED"] },
      },
      include: {
        supplyOffer: { include: { ownerPartner: true } },
        resaleListing: true,
        settlements: true,
      },
    });

    if (!request) throw new Error("只有已发货或已送达的履约请求可以生成结算");
    if (request.settlements.some((settlement) => settlement.status !== "VOID")) {
      throw new Error("该履约请求已经存在有效结算单");
    }
    if (!request.resaleListing) throw new Error("履约请求缺少代卖记录，无法计算结算");

    const qty = new Decimal(request.quantity.toString());
    const resale = request.resaleListing;
    const currency = resale.supplyCurrency || request.supplyOffer.currency || resale.currency;
    const supplyCost = resale.supplyUnitPrice ? new Decimal(resale.supplyUnitPrice.toString()).mul(qty) : new Decimal(0);
    const saleAmount = new Decimal(resale.targetPrice.toString()).mul(qty);
    const platformFee = resale.platformFeeRate ? saleAmount.mul(new Decimal(resale.platformFeeRate.toString())) : new Decimal(0);
    const commissionBasis = saleAmount.minus(supplyCost);
    const commission = resale.commissionRate ? commissionBasis.mul(new Decimal(resale.commissionRate.toString())) : new Decimal(0);
    const shippingFee = request.shippingFee ? new Decimal(request.shippingFee.toString()) : new Decimal(0);
    const totalAmount = supplyCost.plus(commission).plus(shippingFee);
    const converter = await createStoreMoneyConverter(context.activeStoreId);
    const effectiveAt = request.shippedAt ?? request.deliveredAt ?? request.requestedAt;
    const headerFxRate = await getLatestFxRate(currency, converter.baseCurrency, effectiveAt);
    const baseAmount = await converter.convertToBase(totalAmount, currency, {
      preferredRate: headerFxRate?.toString(),
      effectiveAt,
    });
    const lines = await Promise.all([
      buildSettlementLine({
        lineType: "SUPPLY_COST",
        description: "供货货款",
        amount: supplyCost,
        currency,
        direction: "PAYABLE",
        sourceType: "FULFILLMENT_REQUEST",
        sourceId: request.id,
        baseCurrency: converter.baseCurrency,
        effectiveAt,
      }),
      buildSettlementLine({
        lineType: "COMMISSION",
        description: "代卖佣金",
        amount: commission,
        currency: resale.currency,
        direction: "PAYABLE",
        sourceType: "RESALE_LISTING",
        sourceId: resale.id,
        baseCurrency: converter.baseCurrency,
        effectiveAt,
      }),
      buildSettlementLine({
        lineType: "PLATFORM_FEE",
        description: "平台费用估算",
        amount: platformFee,
        currency: resale.currency,
        direction: "RECEIVABLE",
        sourceType: "RESALE_LISTING",
        sourceId: resale.id,
        baseCurrency: converter.baseCurrency,
        effectiveAt,
      }),
      buildSettlementLine({
        lineType: "SHIPPING_FEE",
        description: "代发运费",
        amount: shippingFee,
        currency: request.shippingCurrency || resale.currency,
        direction: "PAYABLE",
        sourceType: "FULFILLMENT_REQUEST",
        sourceId: request.id,
        baseCurrency: converter.baseCurrency,
        effectiveAt,
      }),
    ]);

    const settlement = await prisma.settlement.create({
      data: {
        storeId: context.activeStoreId,
        partnerId: request.supplyOffer.ownerPartnerId,
        fulfillmentRequestId: request.id,
        settlementNo: nextSettlementNo(),
        direction: "PAYABLE",
        currency,
        totalAmount,
        baseCurrency: converter.baseCurrency,
        fxRate: headerFxRate,
        baseAmount,
        note: `由履约请求 ${request.requestNo} 生成`,
        createdById: context.userId,
        updatedById: context.userId,
        lines: {
          create: lines,
        },
      },
    });

    revalidateSettlementSurfaces(settlement.id, request.id);
    return actionSuccess({ id: settlement.id });
  } catch (error) {
    return toActionFailure(error, "生成结算单失败，请重试");
  }
}

export async function changeSettlementStatusAction(id: string, nextStatus: "CONFIRMED" | "PAID" | "VOID") {
  try {
    const existing = await prisma.settlement.findUnique({ where: { id } });
    if (!existing) throw new Error("结算单不存在");
    const context = await requireUserContext({ storeId: existing.storeId });
    if (existing.storeId !== context.activeStoreId) throw new Error("无权操作该结算单");
    if (existing.status === "VOID") throw new Error("已作废结算单不能继续操作");
    if (nextStatus === "PAID" && existing.status !== "CONFIRMED") {
      throw new Error("结算单确认后才能标记支付");
    }

    const settlement = await prisma.settlement.update({
      where: { id },
      data: {
        status: nextStatus,
        confirmedAt: nextStatus === "CONFIRMED" ? new Date() : existing.confirmedAt,
        paidAt: nextStatus === "PAID" ? new Date() : existing.paidAt,
        voidedAt: nextStatus === "VOID" ? new Date() : existing.voidedAt,
        updatedById: context.userId,
      },
    });

    revalidateSettlementSurfaces(settlement.id, settlement.fulfillmentRequestId ?? undefined);
    return actionSuccess({ id: settlement.id, status: settlement.status });
  } catch (error) {
    return toActionFailure(error, "更新结算状态失败，请重试");
  }
}
