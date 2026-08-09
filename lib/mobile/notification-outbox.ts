import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/mobile/web-push";

export type NotificationDigestMode = "IMMEDIATE" | "HOURLY" | "DAILY";

function parseClock(value?: string | null) {
  const match = /^(\d{2}):(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

export function isWithinQuietHours(now: Date, quietStart?: string | null, quietEnd?: string | null) {
  const start = parseClock(quietStart);
  const end = parseClock(quietEnd);
  if (start === null || end === null || start === end) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export function nextQuietEnd(now: Date, quietStart?: string | null, quietEnd?: string | null) {
  if (!isWithinQuietHours(now, quietStart, quietEnd)) return now;
  const end = parseClock(quietEnd);
  if (end === null) return now;
  const result = new Date(now);
  result.setHours(Math.floor(end / 60), end % 60, 0, 0);
  if (result <= now) result.setDate(result.getDate() + 1);
  return result;
}

export function notificationDeliveryTime(input: {
  now: Date;
  digestMode?: string | null;
  quietStart?: string | null;
  quietEnd?: string | null;
}) {
  const { now } = input;
  const target = new Date(now);
  if (input.digestMode === "HOURLY") {
    target.setMinutes(0, 0, 0);
    target.setHours(target.getHours() + 1);
  } else if (input.digestMode === "DAILY") {
    target.setDate(target.getDate() + 1);
    target.setHours(9, 0, 0, 0);
  }
  return nextQuietEnd(target, input.quietStart, input.quietEnd);
}

function mutedTypes(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function processNotificationOutbox(input?: { ids?: string[]; limit?: number; now?: Date }) {
  const now = input?.now ?? new Date();
  const rows = await prisma.notificationOutbox.findMany({
    where: {
      ...(input?.ids?.length ? { id: { in: input.ids } } : {}),
      status: { in: ["PENDING", "RETRY"] },
      nextAttemptAt: { lte: now },
    },
    include: { notification: true },
    orderBy: { nextAttemptAt: "asc" },
    take: Math.min(Math.max(input?.limit ?? 50, 1), 200),
  });

  const results: Array<{ id: string; status: string }> = [];
  const preferences = rows.length ? await prisma.notificationPreference.findMany({
    where: { OR: [...new Map(rows.map((row) => [`${row.organizationId}:${row.userId}`, { organizationId: row.organizationId, userId: row.userId }])).values()] },
  }) : [];
  const preferenceByUser = new Map(preferences.map((item) => [`${item.organizationId}:${item.userId}`, item]));
  const digestGroups = new Map<string, typeof rows>();
  for (const row of rows) {
    const preference = preferenceByUser.get(`${row.organizationId}:${row.userId}`);
    if (!preference || preference.digestMode === "IMMEDIATE" || !preference.pushEnabled || mutedTypes(preference.mutedTypes).includes(row.notification.type)) continue;
    const key = `${row.organizationId}:${row.userId}`;
    digestGroups.set(key, [...(digestGroups.get(key) ?? []), row]);
  }
  const handled = new Set<string>();
  for (const group of digestGroups.values()) {
    const first = group[0];
    const preference = preferenceByUser.get(`${first.organizationId}:${first.userId}`)!;
    if (isWithinQuietHours(now, preference.quietStart, preference.quietEnd)) {
      const ids = group.map((row) => row.id);
      await prisma.notificationOutbox.updateMany({ where: { id: { in: ids }, status: { in: ["PENDING", "RETRY"] } }, data: { status: "RETRY", nextAttemptAt: nextQuietEnd(now, preference.quietStart, preference.quietEnd), lastError: "静默时段延后投递" } });
      ids.forEach((id) => { handled.add(id); results.push({ id, status: "RETRY" }); });
      continue;
    }
    const claimedIds: string[] = [];
    for (const row of group) {
      const claimed = await prisma.notificationOutbox.updateMany({ where: { id: row.id, status: { in: ["PENDING", "RETRY"] } }, data: { status: "PROCESSING", attempts: { increment: 1 } } });
      if (claimed.count) claimedIds.push(row.id);
      handled.add(row.id);
    }
    if (!claimedIds.length) continue;
    try {
      const pushed = await sendPushToUser({
        organizationId: first.organizationId,
        userId: first.userId,
        title: `${claimedIds.length} 条 ERP 待处理提醒`,
        body: `${first.notification.title}${claimedIds.length > 1 ? `，另有 ${claimedIds.length - 1} 条` : ""}`,
        actionUrl: "/m/notifications",
      });
      const status = pushed.disabled || pushed.sent === 0 ? "SKIPPED" : "DELIVERED";
      const lastError = pushed.disabled ? "Web Push 尚未配置" : pushed.sent === 0 ? "没有可用的推送订阅" : null;
      await prisma.notificationOutbox.updateMany({ where: { id: { in: claimedIds }, status: "PROCESSING" }, data: { status, deliveredAt: now, lastError } });
      claimedIds.forEach((id) => results.push({ id, status }));
    } catch (error) {
      const nextAttemptAt = new Date(now.getTime() + 2 * 60_000);
      await prisma.notificationOutbox.updateMany({ where: { id: { in: claimedIds }, status: "PROCESSING" }, data: { status: "RETRY", nextAttemptAt, lastError: error instanceof Error ? error.message : "汇总推送失败" } });
      claimedIds.forEach((id) => results.push({ id, status: "RETRY" }));
    }
  }
  for (const row of rows) {
    if (handled.has(row.id)) continue;
    const claimed = await prisma.notificationOutbox.updateMany({
      where: { id: row.id, status: { in: ["PENDING", "RETRY"] } },
      data: { status: "PROCESSING", attempts: { increment: 1 } },
    });
    if (!claimed.count) continue;

    try {
      const preference = preferenceByUser.get(`${row.organizationId}:${row.userId}`);
      if (preference && (!preference.pushEnabled || mutedTypes(preference.mutedTypes).includes(row.notification.type))) {
        await prisma.notificationOutbox.update({
          where: { id: row.id },
          data: { status: "SKIPPED", deliveredAt: now, lastError: preference.pushEnabled ? "通知类型已静音" : "系统推送已关闭" },
        });
        results.push({ id: row.id, status: "SKIPPED" });
        continue;
      }
      if (preference && isWithinQuietHours(now, preference.quietStart, preference.quietEnd)) {
        await prisma.notificationOutbox.update({
          where: { id: row.id },
          data: { status: "RETRY", nextAttemptAt: nextQuietEnd(now, preference.quietStart, preference.quietEnd), lastError: "静默时段延后投递" },
        });
        results.push({ id: row.id, status: "RETRY" });
        continue;
      }

      const pushed = await sendPushToUser({
        organizationId: row.organizationId,
        userId: row.userId,
        title: row.notification.title,
        body: row.notification.body,
        actionUrl: row.notification.actionUrl,
      });
      const status = pushed.disabled || pushed.sent === 0 ? "SKIPPED" : "DELIVERED";
      await prisma.notificationOutbox.update({
        where: { id: row.id },
        data: { status, deliveredAt: now, lastError: pushed.disabled ? "Web Push 尚未配置" : pushed.sent === 0 ? "没有可用的推送订阅" : null },
      });
      results.push({ id: row.id, status });
    } catch (error) {
      const attempts = row.attempts + 1;
      const delayMinutes = Math.min(2 ** Math.min(attempts, 8), 360);
      const nextAttemptAt = new Date(now.getTime() + delayMinutes * 60_000);
      await prisma.notificationOutbox.update({
        where: { id: row.id },
        data: { status: attempts >= 8 ? "SKIPPED" : "RETRY", nextAttemptAt, lastError: error instanceof Error ? error.message : "推送失败" },
      });
      results.push({ id: row.id, status: attempts >= 8 ? "SKIPPED" : "RETRY" });
    }
  }
  return results;
}
