"use server";

import Decimal from "decimal.js";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { calculateAgreement, parseAgreementRule } from "@/lib/application/trading-agreement";
import { requireUserContext } from "@/lib/auth/user-context";
import { convertMoney, createStoreMoneyConverter } from "@/lib/fx";
import { prisma } from "@/lib/prisma";
import { notifyOrganizationAdministrators } from "@/lib/application/collaboration-notifications";
import { hasRoleAtLeast, ROLES } from "@/lib/auth/permissions";

type StringableDecimal = { toString(): string };

function earningTypeForChargeCategory(code: string) {
  if (code === "FULFILLMENT") return "FULFILLMENT_SERVICE_FEE";
  if (code === "INSPECTION") return "INSPECTION_SERVICE_FEE";
  if (code === "STORAGE") return "STORAGE_SERVICE_FEE";
  return null;
}

export type SerializedSettlement = {
  id: string;
  storeId: string;
  payerOrganizationId: string | null;
  payeeOrganizationId: string | null;
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
  agreementTermsSnapshot: string | null;
  agreementRuleSnapshot: unknown;
  agreementVersion: number | null;
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
  items?: Array<{
    id: string;
    amount: StringableDecimal;
    chargeEvent: {
      id: string;
      sourceType: string;
      sourceId: string;
      description: string;
      currency: string;
      category: { name: string; groupCode: string };
    };
  }>;
};

function serializeSettlement(settlement: RawSettlement): SerializedSettlement {
  return {
    ...settlement,
    totalAmount: settlement.totalAmount.toString(),
    fxRate: settlement.fxRate?.toString() ?? null,
    baseAmount: settlement.baseAmount?.toString() ?? null,
    lines: [
      ...settlement.lines.map((line) => ({
        ...line,
        amount: line.amount.toString(),
      })),
      ...(settlement.items ?? []).map((item) => ({
        id: item.id,
        lineType: item.chargeEvent.category.groupCode,
        description: item.chargeEvent.description,
        amount: item.amount.toString(),
        currency: item.chargeEvent.currency,
        direction: settlement.direction,
        sourceType: item.chargeEvent.sourceType,
        sourceId: item.chargeEvent.sourceId,
      })),
    ],
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
  direction: "PAYABLE" | "RECEIVABLE" | "INFORMATIONAL";
  sourceType: string;
  sourceId: string;
  baseCurrency: string;
  effectiveAt: Date;
}) {
  const baseAmount = await convertMoney({
    amount: input.amount,
    fromCurrency: input.currency,
    toCurrency: input.baseCurrency,
    effectiveAt: input.effectiveAt,
  });
  const fxRate = input.amount.eq(0) ? new Decimal(1) : baseAmount.div(input.amount);

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
  items: {
    include: { chargeEvent: { include: { category: true } } },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

export async function getSettlements(storeId?: string) {
  const context = await requireUserContext(storeId ? { storeId } : undefined);
  const settlements = await prisma.settlement.findMany({
    where: {
      OR: [
        { storeId: context.activeStoreId },
        { payerOrganizationId: context.organizationId },
        { payeeOrganizationId: context.organizationId },
      ],
    },
    include: settlementInclude,
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
  return settlements.map(serializeSettlement);
}

export async function getSettlementById(id: string, storeId?: string) {
  const context = await requireUserContext(storeId ? { storeId } : undefined);
  const settlement = await prisma.settlement.findFirst({
    where: {
      id,
      OR: [
        { storeId: context.activeStoreId },
        { payerOrganizationId: context.organizationId },
        { payeeOrganizationId: context.organizationId },
      ],
    },
    include: settlementInclude,
  });
  return settlement ? serializeSettlement(settlement) : null;
}

export async function createSettlementFromFulfillment(input: {
  fulfillmentRequestId: string;
  actorUserId: string;
}) {
    const request = await prisma.fulfillmentRequest.findFirst({
      where: {
        id: input.fulfillmentRequestId,
        status: { in: ["SHIPPED", "DELIVERED"] },
      },
      include: {
        supplyOffer: { include: { ownerPartner: true, organization: true } },
        resaleListing: true,
        settlements: true,
      },
    });

    if (!request) throw new Error("只有已发货或已送达的履约请求可以生成结算");
    const activeSettlement = request.settlements.find((settlement) => settlement.status !== "VOID");
    if (activeSettlement) {
      return { id: activeSettlement.id, created: false };
    }
    if (!request.resaleListing) throw new Error("履约请求缺少代卖记录，无法计算结算");

    const qty = new Decimal(request.quantity.toString());
    const resale = request.resaleListing;
    if (!resale.agreementRuleSnapshot || !resale.agreementTermsSnapshot || !resale.agreementVersion) {
      throw new Error("代卖记录缺少双方已接受的合作约定快照，不能自动生成结算");
    }
    const agreementRule = parseAgreementRule(resale.agreementRuleSnapshot);
    if (agreementRule.kind === "MANUAL") {
      throw new Error("本单约定为成交后双方确认，请先录入双方确认的结算明细，再确认结算");
    }
    const effectiveAt = request.shippedAt ?? request.deliveredAt ?? request.requestedAt;
    const supplyCurrency = resale.supplyCurrency || request.supplyOffer.currency;
    const shippingFee = request.shippingFee ? new Decimal(request.shippingFee.toString()) : new Decimal(0);
    const actualFulfillmentCharge = await prisma.chargeEvent.findFirst({
      where: {
        sourceType: "FULFILLMENT_REQUEST",
        sourceId: request.id,
        amountKind: "ACTUAL",
        status: { not: "VOID" },
        category: { code: "FULFILLMENT" },
      },
      orderBy: { createdAt: "desc" },
    });
    // 发货时人工录入的是本单实际服务费总额；合作约定中的代发费才是单件默认值。
    // 优先采用已落账的实际金额，避免用户覆盖默认值后结算仍使用旧配置。
    const fulfillmentFeePerUnit = actualFulfillmentCharge
      ? new Decimal(actualFulfillmentCharge.amount.toString()).div(qty)
      : resale.dropshipFee ?? request.supplyOffer.dropshipFee;
    const fulfillmentFeeCurrency = actualFulfillmentCharge?.currency ||
      resale.dropshipFeeCurrency ||
      request.supplyOffer.dropshipFeeCurrency ||
      request.supplyOffer.settlementCurrency ||
      request.supplyOffer.currency;
    const calculation = await calculateAgreement({
      rule: agreementRule,
      quantity: qty,
      saleUnitPrice: resale.targetPrice,
      saleCurrency: resale.currency,
      supplyUnitPrice: resale.supplyUnitPrice,
      supplyCurrency,
      platformFeeRate: resale.platformFeeRate,
      fulfillmentFeePerUnit,
      fulfillmentFeeCurrency,
      shippingFee,
      shippingCurrency: request.shippingCurrency || resale.currency,
      effectiveAt,
    });
    const supplyCost = calculation.supplyCost;
    const platformFee = calculation.platformFee;
    const commission = calculation.resellerCommission ?? new Decimal(0);
    const ownerProfitShare =
      agreementRule.kind === "PROFIT_PERCENT" && calculation.distributableProfit
        ? calculation.distributableProfit.minus(commission)
        : new Decimal(0);
    const supplyPayeeOrganizationId =
      request.supplyOffer.organizationId ?? request.providerOrganizationId;
    const usesSeparateProviderLedger = Boolean(
      request.providerOrganizationId &&
      supplyPayeeOrganizationId &&
      request.providerOrganizationId !== supplyPayeeOrganizationId
    );
    // Third-party fulfillment is settled with the actual provider through the
    // charge ledger created at shipping. Do not also pay those fees to the
    // supply owner on this supply settlement.
    const converter = await createStoreMoneyConverter(request.storeId);
    const lines = (await Promise.all([
      buildSettlementLine({
        lineType: "FULFILLMENT_FEE",
        description: "代发服务费",
        amount: calculation.fulfillmentFee,
        currency: resale.currency,
        direction: usesSeparateProviderLedger ? "INFORMATIONAL" : "PAYABLE",
        sourceType: "FULFILLMENT_REQUEST",
        sourceId: request.id,
        baseCurrency: converter.baseCurrency,
        effectiveAt,
      }),
      buildSettlementLine({
        lineType: "SUPPLY_COST",
        description: "供货货款",
        amount: supplyCost,
        currency: resale.currency,
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
        direction: agreementRule.kind === "PROFIT_PERCENT" ? "INFORMATIONAL" : "RECEIVABLE",
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
        direction: "INFORMATIONAL",
        sourceType: "RESALE_LISTING",
        sourceId: resale.id,
        baseCurrency: converter.baseCurrency,
        effectiveAt,
      }),
      buildSettlementLine({
        lineType: "SHIPPING_FEE",
        description: "代发运费",
        amount: calculation.shippingFee,
        currency: resale.currency,
        direction: usesSeparateProviderLedger ? "INFORMATIONAL" : "PAYABLE",
        sourceType: "FULFILLMENT_REQUEST",
        sourceId: request.id,
        baseCurrency: converter.baseCurrency,
        effectiveAt,
      }),
      buildSettlementLine({
        lineType: "OWNER_PROFIT_SHARE",
        description: "货主利润分配",
        amount: ownerProfitShare,
        currency: resale.currency,
        direction: "PAYABLE",
        sourceType: "RESALE_LISTING",
        sourceId: resale.id,
        baseCurrency: converter.baseCurrency,
        effectiveAt,
      }),
    ])).filter((line) => !line.amount.eq(0));
    const totalAmount = lines.reduce((total, line) => {
      if (line.direction === "PAYABLE") return total.plus(line.baseAmount);
      if (line.direction === "RECEIVABLE") return total.minus(line.baseAmount);
      return total;
    }, new Decimal(0));

    const settlement = await prisma.$transaction(async (tx) => {
      const created = await tx.settlement.create({
        data: {
          storeId: request.storeId,
          payerOrganizationId: request.requesterOrganizationId,
          payeeOrganizationId: supplyPayeeOrganizationId,
          partnerId: request.supplyOffer.ownerPartnerId,
          fulfillmentRequestId: request.id,
          customerOrderId: request.customerOrderId,
          settlementNo: nextSettlementNo(),
          direction: "PAYABLE",
          currency: converter.baseCurrency,
          totalAmount,
          baseCurrency: converter.baseCurrency,
          fxRate: new Decimal(1),
          baseAmount: totalAmount,
          agreementTermsSnapshot: resale.agreementTermsSnapshot,
          agreementRuleSnapshot: resale.agreementRuleSnapshot as Prisma.InputJsonValue,
          agreementVersion: resale.agreementVersion,
          note: `由履约请求 ${request.requestNo} 按实际发货费用生成`,
          createdById: input.actorUserId,
          updatedById: input.actorUserId,
          lines: {
            create: lines,
          },
        },
      });

      const commissionLine = lines.find((line) => line.lineType === "COMMISSION");
      if (commissionLine && commissionLine.baseAmount.gt(0) && resale.createdById) {
        const wallet = await tx.walletAccount.upsert({
          where: {
            storeId_ownerType_ownerId_currency: {
              storeId: request.storeId,
              ownerType: "USER",
              ownerId: resale.createdById,
              currency: converter.baseCurrency,
            },
          },
          update: {},
          create: {
            storeId: request.storeId,
            ownerType: "USER",
            ownerId: resale.createdById,
            currency: converter.baseCurrency,
          },
        });
        await tx.earningEvent.upsert({
          where: {
            storeId_userId_sourceType_sourceId_earningType: {
              storeId: request.storeId,
              userId: resale.createdById,
              sourceType: "SETTLEMENT",
              sourceId: created.id,
              earningType: "RESALE_COMMISSION",
            },
          },
          update: {
            walletAccountId: wallet.id,
            grossAmount: commissionLine.amount,
            baseAmount: commissionLine.baseAmount,
            earningAmount: commissionLine.baseAmount,
            currency: converter.baseCurrency,
            status: "PENDING",
            updatedById: input.actorUserId,
          },
          create: {
            storeId: request.storeId,
            walletAccountId: wallet.id,
            partnerId: request.supplyOffer.ownerPartnerId,
            userId: resale.createdById,
            sourceType: "SETTLEMENT",
            sourceId: created.id,
            earningType: "RESALE_COMMISSION",
            description: `代卖结算 ${created.settlementNo} 待确认佣金`,
            grossAmount: commissionLine.amount,
            baseAmount: commissionLine.baseAmount,
            earningAmount: commissionLine.baseAmount,
            currency: converter.baseCurrency,
            status: "PENDING",
            occurredAt: effectiveAt,
            metadata: {
              originalAmount: commissionLine.amount.toString(),
              originalCurrency: commissionLine.currency,
              fxRate: commissionLine.fxRate?.toString() ?? null,
              agreementVersion: resale.agreementVersion,
            },
            createdById: input.actorUserId,
            updatedById: input.actorUserId,
          },
        });
      }
      return created;
    });

    return { id: settlement.id, created: true };
}

export async function createSettlementFromFulfillmentAction(fulfillmentRequestId: string, storeId?: string) {
  try {
    const context = await requireUserContext(storeId ? { storeId } : undefined);
    const request = await prisma.fulfillmentRequest.findUnique({
      where: { id: fulfillmentRequestId },
      select: {
        id: true,
        storeId: true,
        requesterOrganizationId: true,
        providerOrganizationId: true,
      },
    });
    if (!request) throw new Error("履约请求不存在");
    const canAccess =
      context.storeIds.includes(request.storeId) ||
      request.requesterOrganizationId === context.organizationId ||
      request.providerOrganizationId === context.organizationId;
    if (!canAccess) throw new Error("无权为该履约请求生成结算");
    const settlement = await createSettlementFromFulfillment({
      fulfillmentRequestId,
      actorUserId: context.userId,
    });
    revalidateSettlementSurfaces(settlement.id, request.id);
    return actionSuccess(settlement);
  } catch (error) {
    return toActionFailure(error, "生成结算单失败，请重试");
  }
}

export async function changeSettlementStatusAction(id: string, nextStatus: "CONFIRMED" | "PAID" | "VOID") {
  try {
    const existing = await prisma.settlement.findUnique({
      where: { id },
      include: {
        lines: true,
        items: true,
        fulfillmentRequest: {
          include: {
            resaleListing: {
              select: { id: true, createdById: true },
            },
          },
        },
      },
    });
    if (!existing) throw new Error("结算单不存在");
    const context = await requireUserContext();
    const isLegacyStoreMember = context.storeIds.includes(existing.storeId);
    const isPayer = existing.payerOrganizationId === context.organizationId;
    const isPayee = existing.payeeOrganizationId === context.organizationId;
    if (!isLegacyStoreMember && !isPayer && !isPayee) throw new Error("无权操作该结算单");
    if (!hasRoleAtLeast(context.role, ROLES.FINANCE)) {
      throw new Error("只有财务或管理角色可以确认、结清或作废结算");
    }
    if ((existing.payerOrganizationId || existing.payeeOrganizationId) && !isPayer) {
      throw new Error("结算只能由付款方确认、标记线下结清或作废；收款方仅可查看");
    }
    if (existing.status === "VOID") throw new Error("已作废结算单不能继续操作");
    if (existing.status === "PAID") {
      throw new Error("已线下结清的记录不能重复操作或作废");
    }
    if (nextStatus === "PAID" && existing.status !== "CONFIRMED") {
      throw new Error("结算记录确认后才能标记线下已结清");
    }

    const settlement = await prisma.$transaction(async (tx) => {
      const changed = await tx.settlement.update({
        where: { id },
        data: {
          status: nextStatus,
          confirmedAt: nextStatus === "CONFIRMED" ? new Date() : existing.confirmedAt,
          paidAt: nextStatus === "PAID" ? new Date() : existing.paidAt,
          voidedAt: nextStatus === "VOID" ? new Date() : existing.voidedAt,
          updatedById: context.userId,
        },
      });

      if (["PAID", "VOID"].includes(nextStatus) && existing.items.length > 0) {
        for (const item of existing.items) {
          const event = await tx.chargeEvent.findUniqueOrThrow({
            where: { id: item.chargeEventId },
            include: {
              category: true,
              settlementItems: { include: { settlement: true } },
            },
          });
          const paid = event.settlementItems
            .filter((row) => row.settlement.status === "PAID")
            .reduce((sum, row) => sum.plus(row.amount), new Decimal(0));
          const chargeStatus = paid.gte(event.amount)
            ? "SETTLED"
            : paid.gt(0)
              ? "PARTIALLY_SETTLED"
              : "CONFIRMED";
          await tx.chargeEvent.update({
            where: { id: event.id },
            data: { status: chargeStatus },
          });
          const earningType = earningTypeForChargeCategory(event.category.code);
          if (earningType && event.sourceId) {
            const earnings = await tx.earningEvent.findMany({
              where: {
                sourceType: event.sourceType,
                sourceId: event.sourceId,
                earningType,
                status: { not: "VOID" },
              },
            });
            for (const earning of earnings) {
              const settled = chargeStatus === "SETTLED";
              const changedEarning = await tx.earningEvent.update({
                where: { id: earning.id },
                data: {
                  status: settled ? "SETTLED" : "CONFIRMED",
                  settledAt: settled ? new Date() : null,
                  updatedById: context.userId,
                },
              });
              if (settled && changedEarning.walletAccountId) {
                await tx.walletLedgerEntry.upsert({
                  where: { earningEventId: changedEarning.id },
                  update: {},
                  create: {
                    storeId: changedEarning.storeId,
                    walletAccountId: changedEarning.walletAccountId,
                    earningEventId: changedEarning.id,
                    entryType: "CREDIT",
                    amount: changedEarning.earningAmount,
                    currency: changedEarning.currency,
                    status: "POSTED",
                    sourceType: changedEarning.sourceType,
                    sourceId: changedEarning.sourceId,
                    description: changedEarning.description,
                    postedAt: new Date(),
                    createdById: context.userId,
                  },
                });
              }
            }
          }
        }
      }

      if (nextStatus !== "PAID") return changed;

      const commissionLine = existing.lines.find(
        (line) => line.lineType === "COMMISSION",
      );
      const commissionOwnerId =
        existing.fulfillmentRequest?.resaleListing?.createdById ?? context.userId;
      const earningAmount = commissionLine
        ? new Decimal(
            (commissionLine.baseAmount ?? commissionLine.amount).toString(),
          )
        : new Decimal(0);

      if (!commissionLine || earningAmount.lte(0)) return changed;

      const walletCurrency =
        commissionLine.baseCurrency ?? commissionLine.currency;
      const wallet = await tx.walletAccount.upsert({
        where: {
          storeId_ownerType_ownerId_currency: {
            storeId: existing.storeId,
            ownerType: "USER",
            ownerId: commissionOwnerId,
            currency: walletCurrency,
          },
        },
        update: {},
        create: {
          storeId: existing.storeId,
          ownerType: "USER",
          ownerId: commissionOwnerId,
          currency: walletCurrency,
        },
      });

      const earning = await tx.earningEvent.upsert({
        where: {
          storeId_userId_sourceType_sourceId_earningType: {
            storeId: existing.storeId,
            userId: commissionOwnerId,
            sourceType: "SETTLEMENT",
            sourceId: existing.id,
            earningType: "RESALE_COMMISSION",
          },
        },
        update: {
          walletAccountId: wallet.id,
          earningAmount,
          currency: walletCurrency,
          status: "SETTLED",
          settledAt: changed.paidAt,
          updatedById: context.userId,
        },
        create: {
          storeId: existing.storeId,
          walletAccountId: wallet.id,
          partnerId: existing.partnerId,
          userId: commissionOwnerId,
          sourceType: "SETTLEMENT",
          sourceId: existing.id,
          earningType: "RESALE_COMMISSION",
          description: `代卖结算 ${existing.settlementNo} 佣金`,
          grossAmount: commissionLine.amount,
          baseAmount: earningAmount,
          earningAmount,
          currency: walletCurrency,
          status: "SETTLED",
          occurredAt: changed.paidAt ?? new Date(),
          settledAt: changed.paidAt,
          metadata: {
            originalAmount: commissionLine.amount.toString(),
            originalCurrency: commissionLine.currency,
            fxRate: commissionLine.fxRate?.toString() ?? null,
            settlementLineId: commissionLine.id,
          },
          createdById: context.userId,
          updatedById: context.userId,
        },
      });

      await tx.walletLedgerEntry.upsert({
        where: { earningEventId: earning.id },
        update: {},
        create: {
          storeId: existing.storeId,
          walletAccountId: wallet.id,
          earningEventId: earning.id,
          entryType: "CREDIT",
          amount: earningAmount,
          currency: walletCurrency,
          status: "POSTED",
          sourceType: "SETTLEMENT",
          sourceId: existing.id,
          description: earning.description,
          metadata: {
            settlementNo: existing.settlementNo,
            settlementLineId: commissionLine.id,
          },
          postedAt: changed.paidAt ?? new Date(),
          createdById: context.userId,
        },
      });

      return changed;
    });

    const counterpartOrganizationId = isPayer
      ? settlement.payeeOrganizationId
      : settlement.payerOrganizationId;
    if (counterpartOrganizationId) {
      await notifyOrganizationAdministrators({
        organizationId: counterpartOrganizationId,
        actorId: context.userId,
        roles: [ROLES.OWNER, ROLES.ADMIN, ROLES.FINANCE],
        refType: "SETTLEMENT",
        refId: settlement.id,
        type: "SETTLEMENT_STATUS_CHANGED",
        title: `结算 ${existing.settlementNo} 状态已更新`,
        body: `当前状态：${settlement.status}`,
        actionUrl: `/finance/settlements/${encodeURIComponent(settlement.id)}`,
        dedupeKey: `settlement:${settlement.id}:status:${settlement.status}`,
        priority: settlement.status === "VOID" ? "HIGH" : "NORMAL",
      });
    }

    revalidateSettlementSurfaces(settlement.id, settlement.fulfillmentRequestId ?? undefined);
    if (nextStatus === "PAID") {
      revalidatePath("/finance/wallet");
      revalidatePath("/reports");
    }
    return actionSuccess({ id: settlement.id, status: settlement.status });
  } catch (error) {
    return toActionFailure(error, "更新结算状态失败，请重试");
  }
}
