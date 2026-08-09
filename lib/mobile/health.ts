import { prisma } from "@/lib/prisma";

export async function getMobileOperationalHealth(now = new Date()) {
  const oneHourAgo = new Date(now.getTime() - 3_600_000);
  const oneDayAgo = new Date(now.getTime() - 86_400_000);
  const [staleUploads, overdueOutbox, failedActions24h, captureErrors24h, pendingReview, activeDevices30d] = await Promise.all([
    prisma.mobileAsset.count({ where: { status: "PENDING", createdAt: { lt: oneHourAgo } } }),
    prisma.notificationOutbox.count({ where: { status: { in: ["PENDING", "RETRY"] }, nextAttemptAt: { lt: oneHourAgo } } }),
    prisma.mobileActionRequest.count({ where: { status: "FAILED", updatedAt: { gte: oneDayAgo } } }),
    prisma.productIntelligenceCapture.count({ where: { status: "ERROR", updatedAt: { gte: oneDayAgo } } }),
    prisma.productIntelligenceCapture.count({ where: { status: "NEEDS_REVIEW" } }),
    prisma.companionDevice.count({ where: { revokedAt: null, lastUsedAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } } }),
  ]);
  const healthy = staleUploads < 10 && overdueOutbox < 10 && failedActions24h < 20 && captureErrors24h < 10;
  return { healthy, checkedAt: now.toISOString(), staleUploads, overdueOutbox, failedActions24h, captureErrors24h, pendingReview, activeDevices30d };
}
