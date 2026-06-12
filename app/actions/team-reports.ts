"use server";

import { prisma } from "@/lib/prisma";
import { requireUserContext } from "@/lib/auth/user-context";
import { getTeamMetrics } from "@/lib/application/team-metrics";

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

  const metrics = await getTeamMetrics({
    organizationId: context.organizationId,
    storeIds: context.storeIds,
    storeId,
    platformId: input?.platformId || undefined,
    userId: input?.userId || undefined,
    dateFrom: parseDate(input?.from),
    dateTo: parseDate(input?.to, true),
  });

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
    filters: {
      storeId,
      platformId: input?.platformId ?? "",
      userId: input?.userId ?? "",
      from: input?.from ?? "",
      to: input?.to ?? "",
    },
  };
}
