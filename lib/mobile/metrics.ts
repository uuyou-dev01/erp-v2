import { prisma } from "@/lib/prisma";
import { requireUserContext } from "@/lib/auth/user-context";

export async function getMobileSlaMetrics() {
  const context = await requireUserContext();
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const dueSoonAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const [completed, dueSoon, conflicts, failedActions] = await Promise.all([
    prisma.task.findMany({
      where: { organizationId: context.organizationId, storeId: context.activeStoreId, status: "DONE", completedAt: { gte: since } },
      select: { createdAt: true, assignedAt: true, startedAt: true, completedAt: true, type: true },
      orderBy: { completedAt: "desc" },
      take: 500,
    }),
    prisma.task.count({
      where: { organizationId: context.organizationId, storeId: context.activeStoreId, status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] }, dueAt: { gte: now, lte: dueSoonAt } },
    }),
    prisma.mobileActionRequest.count({
      where: { organizationId: context.organizationId, status: "FAILED", updatedAt: { gte: since }, errorMessage: { contains: "变化" } },
    }),
    prisma.mobileActionRequest.count({
      where: { organizationId: context.organizationId, status: "FAILED", updatedAt: { gte: since } },
    }),
  ]);
  const cycleHours = completed.flatMap((task) => task.completedAt ? [(task.completedAt.getTime() - task.createdAt.getTime()) / 3_600_000] : []);
  const startHours = completed.flatMap((task) => task.startedAt ? [(task.startedAt.getTime() - (task.assignedAt || task.createdAt).getTime()) / 3_600_000] : []);
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return {
    windowDays: 30,
    completed: completed.length,
    dueSoon,
    conflicts,
    failedActions,
    averageCycleHours: average(cycleHours),
    averageStartHours: average(startHours),
  };
}
