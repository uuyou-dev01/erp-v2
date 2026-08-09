import { prisma } from "@/lib/prisma";
import { deleteMobileAsset } from "@/lib/mobile/asset-storage";
import { Prisma } from "@prisma/client";

const daysAgo = (days: number, now = new Date()) => new Date(now.getTime() - days * 86_400_000);
const envDays = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
};

export async function runMobileRetention(now = new Date()) {
  const pendingBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const abortedBefore = daysAgo(7, now);
  const evidenceBefore = daysAgo(envDays("MOBILE_EVIDENCE_RETENTION_DAYS", 180), now);
  const terminalAssets = await prisma.mobileAsset.findMany({
    where: {
      OR: [
        { status: "PENDING", createdAt: { lt: pendingBefore } },
        { status: "ABORTED", abortedAt: { lt: abortedBefore } },
        { capture: { dismissedAt: { lt: evidenceBefore } } },
      ],
    },
    select: { id: true, storageKey: true },
    take: 1000,
  });
  let deletedAssets = 0;
  for (const asset of terminalAssets) {
    try {
      await deleteMobileAsset(asset.storageKey);
      await prisma.mobileAsset.delete({ where: { id: asset.id } });
      deletedAssets += 1;
    } catch {
      // Keep the database row so a later run can retry deletion safely.
    }
  }

  const [redactedCaptures, actionRequests, pushSubscriptions, outbox, rateBuckets] = await prisma.$transaction([
    prisma.productIntelligenceCapture.updateMany({
      where: { dismissedAt: { lt: evidenceBefore }, OR: [{ sourceText: { not: null } }, { rawPayload: { not: Prisma.DbNull } }] },
      data: { sourceText: null, rawPayload: Prisma.DbNull },
    }),
    prisma.mobileActionRequest.deleteMany({
      where: { OR: [{ status: "COMPLETED", updatedAt: { lt: daysAgo(90, now) } }, { status: "FAILED", updatedAt: { lt: daysAgo(30, now) } }] },
    }),
    prisma.pushSubscription.deleteMany({ where: { revokedAt: { lt: daysAgo(30, now) } } }),
    prisma.notificationOutbox.deleteMany({ where: { status: { in: ["DELIVERED", "SKIPPED"] }, updatedAt: { lt: daysAgo(30, now) } } }),
    prisma.mobileRateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  return {
    deletedAssets,
    redactedCaptures: redactedCaptures.count,
    deletedActionRequests: actionRequests.count,
    deletedPushSubscriptions: pushSubscriptions.count,
    deletedOutboxRows: outbox.count,
    deletedRateBuckets: rateBuckets.count,
  };
}
