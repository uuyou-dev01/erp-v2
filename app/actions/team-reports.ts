"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserContext } from "@/lib/auth/user-context";
import { getTeamMetrics } from "@/lib/application/team-metrics";
import { getMyWorkMetrics, getWorkMetrics } from "@/lib/application/work-metrics";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { hasRoleAtLeast, ROLES } from "@/lib/auth/permissions";

function parseDate(value?: string, endOfDay = false) {
  if (!value) return undefined;
  const date = new Date(endOfDay ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function getTeamReportData(input?: {
  storeId?: string;
  platformId?: string;
  userId?: string;
  from?: string;
  to?: string;
}) {
  const context = await requireUserContext({ storeId: input?.storeId });
  const stores = await prisma.store.findMany({
    where: { id: { in: context.storeIds } },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
  const storeId = input?.storeId ?? context.activeStoreId;
  const platforms = await prisma.platform.findMany({
    where: { storeId },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
  const members = await prisma.user.findMany({
    where: {
      memberships: {
        some: {
          organizationId: context.organizationId,
          status: "ACTIVE",
        },
      },
    },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });

  const metricFilters = {
    organizationId: context.organizationId,
    storeIds: context.storeIds,
    storeId,
    platformId: input?.platformId || undefined,
    userId: input?.userId || undefined,
    dateFrom: parseDate(input?.from),
    dateTo: parseDate(input?.to, true),
  };
  const [metrics, workload] = await Promise.all([
    getTeamMetrics(metricFilters),
    getWorkMetrics(metricFilters),
  ]);

  return {
    context,
    stores,
    platforms,
    members: members.map((member) => ({
      id: member.id,
      name: member.name || member.email,
      email: member.email,
    })),
    metrics,
    workload,
    filters: {
      storeId,
      platformId: input?.platformId ?? "",
      userId: input?.userId ?? "",
      from: input?.from ?? "",
      to: input?.to ?? "",
    },
  };
}

export async function getWorkloadReportData(input?: {
  scope?: "organization" | "mine";
  tab?: "records" | "people" | "types" | "settlement";
  storeId?: string;
  userId?: string;
  relationshipType?: string;
  from?: string;
  to?: string;
}) {
  const context = await requireUserContext({ storeId: input?.storeId });
  const canManageRates = hasRoleAtLeast(context.role, ROLES.MANAGER);
  const scope: "organization" | "mine" =
    canManageRates && input?.scope !== "mine" ? "organization" : "mine";
  const stores = await prisma.store.findMany({
    where: { id: { in: context.storeIds } },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
  const storeId = input?.storeId ?? context.activeStoreId;
  const dateFrom = parseDate(input?.from);
  const dateTo = parseDate(input?.to, true);
  const relationshipType = input?.relationshipType || "";
  const load = (filterRelationship: string, filterUserId = input?.userId || "") =>
    scope === "mine"
      ? getMyWorkMetrics({
          userId: context.userId,
          relationshipType: filterRelationship || undefined,
          dateFrom,
          dateTo,
        })
      : getWorkMetrics({
          organizationId: context.organizationId,
          storeIds: context.storeIds,
          storeId,
          userId: filterUserId || undefined,
          relationshipType: filterRelationship || undefined,
          dateFrom,
          dateTo,
        });
  const peopleSource = await load("", "");
  const workload = await load(relationshipType);

  return {
    context,
    stores,
    people: peopleSource.rows.map((row) => ({ id: row.userId, name: row.userName })),
    workload,
    filters: {
      scope,
      tab: input?.tab ?? "records",
      storeId,
      userId: input?.userId ?? "",
      relationshipType,
      from: input?.from ?? "",
      to: input?.to ?? "",
    },
    canManageRates,
  };
}

export async function updateWorkTypeSettlementRateAction(input: {
  workTypeId: string;
  rate?: string;
  currency?: string;
}) {
  try {
    const context = await requireUserContext();
    if (!hasRoleAtLeast(context.role, ROLES.MANAGER)) {
      throw new Error("只有运营负责人及以上角色可以配置计价规则");
    }
    const workType = await prisma.workType.findFirst({
      where: { id: input.workTypeId, organizationId: context.organizationId },
      select: { id: true },
    });
    if (!workType) throw new Error("工作类型不存在或无权修改");
    const rateText = input.rate?.trim() ?? "";
    const rate = rateText ? new Decimal(rateText) : null;
    if (rate && (!rate.isFinite() || rate.lt(0))) throw new Error("单价必须是非负数");
    const currency = input.currency?.trim().toUpperCase() || null;
    if (rate && !currency) throw new Error("配置单价时必须选择币种");
    await prisma.workType.update({
      where: { id: workType.id },
      data: {
        settlementRate: rate ? rate.toFixed(4) : null,
        settlementCurrency: rate ? currency : null,
      },
    });
    revalidatePath("/reports/workload");
    return actionSuccess({ workTypeId: workType.id });
  } catch (error) {
    return toActionFailure(error, "保存计价规则失败，请重试");
  }
}
