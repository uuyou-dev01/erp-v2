"use server";

import Decimal from "decimal.js";
import Papa from "papaparse";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { ensureSystemChargeCategories } from "@/lib/application/multi-party-foundation";
import { hasRoleAtLeast, ROLES } from "@/lib/auth/permissions";
import { requireUserContext } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";

const LINE_TYPES = new Set([
  "ORDER_GROSS",
  "PLATFORM_FEE",
  "PLATFORM_SHIPPING",
  "REFUND",
  "TAX",
  "ADJUSTMENT",
  "PAYOUT",
]);

function parseAmount(value: string) {
  const amount = new Decimal(value);
  if (!amount.isFinite()) throw new Error(`无效金额：${value}`);
  return amount.toDecimalPlaces(4);
}

function statementTotals(lines: Array<{ lineType: string; amount: Decimal }>) {
  const grossSales = lines
    .filter((line) => line.lineType === "ORDER_GROSS")
    .reduce((sum, line) => sum.plus(line.amount), new Decimal(0));
  const totalFees = lines
    .filter((line) => ["PLATFORM_FEE", "PLATFORM_SHIPPING", "TAX"].includes(line.lineType))
    .reduce((sum, line) => sum.plus(line.amount.abs()), new Decimal(0));
  const totalRefunds = lines
    .filter((line) => line.lineType === "REFUND")
    .reduce((sum, line) => sum.plus(line.amount.abs()), new Decimal(0));
  const totalAdjustments = lines
    .filter((line) => line.lineType === "ADJUSTMENT")
    .reduce((sum, line) => sum.plus(line.amount), new Decimal(0));
  const economicLines = lines.filter((line) => line.lineType !== "PAYOUT");
  const netPayout = economicLines.reduce((sum, line) => sum.plus(line.amount), new Decimal(0));
  return { grossSales, totalFees, totalRefunds, totalAdjustments, netPayout };
}

async function requireFinanceContext() {
  const context = await requireUserContext();
  if (!hasRoleAtLeast(context.role, ROLES.FINANCE)) throw new Error("只有财务角色可以维护平台账单");
  return context;
}

export async function getChannelStatementData() {
  const context = await requireFinanceContext();
  const [channels, statements] = await Promise.all([
    prisma.salesChannelAccount.findMany({
      where: { organizationId: context.organizationId, status: "ACTIVE" },
      select: { id: true, name: true, code: true, defaultCurrency: true, settings: true },
      orderBy: { name: "asc" },
    }),
    prisma.channelStatement.findMany({
      where: { organizationId: context.organizationId },
      include: {
        channel: { select: { id: true, name: true, code: true } },
        lines: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    channels,
    statements: statements.map((statement) => ({
      ...statement,
      grossSales: statement.grossSales.toString(),
      totalFees: statement.totalFees.toString(),
      totalRefunds: statement.totalRefunds.toString(),
      totalAdjustments: statement.totalAdjustments.toString(),
      netPayout: statement.netPayout.toString(),
      lines: statement.lines.map((line) => ({ ...line, amount: line.amount.toString() })),
    })),
  };
}

export async function importChannelStatementCsvAction(data: {
  salesChannelAccountId: string;
  externalStatementNo?: string;
  currency: string;
  periodStart?: string;
  periodEnd?: string;
  rawCsv: string;
  templateName?: string;
  columnMapping?: Record<string, string>;
}) {
  try {
    const context = await requireFinanceContext();
    const channel = await prisma.salesChannelAccount.findFirst({
      where: { id: data.salesChannelAccountId, organizationId: context.organizationId },
    });
    if (!channel) throw new Error("销售店铺不存在或无权访问");
    const parsed = Papa.parse<Record<string, string>>(data.rawCsv, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
    });
    if (parsed.errors.length) throw new Error(`CSV 解析失败：${parsed.errors[0].message}`);
    const read = (row: Record<string, string>, canonical: string) =>
      row[data.columnMapping?.[canonical] || canonical];
    const rows = parsed.data.map((row, index) => {
      const lineType = String(read(row, "lineType") || "").trim().toUpperCase();
      if (!LINE_TYPES.has(lineType)) throw new Error(`第 ${index + 2} 行费用类型无效`);
      const currency = String(read(row, "currency") || data.currency).trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`第 ${index + 2} 行币种无效`);
      return {
        externalLineId: String(read(row, "externalLineId") || index + 1),
        lineType,
        externalOrderNo: String(read(row, "externalOrderNo") || "").trim() || null,
        amount: parseAmount(String(read(row, "amount") || "")),
        currency,
        description: String(read(row, "description") || "").trim() || null,
        occurredAt: read(row, "occurredAt") ? new Date(read(row, "occurredAt")) : null,
        rawData: row,
      };
    });
    if (rows.length === 0) throw new Error("CSV 中没有账单明细");
    if (rows.some((row) => row.currency !== data.currency.toUpperCase())) {
      throw new Error("一张账单只能包含一种币种");
    }
    const totals = statementTotals(rows);

    if (data.templateName && data.columnMapping) {
      const existingSettings =
        channel.settings && typeof channel.settings === "object" && !Array.isArray(channel.settings)
          ? channel.settings as Record<string, Prisma.JsonValue>
          : {};
      const templates =
        existingSettings.statementImportTemplates && typeof existingSettings.statementImportTemplates === "object" && !Array.isArray(existingSettings.statementImportTemplates)
          ? existingSettings.statementImportTemplates as Record<string, Prisma.JsonValue>
          : {};
      await prisma.salesChannelAccount.update({
        where: { id: channel.id },
        data: {
          settings: {
            ...existingSettings,
            statementImportTemplates: { ...templates, [data.templateName]: data.columnMapping },
          } as Prisma.InputJsonValue,
        },
      });
    }

    const statement = await prisma.channelStatement.create({
      data: {
        organizationId: context.organizationId,
        salesChannelAccountId: channel.id,
        externalStatementNo: data.externalStatementNo || null,
        periodStart: data.periodStart ? new Date(data.periodStart) : null,
        periodEnd: data.periodEnd ? new Date(data.periodEnd) : null,
        currency: data.currency.toUpperCase(),
        grossSales: totals.grossSales,
        totalFees: totals.totalFees,
        totalRefunds: totals.totalRefunds,
        totalAdjustments: totals.totalAdjustments,
        netPayout: totals.netPayout,
        status: "IMPORTED",
        lines: {
          create: rows.map((row) => ({
            ...row,
            rawData: row.rawData,
          })),
        },
      },
    });
    revalidatePath("/finance/channel-statements");
    return actionSuccess({ id: statement.id, rows: rows.length });
  } catch (error) {
    return toActionFailure(error, "导入平台账单失败");
  }
}

export async function reconcileChannelStatementAction(statementId: string) {
  try {
    const context = await requireFinanceContext();
    const statement = await prisma.channelStatement.findFirst({
      where: { id: statementId, organizationId: context.organizationId },
      include: { lines: true },
    });
    if (!statement) throw new Error("平台账单不存在");
    let matched = 0;
    let exceptions = 0;
    for (const line of statement.lines) {
      if (!line.externalOrderNo || line.lineType === "PAYOUT") continue;
      const orders = await prisma.customerOrder.findMany({
        where: {
          salesChannelAccountId: statement.salesChannelAccountId,
          externalOrderNo: line.externalOrderNo,
        },
        select: { id: true },
        take: 2,
      });
      if (orders.length === 1) {
        await prisma.channelStatementLine.update({
          where: { id: line.id },
          data: { orderId: orders[0].id, matchStatus: "MATCHED" },
        });
        matched++;
      } else {
        await prisma.channelStatementLine.update({
          where: { id: line.id },
          data: { matchStatus: line.externalOrderNo ? "EXCEPTION" : "UNMATCHED" },
        });
        exceptions++;
      }
    }
    const payoutLines = statement.lines.filter((line) => line.lineType === "PAYOUT");
    if (payoutLines.length > 0) {
      const declared = payoutLines.reduce((sum, line) => sum.plus(line.amount), new Decimal(0));
      if (!declared.eq(statement.netPayout)) {
        exceptions += payoutLines.length;
        await prisma.channelStatementLine.updateMany({
          where: { id: { in: payoutLines.map((line) => line.id) } },
          data: { matchStatus: "EXCEPTION" },
        });
      } else {
        await prisma.channelStatementLine.updateMany({
          where: { id: { in: payoutLines.map((line) => line.id) } },
          data: { matchStatus: "MATCHED" },
        });
      }
    }
    await prisma.channelStatement.update({
      where: { id: statement.id },
      data: { status: exceptions ? "IMPORTED" : "RECONCILED" },
    });
    revalidatePath("/finance/channel-statements");
    return actionSuccess({ matched, exceptions });
  } catch (error) {
    return toActionFailure(error, "平台账单匹配失败");
  }
}

export async function confirmChannelStatementAction(statementId: string) {
  try {
    const context = await requireFinanceContext();
    await ensureSystemChargeCategories();
    const statement = await prisma.channelStatement.findFirst({
      where: { id: statementId, organizationId: context.organizationId },
      include: { channel: true, lines: true },
    });
    if (!statement) throw new Error("平台账单不存在");
    if (statement.status !== "RECONCILED") throw new Error("账单完成订单匹配后才能确认");
    if (statement.lines.some((line) => line.matchStatus === "EXCEPTION")) {
      throw new Error("账单仍有匹配异常");
    }
    const categories = await prisma.chargeCategory.findMany({
      where: { scope: "SYSTEM" },
    });
    const categoryByCode = new Map(categories.map((category) => [category.code, category]));

    await prisma.$transaction(async (tx) => {
      for (const line of statement.lines) {
        const categoryCode =
          line.lineType === "PLATFORM_FEE"
            ? "PLATFORM_FEE"
            : line.lineType === "PLATFORM_SHIPPING"
              ? "SHIPPING"
              : line.lineType === "REFUND"
                ? "AFTER_SALES"
                : line.lineType === "TAX"
                  ? "TAX_DUTY"
                  : line.lineType === "ADJUSTMENT"
                    ? "OTHER"
                    : null;
        if (!categoryCode || line.amount.eq(0)) continue;
        const category = categoryByCode.get(categoryCode);
        if (!category) throw new Error(`缺少系统费用分类 ${categoryCode}`);
        if (line.orderId) {
          await tx.chargeEvent.updateMany({
            where: {
              organizationId: context.organizationId,
              categoryId: category.id,
              amountKind: "ESTIMATE",
              status: { in: ["DRAFT", "SUBMITTED", "DISPUTED"] },
              OR: [
                { sourceType: "CUSTOMER_ORDER", sourceId: line.orderId },
                { allocations: { some: { targetType: "ORDER", targetId: line.orderId } } },
              ],
            },
            data: {
              status: "VOID",
              voidedById: context.userId,
              voidedAt: new Date(),
            },
          });
        }
        const existing = await tx.chargeEvent.findFirst({
          where: { organizationId: context.organizationId, idempotencyKey: `statement-line:${line.id}` },
        });
        const charge = existing ?? await tx.chargeEvent.create({
          data: {
            organizationId: context.organizationId,
            categoryId: category.id,
            sourceType: "CHANNEL_STATEMENT_LINE",
            sourceId: line.id,
            idempotencyKey: `statement-line:${line.id}`,
            amountKind: "ACTUAL",
            amount: line.amount.abs(),
            currency: line.currency,
            status: "CONFIRMED",
            description: line.description || `${statement.channel.name} ${line.lineType}`,
            createdById: context.userId,
            submittedById: context.userId,
            submittedAt: new Date(),
            confirmedById: context.userId,
            confirmedAt: new Date(),
            parties: {
              create: [
                {
                  role: "PAYER",
                  partyType: "ORGANIZATION",
                  partyId: context.organizationId,
                  organizationId: context.organizationId,
                  nameSnapshot: "当前经营主体",
                },
                {
                  role: "PAYEE",
                  partyType: line.lineType === "REFUND" ? "CUSTOMER" : "CHANNEL_ACCOUNT",
                  partyId: line.lineType === "REFUND" ? line.externalOrderNo || line.id : statement.channel.id,
                  nameSnapshot: line.lineType === "REFUND" ? "订单客户" : statement.channel.name,
                },
              ],
            },
            allocations: line.orderId
              ? { create: { targetType: "ORDER", targetId: line.orderId, amount: line.amount.abs() } }
              : undefined,
          },
        });
        await tx.channelStatementLine.update({
          where: { id: line.id },
          data: { chargeEventId: charge.id },
        });
      }
      await tx.channelStatement.update({
        where: { id: statement.id },
        data: { status: "CONFIRMED", confirmedById: context.userId, confirmedAt: new Date() },
      });
    });
    revalidatePath("/finance/channel-statements");
    revalidatePath("/finance/charges");
    revalidatePath("/reports");
    return actionSuccess({ id: statement.id });
  } catch (error) {
    return toActionFailure(error, "确认平台账单失败");
  }
}
