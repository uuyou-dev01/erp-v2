import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { TASK_STATUS, TASK_TYPE } from "@/lib/application/tasks";

export interface TeamMetricsFilters {
  organizationId: string;
  storeIds: string[];
  dateFrom?: Date;
  dateTo?: Date;
  userId?: string;
  storeId?: string;
  platformId?: string;
}

export interface TeamMetricTaskFact {
  taskId: string;
  refId?: string | null;
  taskType: string;
  completedById?: string | null;
  assignedToId?: string | null;
  dueAt?: Date | null;
  completedAt?: Date | null;
  orderQuantity?: Decimal.Value | null;
  platformId?: string | null;
  countryFlow?: string | null;
}

export interface TeamMetricUserRow {
  userId: string;
  userName: string;
  listingTasks: number;
  shippedTasks: number;
  shippedOrders: number;
  shippedUnits: string;
  settlementTasks: number;
  overdueTasks: number;
  taskIds: string[];
}

export interface TeamMetricsSummary {
  listingTasks: number;
  shippedTasks: number;
  shippedOrders: number;
  shippedUnits: string;
  settlementTasks: number;
  overdueTasks: number;
}

export interface TeamMetricsResult {
  summary: TeamMetricsSummary;
  rows: TeamMetricUserRow[];
  platformBreakdown: Array<{ platformId: string; platformName: string; shippedTasks: number; shippedUnits: string }>;
  countryBreakdown: Array<{ countryFlow: string; shippedTasks: number; shippedUnits: string }>;
}

const COMPLETED_METRIC_TASK_TYPES = [
  TASK_TYPE.LISTING_CREATE,
  TASK_TYPE.LISTING_UPDATE,
  TASK_TYPE.SHIP_ORDER,
  TASK_TYPE.SETTLE_ORDER,
] as const;

function emptySummary(): TeamMetricsSummary {
  return {
    listingTasks: 0,
    shippedTasks: 0,
    shippedOrders: 0,
    shippedUnits: "0",
    settlementTasks: 0,
    overdueTasks: 0,
  };
}

function ensureRow(
  rows: Map<string, TeamMetricUserRow>,
  userId: string,
  userNameById: Map<string, string>
) {
  let row = rows.get(userId);
  if (!row) {
    row = {
      userId,
      userName: userNameById.get(userId) ?? "未命名成员",
      listingTasks: 0,
      shippedTasks: 0,
      shippedOrders: 0,
      shippedUnits: "0",
      settlementTasks: 0,
      overdueTasks: 0,
      taskIds: [],
    };
    rows.set(userId, row);
  }
  return row;
}

function isLate(fact: TeamMetricTaskFact) {
  return Boolean(
    fact.dueAt &&
      fact.completedAt &&
      fact.completedAt.getTime() > fact.dueAt.getTime()
  );
}

export function aggregateTeamMetrics(input: {
  facts: TeamMetricTaskFact[];
  userNameById: Map<string, string>;
  platformNameById?: Map<string, string>;
}) {
  const rows = new Map<string, TeamMetricUserRow>();
  const summary = emptySummary();
  const shippedOrderIds = new Set<string>();
  let shippedUnitsTotal = new Decimal(0);
  const platformBreakdown = new Map<string, { platformId: string; platformName: string; shippedTasks: number; shippedUnits: Decimal }>();
  const countryBreakdown = new Map<string, { countryFlow: string; shippedTasks: number; shippedUnits: Decimal }>();

  for (const fact of input.facts) {
    const ownerId = fact.completedById ?? fact.assignedToId;
    if (!ownerId) continue;
    const row = ensureRow(rows, ownerId, input.userNameById);
    row.taskIds.push(fact.taskId);

    if (
      fact.taskType === TASK_TYPE.LISTING_CREATE ||
      fact.taskType === TASK_TYPE.LISTING_UPDATE
    ) {
      row.listingTasks += 1;
      summary.listingTasks += 1;
    }

    if (fact.taskType === TASK_TYPE.SHIP_ORDER) {
      const quantity = new Decimal(fact.orderQuantity ?? 0);
      row.shippedTasks += 1;
      row.shippedOrders += 1;
      row.shippedUnits = new Decimal(row.shippedUnits).plus(quantity).toString();
      summary.shippedTasks += 1;
      shippedOrderIds.add(fact.refId ?? fact.taskId);
      shippedUnitsTotal = shippedUnitsTotal.plus(quantity);

      if (fact.platformId) {
        const platform = platformBreakdown.get(fact.platformId) ?? {
          platformId: fact.platformId,
          platformName: input.platformNameById?.get(fact.platformId) ?? fact.platformId,
          shippedTasks: 0,
          shippedUnits: new Decimal(0),
        };
        platform.shippedTasks += 1;
        platform.shippedUnits = platform.shippedUnits.plus(quantity);
        platformBreakdown.set(fact.platformId, platform);
      }

      if (fact.countryFlow) {
        const country = countryBreakdown.get(fact.countryFlow) ?? {
          countryFlow: fact.countryFlow,
          shippedTasks: 0,
          shippedUnits: new Decimal(0),
        };
        country.shippedTasks += 1;
        country.shippedUnits = country.shippedUnits.plus(quantity);
        countryBreakdown.set(fact.countryFlow, country);
      }
    }

    if (fact.taskType === TASK_TYPE.SETTLE_ORDER) {
      row.settlementTasks += 1;
      summary.settlementTasks += 1;
    }

    if (isLate(fact)) {
      row.overdueTasks += 1;
      summary.overdueTasks += 1;
    }
  }

  summary.shippedOrders = shippedOrderIds.size;
  summary.shippedUnits = shippedUnitsTotal.toString();

  return {
    summary,
    rows: Array.from(rows.values()).sort((a, b) => {
      const scoreA = a.listingTasks + a.shippedTasks + a.settlementTasks;
      const scoreB = b.listingTasks + b.shippedTasks + b.settlementTasks;
      return scoreB - scoreA || a.userName.localeCompare(b.userName);
    }),
    platformBreakdown: Array.from(platformBreakdown.values()).map((item) => ({
      ...item,
      shippedUnits: item.shippedUnits.toString(),
    })),
    countryBreakdown: Array.from(countryBreakdown.values()).map((item) => ({
      ...item,
      shippedUnits: item.shippedUnits.toString(),
    })),
  } satisfies TeamMetricsResult;
}

export async function getTeamMetrics(filters: TeamMetricsFilters) {
  const storeIds = filters.storeId
    ? filters.storeIds.includes(filters.storeId)
      ? [filters.storeId]
      : []
    : filters.storeIds;
  if (storeIds.length === 0) {
    return aggregateTeamMetrics({ facts: [], userNameById: new Map() });
  }

  const completedAt =
    filters.dateFrom || filters.dateTo
      ? {
          ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
          ...(filters.dateTo ? { lte: filters.dateTo } : {}),
        }
      : undefined;

  const tasks = await prisma.task.findMany({
    where: {
      organizationId: filters.organizationId,
      storeId: { in: storeIds },
      status: TASK_STATUS.DONE,
      type: { in: [...COMPLETED_METRIC_TASK_TYPES] },
      ...(completedAt ? { completedAt } : {}),
      ...(filters.userId ? { completedById: filters.userId } : {}),
    },
    orderBy: { completedAt: "desc" },
  });

  const orderIds = tasks
    .filter((task) => task.refType === "CUSTOMER_ORDER")
    .map((task) => task.refId);
  const listingIds = tasks
    .filter((task) => task.refType === "LISTING")
    .map((task) => task.refId);

  const [orders, listings, users] = await Promise.all([
    orderIds.length
      ? prisma.customerOrder.findMany({
          where: { id: { in: orderIds }, storeId: { in: storeIds } },
          select: {
            id: true,
            platformId: true,
            countryFlow: true,
            lines: { select: { quantity: true } },
          },
        })
      : [],
    listingIds.length
      ? prisma.listing.findMany({
          where: { id: { in: listingIds }, storeId: { in: storeIds } },
          select: { id: true, platformId: true },
        })
      : [],
    prisma.user.findMany({
      where: {
        memberships: {
          some: {
            organizationId: filters.organizationId,
            status: "ACTIVE",
          },
        },
      },
      select: { id: true, name: true, email: true },
    }),
  ]);

  const orderById = new Map(orders.map((order) => [order.id, order]));
  const listingById = new Map(listings.map((listing) => [listing.id, listing]));
  const platformIds = Array.from(
    new Set([
      ...orders.map((order) => order.platformId).filter(Boolean),
      ...listings.map((listing) => listing.platformId).filter(Boolean),
    ] as string[])
  );
  const platforms = platformIds.length
    ? await prisma.platform.findMany({
        where: { id: { in: platformIds }, storeId: { in: storeIds } },
        select: { id: true, name: true },
      })
    : [];
  const platformNameById = new Map(platforms.map((platform) => [platform.id, platform.name]));
  const userNameById = new Map(users.map((user) => [user.id, user.name ?? user.email]));

  const facts = tasks.flatMap<TeamMetricTaskFact>((task) => {
    const order =
      task.refType === "CUSTOMER_ORDER" ? orderById.get(task.refId) : undefined;
    const listing = task.refType === "LISTING" ? listingById.get(task.refId) : undefined;
    const platformId = order?.platformId ?? listing?.platformId ?? null;
    if (filters.platformId && platformId !== filters.platformId) return [];

    const orderQuantity = order?.lines.reduce(
      (sum, line) => sum.plus(line.quantity.toString()),
      new Decimal(0)
    );

    return [
      {
        taskId: task.id,
        refId: task.refId,
        taskType: task.type,
        completedById: task.completedById,
        assignedToId: task.assignedToId,
        dueAt: task.dueAt,
        completedAt: task.completedAt,
        orderQuantity,
        platformId,
        countryFlow: order?.countryFlow,
      },
    ];
  });

  return aggregateTeamMetrics({ facts, userNameById, platformNameById });
}
