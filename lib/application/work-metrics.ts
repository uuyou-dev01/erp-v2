import Decimal from "decimal.js";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface WorkMetricFact {
  id: string;
  userId: string;
  userName: string;
  workTypeId: string;
  workCode: string;
  workName: string;
  quantity: Decimal.Value;
  unit: string;
  occurredAt: Date;
  relationshipType?: string;
  locationName?: string | null;
  organizationName?: string | null;
  sourceType?: string;
  sourceId?: string;
  settlementRate?: Decimal.Value | null;
  settlementCurrency?: string | null;
  metadata?: unknown;
}

export interface WorkMetricsResult {
  eventCount: number;
  types: Array<{
    id: string;
    code: string;
    name: string;
    unit: string;
    settlementRate: string | null;
    settlementCurrency: string | null;
  }>;
  rows: Array<{
    userId: string;
    userName: string;
    eventCount: number;
    relationshipTypes: string[];
    values: Record<string, { eventCount: number; quantity: string; unit: string }>;
  }>;
  records: Array<{
    id: string;
    userName: string;
    workName: string;
    quantity: string;
    unit: string;
    occurredAt: string;
    relationshipType: string;
    locationName: string | null;
    organizationName: string | null;
    sourceType: string;
    sourceId: string;
    settlementRate: string | null;
    settlementCurrency: string | null;
    settlementAmount: string | null;
  }>;
  settlement: Array<{
    currency: string;
    amount: string;
    pricedRecords: number;
  }>;
  unpricedRecords: number;
}

function platformIdFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const platformId = (metadata as Record<string, unknown>).platformId;
  return typeof platformId === "string" ? platformId : null;
}

export function aggregateWorkMetrics(
  facts: WorkMetricFact[],
  filters?: { platformId?: string }
): WorkMetricsResult {
  const filtered = filters?.platformId
    ? facts.filter((fact) => platformIdFromMetadata(fact.metadata) === filters.platformId)
    : facts;
  const types = new Map<string, WorkMetricsResult["types"][number]>();
  const rows = new Map<string, WorkMetricsResult["rows"][number]>();

  for (const fact of filtered) {
    types.set(fact.workTypeId, {
      id: fact.workTypeId,
      code: fact.workCode,
      name: fact.workName,
      unit: fact.unit,
      settlementRate:
        fact.settlementRate === null || fact.settlementRate === undefined
          ? null
          : new Decimal(fact.settlementRate).toString(),
      settlementCurrency: fact.settlementCurrency ?? null,
    });
    const row = rows.get(fact.userId) ?? {
      userId: fact.userId,
      userName: fact.userName,
      eventCount: 0,
      relationshipTypes: [],
      values: {},
    };
    const value = row.values[fact.workTypeId] ?? {
      eventCount: 0,
      quantity: "0",
      unit: fact.unit,
    };
    value.eventCount += 1;
    value.quantity = new Decimal(value.quantity).plus(fact.quantity).toString();
    row.values[fact.workTypeId] = value;
    row.eventCount += 1;
    if (fact.relationshipType && !row.relationshipTypes.includes(fact.relationshipType)) {
      row.relationshipTypes.push(fact.relationshipType);
    }
    rows.set(fact.userId, row);
  }

  const settlementByCurrency = new Map<string, { amount: Decimal; pricedRecords: number }>();
  let unpricedRecords = 0;
  for (const fact of filtered) {
    if (
      fact.settlementRate === null ||
      fact.settlementRate === undefined ||
      !fact.settlementCurrency
    ) {
      unpricedRecords += 1;
      continue;
    }
    const current = settlementByCurrency.get(fact.settlementCurrency) ?? {
      amount: new Decimal(0),
      pricedRecords: 0,
    };
    current.amount = current.amount.plus(new Decimal(fact.quantity).mul(fact.settlementRate));
    current.pricedRecords += 1;
    settlementByCurrency.set(fact.settlementCurrency, current);
  }

  return {
    eventCount: filtered.length,
    types: Array.from(types.values()).sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
    rows: Array.from(rows.values()).sort(
      (a, b) => b.eventCount - a.eventCount || a.userName.localeCompare(b.userName, "zh-CN")
    ),
    records: filtered.slice(0, 200).map((fact) => ({
      id: fact.id,
      userName: fact.userName,
      workName: fact.workName,
      quantity: new Decimal(fact.quantity).toString(),
      unit: fact.unit,
      occurredAt: fact.occurredAt.toISOString(),
      relationshipType: fact.relationshipType ?? "UNKNOWN",
      locationName: fact.locationName ?? null,
      organizationName: fact.organizationName ?? null,
      sourceType: fact.sourceType ?? "UNKNOWN",
      sourceId: fact.sourceId ?? "",
      settlementRate:
        fact.settlementRate === null || fact.settlementRate === undefined
          ? null
          : new Decimal(fact.settlementRate).toString(),
      settlementCurrency: fact.settlementCurrency ?? null,
      settlementAmount:
        fact.settlementRate === null || fact.settlementRate === undefined
          ? null
          : new Decimal(fact.quantity).mul(fact.settlementRate).toString(),
    })),
    settlement: Array.from(settlementByCurrency.entries()).map(([currency, value]) => ({
      currency,
      amount: value.amount.toString(),
      pricedRecords: value.pricedRecords,
    })),
    unpricedRecords,
  };
}

async function loadWorkMetrics(where: Prisma.WorkRecordWhereInput, platformId?: string) {
  const records = await prisma.workRecord.findMany({
    where,
    select: {
      id: true,
      organizationId: true,
      userId: true,
      workTypeId: true,
      workCode: true,
      workName: true,
      quantity: true,
      unit: true,
      relationshipType: true,
      locationId: true,
      sourceType: true,
      sourceId: true,
      occurredAt: true,
      metadata: true,
      user: { select: { name: true, email: true } },
      organization: { select: { name: true } },
      workType: { select: { settlementRate: true, settlementCurrency: true } },
    },
    orderBy: { occurredAt: "desc" },
    take: 2000,
  });
  const locationIds = Array.from(
    new Set(records.map((record) => record.locationId).filter(Boolean) as string[])
  );
  const locations = locationIds.length
    ? await prisma.location.findMany({
        where: { id: { in: locationIds } },
        select: { id: true, name: true },
      })
    : [];
  const locationNameById = new Map(locations.map((location) => [location.id, location.name]));

  return aggregateWorkMetrics(
    records.map((record) => ({
      ...record,
      userName: record.user.name || record.user.email,
      organizationName: record.organization.name,
      locationName: record.locationId ? (locationNameById.get(record.locationId) ?? null) : null,
      settlementRate: record.workType.settlementRate,
      settlementCurrency: record.workType.settlementCurrency,
    })),
    { platformId }
  );
}

export async function getWorkMetrics(input: {
  organizationId: string;
  storeIds: string[];
  storeId?: string;
  userId?: string;
  relationshipType?: string;
  platformId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}) {
  const storeIds = input.storeId
    ? input.storeIds.includes(input.storeId)
      ? [input.storeId]
      : []
    : input.storeIds;
  if (!storeIds.length) return aggregateWorkMetrics([]);
  const occurredAt =
    input.dateFrom || input.dateTo
      ? {
          ...(input.dateFrom ? { gte: input.dateFrom } : {}),
          ...(input.dateTo ? { lte: input.dateTo } : {}),
        }
      : undefined;
  return loadWorkMetrics(
    {
      organizationId: input.organizationId,
      storeId: { in: storeIds },
      status: "CONFIRMED",
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.relationshipType ? { relationshipType: input.relationshipType } : {}),
      ...(occurredAt ? { occurredAt } : {}),
    },
    input.platformId
  );
}

export async function getMyWorkMetrics(input: {
  userId: string;
  relationshipType?: string;
  dateFrom?: Date;
  dateTo?: Date;
}) {
  const occurredAt =
    input.dateFrom || input.dateTo
      ? {
          ...(input.dateFrom ? { gte: input.dateFrom } : {}),
          ...(input.dateTo ? { lte: input.dateTo } : {}),
        }
      : undefined;
  return loadWorkMetrics({
    userId: input.userId,
    status: "CONFIRMED",
    ...(input.relationshipType ? { relationshipType: input.relationshipType } : {}),
    ...(occurredAt ? { occurredAt } : {}),
  });
}
