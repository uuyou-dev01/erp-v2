"use server";

import Decimal from "decimal.js";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import {
  assertChargeTransition,
  calculateSuggestedCharge,
  CHARGE_GROUPS,
  settlementRemainder,
  type ChargeCalculationMethod,
} from "@/lib/application/charge-ledger";
import { hasRoleAtLeast, ROLES } from "@/lib/auth/permissions";
import { requireUserContext } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";
import { getLatestFxRate } from "@/lib/fx";

export type ChargePartyInput = {
  role: "PAYER" | "PAYEE" | "BENEFICIARY";
  partyType: "ORGANIZATION" | "USER" | "PARTNER" | "CHANNEL_ACCOUNT" | "CUSTOMER";
  partyId: string;
  organizationId?: string;
  name: string;
};

export type ChargeAllocationInput = {
  targetType: string;
  targetId: string;
  amount: string;
  allocationMethod?: string;
};

function parsePositiveAmount(value: string, label = "费用金额") {
  const amount = new Decimal(value);
  if (!amount.isFinite() || amount.lte(0)) throw new Error(`${label}必须大于 0`);
  return amount.toDecimalPlaces(4);
}

function revalidateChargeSurfaces() {
  revalidatePath("/finance/charges");
  revalidatePath("/finance/settlements");
  revalidatePath("/fulfillment/requests");
  revalidatePath("/reports");
  revalidatePath("/finance/wallet");
}

function earningTypeForChargeCategory(code: string) {
  if (code === "FULFILLMENT") return "FULFILLMENT_SERVICE_FEE";
  if (code === "INSPECTION") return "INSPECTION_SERVICE_FEE";
  if (code === "STORAGE") return "STORAGE_SERVICE_FEE";
  return null;
}

function chargeVisibilityWhere(organizationId: string) {
  return {
    OR: [
      { organizationId },
      { parties: { some: { organizationId } } },
    ],
  };
}

export async function getChargeLedgerData(filters?: {
  status?: string;
  sourceType?: string;
  sourceId?: string;
}) {
  const context = await requireUserContext();
  const [events, categories, rules, organizations] = await Promise.all([
    prisma.chargeEvent.findMany({
      where: {
        ...chargeVisibilityWhere(context.organizationId),
        status: filters?.status || undefined,
        sourceType: filters?.sourceType || undefined,
        sourceId: filters?.sourceId || undefined,
      },
      include: {
        category: true,
        parties: true,
        allocations: true,
        settlementItems: { include: { settlement: true } },
        reversalOf: { select: { id: true, description: true } },
      },
      orderBy: [{ status: "asc" }, { occurredAt: "desc" }],
    }),
    prisma.chargeCategory.findMany({
      where: {
        status: "ACTIVE",
        OR: [{ scope: "SYSTEM" }, { organizationId: context.organizationId }],
      },
      orderBy: [{ groupCode: "asc" }, { name: "asc" }],
    }),
    prisma.chargeRule.findMany({
      where: { organizationId: context.organizationId, status: "ACTIVE" },
      include: { category: true },
      orderBy: { name: "asc" },
    }),
    prisma.organization.findMany({
      where: {
        OR: [
          { id: context.organizationId },
          {
            serviceAgreementsAsClient: {
              some: { providerOrganizationId: context.organizationId, status: "ACTIVE" },
            },
          },
          {
            serviceAgreementsAsProvider: {
              some: { clientOrganizationId: context.organizationId, status: "ACTIVE" },
            },
          },
        ],
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    currentOrganizationId: context.organizationId,
    events: events.map((event) => ({
      ...event,
      amount: event.amount.toString(),
      fxRate: event.fxRate?.toString() ?? null,
      baseAmount: event.baseAmount?.toString() ?? null,
      allocations: event.allocations.map((allocation) => ({
        ...allocation,
        amount: allocation.amount.toString(),
      })),
      settledAmount: event.settlementItems
        .filter((item) => item.settlement.status !== "VOID")
        .reduce((sum, item) => sum.plus(item.amount), new Decimal(0))
        .toString(),
    })),
    categories,
    rules: rules.map((rule) => ({
      ...rule,
      fixedAmount: rule.fixedAmount?.toString() ?? null,
      rate: rule.rate?.toString() ?? null,
    })),
    organizations,
  };
}

export async function createChargeCategoryAction(data: {
  groupCode: string;
  code: string;
  name: string;
}) {
  try {
    const context = await requireUserContext();
    if (!hasRoleAtLeast(context.role, ROLES.MANAGER)) throw new Error("无权维护费用分类");
    if (!CHARGE_GROUPS.includes(data.groupCode as (typeof CHARGE_GROUPS)[number])) {
      throw new Error("费用大类无效");
    }
    const code = data.code.trim().toUpperCase().replace(/\s+/g, "_");
    const name = data.name.trim();
    if (!code || !name) throw new Error("请填写费用代码和名称");
    const category = await prisma.chargeCategory.create({
      data: {
        organizationId: context.organizationId,
        scope: "ORGANIZATION",
        groupCode: data.groupCode,
        code,
        name,
      },
    });
    revalidateChargeSurfaces();
    return actionSuccess({ id: category.id });
  } catch (error) {
    return toActionFailure(error, "创建费用分类失败");
  }
}

export async function createChargeRuleAction(data: {
  serviceAgreementId?: string;
  categoryId: string;
  name: string;
  calculationMethod: ChargeCalculationMethod;
  fixedAmount?: string;
  rate?: string;
  currency?: string;
  config?: Record<string, unknown>;
}) {
  try {
    const context = await requireUserContext();
    if (!hasRoleAtLeast(context.role, ROLES.MANAGER)) throw new Error("无权维护收费规则");
    const category = await prisma.chargeCategory.findFirst({
      where: {
        id: data.categoryId,
        OR: [{ scope: "SYSTEM" }, { organizationId: context.organizationId }],
      },
    });
    if (!category) throw new Error("费用分类不存在");
    const fixedAmount = data.fixedAmount ? new Decimal(data.fixedAmount) : null;
    const rate = data.rate ? new Decimal(data.rate) : null;
    calculateSuggestedCharge({
      method: data.calculationMethod,
      fixedAmount,
      rate,
      quantity: 1,
      baseAmount: 1,
    });
    const rule = await prisma.chargeRule.create({
      data: {
        organizationId: context.organizationId,
        serviceAgreementId: data.serviceAgreementId || null,
        categoryId: data.categoryId,
        name: data.name.trim(),
        calculationMethod: data.calculationMethod,
        fixedAmount,
        rate,
        currency: data.currency || null,
        config: data.config as Prisma.InputJsonValue | undefined,
      },
    });
    revalidateChargeSurfaces();
    return actionSuccess({ id: rule.id });
  } catch (error) {
    return toActionFailure(error, "创建收费规则失败");
  }
}

export async function createChargeEventAction(data: {
  categoryId: string;
  ruleId?: string;
  sourceType: string;
  sourceId: string;
  idempotencyKey?: string;
  amountKind?: "ESTIMATE" | "ACTUAL";
  amount?: string;
  quantity?: string;
  baseAmount?: string;
  currency: string;
  baseCurrency?: string;
  fxRate?: string;
  description: string;
  evidence?: Record<string, unknown>;
  parties: ChargePartyInput[];
  allocations?: ChargeAllocationInput[];
  submit?: boolean;
}) {
  try {
    const context = await requireUserContext();
    const category = await prisma.chargeCategory.findFirst({
      where: {
        id: data.categoryId,
        status: "ACTIVE",
        OR: [{ scope: "SYSTEM" }, { organizationId: context.organizationId }],
      },
    });
    if (!category) throw new Error("费用分类不存在或不可用");
    const payer = data.parties.find((party) => party.role === "PAYER");
    const payee = data.parties.find((party) => party.role === "PAYEE");
    if (!payer || !payee) throw new Error("费用必须明确付款方和收款方");
    if (!data.parties.some((party) => party.organizationId === context.organizationId)) {
      throw new Error("当前经营主体必须是费用相关方");
    }

    const rule = data.ruleId
      ? await prisma.chargeRule.findFirst({
          where: { id: data.ruleId, organizationId: context.organizationId, status: "ACTIVE" },
        })
      : null;
    const amount = data.amount
      ? parsePositiveAmount(data.amount)
      : rule
        ? calculateSuggestedCharge({
            method: rule.calculationMethod as ChargeCalculationMethod,
            fixedAmount: rule.fixedAmount,
            rate: rule.rate,
            quantity: data.quantity,
            baseAmount: data.baseAmount,
          }).toDecimalPlaces(4)
        : new Decimal(0);
    if (amount.lte(0)) throw new Error("费用金额必须大于 0");
    const currency = data.currency.toUpperCase();
    const store = await prisma.store.findUniqueOrThrow({
      where: { id: context.activeStoreId },
      select: { currency: true },
    });
    const baseCurrency = (data.baseCurrency || store.currency).toUpperCase();
    const inputFxRate = data.fxRate ? new Decimal(data.fxRate) : null;
    if (inputFxRate && (!inputFxRate.isFinite() || inputFxRate.lte(0))) throw new Error("汇率必须大于 0");
    const fxRate = inputFxRate
      ? inputFxRate.toDecimalPlaces(8)
      : currency === baseCurrency
        ? new Decimal(1)
        : await getLatestFxRate(currency, baseCurrency, new Date());
    if (!fxRate && (data.amountKind ?? (data.amount ? "ACTUAL" : "ESTIMATE")) === "ACTUAL") {
      throw new Error(`缺少 ${currency} → ${baseCurrency} 汇率，请提供汇率快照`);
    }
    const allocationTotal = (data.allocations ?? []).reduce(
      (sum, allocation) => sum.plus(parsePositiveAmount(allocation.amount, "分摊金额")),
      new Decimal(0),
    );
    if (data.allocations?.length && !allocationTotal.eq(amount)) {
      throw new Error("费用分摊合计必须等于费用金额");
    }

    const event = await prisma.chargeEvent.create({
      data: {
        organizationId: context.organizationId,
        categoryId: data.categoryId,
        ruleId: rule?.id ?? null,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        idempotencyKey: data.idempotencyKey || null,
        amountKind: data.amountKind ?? (data.amount ? "ACTUAL" : "ESTIMATE"),
        amount,
        currency,
        baseCurrency,
        fxRate,
        baseAmount: fxRate ? amount.mul(fxRate).toDecimalPlaces(4) : null,
        status: data.submit ? "SUBMITTED" : "DRAFT",
        description: data.description.trim(),
        evidence: data.evidence as Prisma.InputJsonValue | undefined,
        createdById: context.userId,
        submittedById: data.submit ? context.userId : null,
        submittedAt: data.submit ? new Date() : null,
        parties: {
          create: data.parties.map((party) => ({
            role: party.role,
            partyType: party.partyType,
            partyId: party.partyId,
            organizationId: party.organizationId || null,
            nameSnapshot: party.name.trim(),
          })),
        },
        allocations: data.allocations?.length
          ? {
              create: data.allocations.map((allocation) => ({
                targetType: allocation.targetType,
                targetId: allocation.targetId,
                amount: parsePositiveAmount(allocation.amount, "分摊金额"),
                allocationMethod: allocation.allocationMethod || "MANUAL",
              })),
            }
          : undefined,
      },
    });
    revalidateChargeSurfaces();
    return actionSuccess({ id: event.id, status: event.status });
  } catch (error) {
    return toActionFailure(error, "保存费用失败");
  }
}

export async function transitionChargeEventAction(
  id: string,
  nextStatus: "SUBMITTED" | "CONFIRMED" | "DISPUTED" | "VOID",
  reason?: string,
) {
  try {
    const context = await requireUserContext();
    const event = await prisma.chargeEvent.findFirst({
      where: { id, ...chargeVisibilityWhere(context.organizationId) },
      include: { parties: true, category: true },
    });
    if (!event) throw new Error("费用不存在或无权访问");
    assertChargeTransition(event.status, nextStatus);
    const payer = event.parties.find((party) => party.role === "PAYER");
    const payee = event.parties.find((party) => party.role === "PAYEE");
    if (nextStatus === "SUBMITTED" && payee?.organizationId !== context.organizationId) {
      throw new Error("只有收款方可以提交费用");
    }
    if (["CONFIRMED", "DISPUTED"].includes(nextStatus) && payer?.organizationId !== context.organizationId) {
      throw new Error("只有付款方可以确认或提出争议");
    }
    if (nextStatus === "VOID" && event.organizationId !== context.organizationId) {
      throw new Error("只有费用登记主体可以作废未确认费用");
    }
    if (nextStatus === "DISPUTED" && !reason?.trim()) throw new Error("请填写争议原因");

    const changed = await prisma.$transaction(async (tx) => {
      const updated = await tx.chargeEvent.update({
        where: { id },
        data: {
          status: nextStatus,
          submittedById: nextStatus === "SUBMITTED" ? context.userId : event.submittedById,
          submittedAt: nextStatus === "SUBMITTED" ? new Date() : event.submittedAt,
          confirmedById: nextStatus === "CONFIRMED" ? context.userId : event.confirmedById,
          confirmedAt: nextStatus === "CONFIRMED" ? new Date() : event.confirmedAt,
          disputedById: nextStatus === "DISPUTED" ? context.userId : event.disputedById,
          disputedAt: nextStatus === "DISPUTED" ? new Date() : event.disputedAt,
          disputeReason: nextStatus === "DISPUTED" ? reason?.trim() : event.disputeReason,
          voidedById: nextStatus === "VOID" ? context.userId : event.voidedById,
          voidedAt: nextStatus === "VOID" ? new Date() : event.voidedAt,
        },
      });
      const earningType = earningTypeForChargeCategory(event.category.code);
      if (earningType && event.sourceId && nextStatus === "CONFIRMED") {
        await tx.earningEvent.updateMany({
          where: {
            sourceType: event.sourceType,
            sourceId: event.sourceId,
            earningType,
            status: "PENDING",
          },
          data: { status: "CONFIRMED", updatedById: context.userId },
        });
      }
      if (earningType && event.sourceId && nextStatus === "VOID") {
        await tx.earningEvent.updateMany({
          where: {
            sourceType: event.sourceType,
            sourceId: event.sourceId,
            earningType,
            status: { in: ["PENDING", "CONFIRMED"] },
          },
          data: { status: "VOID", updatedById: context.userId },
        });
      }
      return updated;
    });
    revalidateChargeSurfaces();
    return actionSuccess({ id: changed.id, status: changed.status });
  } catch (error) {
    return toActionFailure(error, "更新费用状态失败");
  }
}

export async function reverseChargeEventAction(id: string, reason: string) {
  try {
    const context = await requireUserContext();
    const event = await prisma.chargeEvent.findFirst({
      where: { id, ...chargeVisibilityWhere(context.organizationId) },
      include: { parties: true, allocations: true, reversals: true, category: true },
    });
    if (!event) throw new Error("费用不存在或无权访问");
    if (event.organizationId !== context.organizationId) {
      throw new Error("只有原费用登记主体可以发起冲销");
    }
    if (!reason.trim()) throw new Error("请填写冲销原因");
    if (!['CONFIRMED', 'PARTIALLY_SETTLED'].includes(event.status)) {
      throw new Error("只有已确认且未完全结算的费用可以冲销");
    }
    if (event.reversals.some((row) => row.status !== "VOID")) throw new Error("该费用已经冲销");
    const reversal = await prisma.chargeEvent.create({
      data: {
        organizationId: event.organizationId,
        categoryId: event.categoryId,
        reversalOfId: event.id,
        sourceType: event.sourceType,
        sourceId: event.sourceId,
        idempotencyKey: `reversal:${event.id}`,
        amountKind: "ACTUAL",
        amount: event.amount,
        currency: event.currency,
        baseCurrency: event.baseCurrency,
        fxRate: event.fxRate,
        baseAmount: event.baseAmount,
        status: "CONFIRMED",
        description: `冲销：${event.description}（${reason.trim()}）`,
        createdById: context.userId,
        submittedById: context.userId,
        submittedAt: new Date(),
        confirmedById: context.userId,
        confirmedAt: new Date(),
        parties: {
          create: event.parties.map((party) => ({
            role: party.role === "PAYER" ? "PAYEE" : party.role === "PAYEE" ? "PAYER" : party.role,
            partyType: party.partyType,
            partyId: party.partyId,
            organizationId: party.organizationId,
            nameSnapshot: party.nameSnapshot,
          })),
        },
        allocations: {
          create: event.allocations.map((allocation) => ({
            targetType: allocation.targetType,
            targetId: allocation.targetId,
            amount: allocation.amount,
            allocationMethod: allocation.allocationMethod,
          })),
        },
      },
    });
    const earningType = earningTypeForChargeCategory(event.category.code);
    if (earningType && event.sourceId) {
      await prisma.earningEvent.updateMany({
        where: {
          sourceType: event.sourceType,
          sourceId: event.sourceId,
          earningType,
          status: { in: ["PENDING", "CONFIRMED"] },
        },
        data: { status: "VOID", updatedById: context.userId },
      });
    }
    revalidateChargeSurfaces();
    return actionSuccess({ id: reversal.id });
  } catch (error) {
    return toActionFailure(error, "冲销费用失败");
  }
}

export async function createSettlementFromChargesAction(
  chargeEventIds: string[],
  requestedAmounts?: Record<string, string>,
) {
  try {
    const context = await requireUserContext();
    if (!hasRoleAtLeast(context.role, ROLES.FINANCE)) throw new Error("只有财务角色可以创建结算单");
    const events = await prisma.chargeEvent.findMany({
      where: {
        id: { in: [...new Set(chargeEventIds)] },
        status: { in: ["CONFIRMED", "PARTIALLY_SETTLED"] },
        ...chargeVisibilityWhere(context.organizationId),
      },
      include: {
        parties: true,
        settlementItems: { include: { settlement: true } },
      },
    });
    if (events.length !== new Set(chargeEventIds).size) throw new Error("部分费用不可结算");
    const first = events[0];
    if (!first) throw new Error("请选择费用");
    const payer = first.parties.find((party) => party.role === "PAYER" && party.organizationId);
    const payee = first.parties.find((party) => party.role === "PAYEE" && party.organizationId);
    if (!payer?.organizationId || !payee?.organizationId) throw new Error("主体结算要求双方都是系统经营主体");
    if (
      events.some((event) => {
        const eventPayer = event.parties.find((party) => party.role === "PAYER")?.organizationId;
        const eventPayee = event.parties.find((party) => party.role === "PAYEE")?.organizationId;
        return event.currency !== first.currency || eventPayer !== payer.organizationId || eventPayee !== payee.organizationId;
      })
    ) {
      throw new Error("一张结算单只能包含相同付款方、收款方和币种的费用");
    }

    const items = events.map((event) => {
      const available = settlementRemainder({
        amount: event.amount,
        settledAmounts: event.settlementItems
          .filter((item) => item.settlement.status !== "VOID")
          .map((item) => item.amount),
      });
      const requested = requestedAmounts?.[event.id]
        ? parsePositiveAmount(requestedAmounts[event.id], "结算金额")
        : available;
      if (requested.gt(available)) throw new Error("结算金额不能超过费用未结余额");
      return { event, remaining: requested };
    });
    if (items.some((item) => item.remaining.lte(0))) throw new Error("所选费用已全部结算");
    const totalAmount = items.reduce((sum, item) => sum.plus(item.remaining), new Decimal(0));
    const store = await prisma.store.findUniqueOrThrow({
      where: { id: context.activeStoreId },
      select: { currency: true },
    });
    const baseCurrency = store.currency;
    const fxRate = first.currency === baseCurrency
      ? new Decimal(1)
      : await getLatestFxRate(first.currency, baseCurrency, new Date());
    if (!fxRate) throw new Error(`缺少 ${first.currency} → ${baseCurrency} 汇率，无法形成结算快照`);
    const settlementNo = `ST-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const settlement = await prisma.$transaction(async (tx) => {
      const created = await tx.settlement.create({
        data: {
          storeId: context.activeStoreId,
          payerOrganizationId: payer.organizationId,
          payeeOrganizationId: payee.organizationId,
          settlementNo,
          direction: payer.organizationId === context.organizationId ? "PAYABLE" : "RECEIVABLE",
          status: "DRAFT",
          currency: first.currency,
          totalAmount,
          baseCurrency,
          fxRate,
          baseAmount: totalAmount.mul(fxRate).toDecimalPlaces(4),
          createdById: context.userId,
          updatedById: context.userId,
          items: {
            create: items.map((item) => ({
              chargeEventId: item.event.id,
              amount: item.remaining,
            })),
          },
        },
      });
      return created;
    });
    revalidateChargeSurfaces();
    return actionSuccess({ id: settlement.id });
  } catch (error) {
    return toActionFailure(error, "生成结算单失败");
  }
}
