"use server";

import Decimal from "decimal.js";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { summarizeWalletLedger } from "@/lib/application/wallet-ledger";
import { buildWithdrawalHoldPlan } from "@/lib/application/wallet-withdrawal";
import { hasRoleAtLeast, ROLES } from "@/lib/auth/permissions";
import { requireUserContext } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";
import { bindAssetReferences } from "@/lib/assets/references";

type StringableDecimal = { toString(): string };

export type SerializedWalletOverview = {
  account: {
    id: string;
    ownerType: string;
    ownerId: string;
    currency: string;
    status: string;
  };
  summary: ReturnType<typeof summarizeWalletLedger>;
  earningSummary: {
    pending: string;
    confirmed: string;
    settled: string;
    total: string;
  };
  earningEvents: Array<{
    id: string;
    sourceType: string;
    sourceId: string | null;
    earningType: string;
    description: string;
    earningAmount: string;
    currency: string;
    status: string;
    occurredAt: Date;
    settledAt: Date | null;
  }>;
  ledgerEntries: Array<{
    id: string;
    entryType: string;
    amount: string;
    currency: string;
    status: string;
    sourceType: string | null;
    sourceId: string | null;
    description: string | null;
    createdAt: Date;
  }>;
  withdrawalRequests: Array<{
    id: string;
    requestNo: string;
    amount: string;
    currency: string;
    status: string;
    paymentMethod: string | null;
    paymentAccount: string | null;
    accountName: string | null;
    note: string | null;
    createdAt: Date;
    paidAt: Date | null;
  }>;
};

type RawWalletLedgerEntry = Omit<
  SerializedWalletOverview["ledgerEntries"][number],
  "amount"
> & {
  amount: StringableDecimal;
};

type RawWithdrawalRequest = Omit<
  SerializedWalletOverview["withdrawalRequests"][number],
  "amount"
> & {
  amount: StringableDecimal;
};

function nextWithdrawalNo() {
  return `WD-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function revalidateWalletSurfaces() {
  revalidatePath("/finance/wallet");
  revalidatePath("/reports");
}

async function getDefaultWalletCurrency(storeId: string) {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { currency: true },
  });
  return store?.currency ?? "CNY";
}

async function getOrCreateWalletAccount(input: {
  storeId: string;
  ownerType: "USER" | "PARTNER" | "PLATFORM";
  ownerId: string;
  currency?: string;
}) {
  const currency = input.currency ?? (await getDefaultWalletCurrency(input.storeId));
  return prisma.walletAccount.upsert({
    where: {
      storeId_ownerType_ownerId_currency: {
        storeId: input.storeId,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        currency,
      },
    },
    update: {},
    create: {
      storeId: input.storeId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      currency,
    },
  });
}

function serializeLedgerEntry(entry: RawWalletLedgerEntry) {
  return {
    ...entry,
    amount: entry.amount.toString(),
  };
}

function serializeWithdrawalRequest(request: RawWithdrawalRequest) {
  return {
    ...request,
    amount: request.amount.toString(),
  };
}

export async function getWalletOverview(input?: {
  storeId?: string;
  currency?: string;
}): Promise<SerializedWalletOverview> {
  const context = await requireUserContext(
    input?.storeId ? { storeId: input.storeId } : undefined,
  );
  const account = await getOrCreateWalletAccount({
    storeId: context.activeStoreId,
    ownerType: "USER",
    ownerId: context.userId,
    currency: input?.currency,
  });

  const [earningEvents, ledgerEntries, withdrawalRequests] = await Promise.all([
    prisma.earningEvent.findMany({
      where: {
        storeId: context.activeStoreId,
        OR: [{ userId: context.userId }, { walletAccountId: account.id }],
      },
      select: {
        id: true,
        sourceType: true,
        sourceId: true,
        earningType: true,
        description: true,
        earningAmount: true,
        currency: true,
        status: true,
        occurredAt: true,
        settledAt: true,
      },
      orderBy: { occurredAt: "desc" },
      take: 100,
    }),
    prisma.walletLedgerEntry.findMany({
      where: { walletAccountId: account.id },
      select: {
        id: true,
        entryType: true,
        amount: true,
        currency: true,
        status: true,
        sourceType: true,
        sourceId: true,
        description: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
    prisma.withdrawalRequest.findMany({
      where: { walletAccountId: account.id },
      select: {
        id: true,
        requestNo: true,
        amount: true,
        currency: true,
        status: true,
        paymentMethod: true,
        paymentAccount: true,
        accountName: true,
        note: true,
        createdAt: true,
        paidAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
  ]);

  const earningTotals = earningEvents.reduce(
    (totals, event) => {
      if (event.status === "VOID" || event.currency !== account.currency) return totals;
      const amount = new Decimal(event.earningAmount.toString());
      totals.total = totals.total.plus(amount);
      if (event.status === "PENDING") totals.pending = totals.pending.plus(amount);
      if (event.status === "CONFIRMED") totals.confirmed = totals.confirmed.plus(amount);
      if (event.status === "SETTLED") totals.settled = totals.settled.plus(amount);
      return totals;
    },
    {
      pending: new Decimal(0),
      confirmed: new Decimal(0),
      settled: new Decimal(0),
      total: new Decimal(0),
    },
  );

  return {
    account: {
      id: account.id,
      ownerType: account.ownerType,
      ownerId: account.ownerId,
      currency: account.currency,
      status: account.status,
    },
    summary: summarizeWalletLedger(ledgerEntries),
    earningSummary: {
      pending: earningTotals.pending.toDecimalPlaces(4).toString(),
      confirmed: earningTotals.confirmed.toDecimalPlaces(4).toString(),
      settled: earningTotals.settled.toDecimalPlaces(4).toString(),
      total: earningTotals.total.toDecimalPlaces(4).toString(),
    },
    earningEvents: earningEvents.map((event) => ({
      ...event,
      earningAmount: event.earningAmount.toString(),
    })),
    ledgerEntries: ledgerEntries.map(serializeLedgerEntry),
    withdrawalRequests: withdrawalRequests.map(serializeWithdrawalRequest),
  };
}

export async function requestWalletWithdrawalAction(data: {
  storeId?: string;
  currency?: string;
  amount: string;
  paymentMethod?: string;
  paymentAccount?: string;
  accountName?: string;
  note?: string;
}) {
  try {
    const context = await requireUserContext(
      data.storeId ? { storeId: data.storeId } : undefined,
    );
    const account = await getOrCreateWalletAccount({
      storeId: context.activeStoreId,
      ownerType: "USER",
      ownerId: context.userId,
      currency: data.currency,
    });
    if (account.status !== "ACTIVE") {
      throw new Error("钱包状态不可提现");
    }

    const ledgerEntries = await prisma.walletLedgerEntry.findMany({
      where: { walletAccountId: account.id },
      select: { entryType: true, amount: true, status: true },
    });
    const summary = summarizeWalletLedger(ledgerEntries);
    const plan = buildWithdrawalHoldPlan({
      availableBalance: summary.availableBalance,
      amount: data.amount,
      currency: account.currency,
      requestedById: context.userId,
      paymentMethod: data.paymentMethod,
      paymentAccount: data.paymentAccount,
      accountName: data.accountName,
      note: data.note,
    });

    const withdrawal = await prisma.$transaction(async (tx) => {
      const request = await tx.withdrawalRequest.create({
        data: {
          storeId: context.activeStoreId,
          walletAccountId: account.id,
          requestNo: nextWithdrawalNo(),
          amount: new Decimal(plan.withdrawalData.amount),
          currency: plan.withdrawalData.currency,
          status: plan.withdrawalData.status,
          paymentMethod: plan.withdrawalData.paymentMethod,
          paymentAccount: plan.withdrawalData.paymentAccount,
          accountName: plan.withdrawalData.accountName,
          note: plan.withdrawalData.note,
          requestedById: plan.withdrawalData.requestedById,
        },
      });

      await tx.walletLedgerEntry.create({
        data: {
          storeId: context.activeStoreId,
          walletAccountId: account.id,
          withdrawalRequestId: request.id,
          entryType: plan.holdLedgerData.entryType,
          amount: new Decimal(plan.holdLedgerData.amount),
          currency: plan.holdLedgerData.currency,
          status: plan.holdLedgerData.status,
          sourceType: plan.holdLedgerData.sourceType,
          sourceId: request.id,
          description: plan.holdLedgerData.description,
          postedAt: new Date(),
          createdById: plan.holdLedgerData.createdById,
        },
      });

      return request;
    });

    revalidateWalletSurfaces();
    return actionSuccess({ id: withdrawal.id });
  } catch (error) {
    return toActionFailure(error, "提交提现申请失败，请重试");
  }
}

export async function markWithdrawalPaidAction(
  id: string,
  data: {
    paymentMethod?: string;
    paymentAccount?: string;
    accountName?: string;
    proofUrl?: string;
    note?: string;
  } = {},
) {
  try {
    const existing = await prisma.withdrawalRequest.findUnique({
      where: { id },
      include: { walletAccount: true },
    });
    if (!existing) throw new Error("提现申请不存在");
    const context = await requireUserContext({ storeId: existing.storeId });
    if (!hasRoleAtLeast(context.role, ROLES.FINANCE)) {
      throw new Error("只有财务或管理员可以确认提现打款");
    }
    if (existing.status === "PAID") throw new Error("提现申请已经打款");
    if (["REJECTED", "CANCELLED"].includes(existing.status)) {
      throw new Error("已关闭的提现申请不能打款");
    }

    await bindAssetReferences(
      data.proofUrl ? [data.proofUrl] : [],
      {
        organizationId: context.organizationId,
        storeId: existing.storeId,
        userId: context.userId,
      },
      "WITHDRAWAL_REQUEST",
      existing.id
    );

    const paidAt = new Date();
    const payout = await prisma.$transaction(async (tx) => {
      await tx.withdrawalRequest.update({
        where: { id },
        data: {
          status: "PAID",
          paidAt,
          reviewedById: context.userId,
          paymentMethod: data.paymentMethod || existing.paymentMethod,
          paymentAccount: data.paymentAccount || existing.paymentAccount,
          accountName: data.accountName || existing.accountName,
          note: data.note || existing.note,
        },
      });

      await tx.walletLedgerEntry.create({
        data: {
          storeId: existing.storeId,
          walletAccountId: existing.walletAccountId,
          withdrawalRequestId: existing.id,
          entryType: "WITHDRAWAL",
          amount: existing.amount,
          currency: existing.currency,
          status: "POSTED",
          sourceType: "WITHDRAWAL_REQUEST",
          sourceId: existing.id,
          description: "提现已打款",
          postedAt: paidAt,
          createdById: context.userId,
        },
      });

      return tx.payoutRecord.create({
        data: {
          storeId: existing.storeId,
          walletAccountId: existing.walletAccountId,
          withdrawalRequestId: existing.id,
          amount: existing.amount,
          currency: existing.currency,
          paymentMethod: data.paymentMethod || existing.paymentMethod,
          paymentAccount: data.paymentAccount || existing.paymentAccount,
          accountName: data.accountName || existing.accountName,
          proofUrl: data.proofUrl || null,
          note: data.note || null,
          paidById: context.userId,
          paidAt,
        },
      });
    });

    revalidateWalletSurfaces();
    return actionSuccess({ id: payout.id });
  } catch (error) {
    return toActionFailure(error, "标记提现打款失败，请重试");
  }
}
