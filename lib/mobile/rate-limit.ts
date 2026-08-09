import { prisma } from "@/lib/prisma";

export async function assertMobileRateLimit(input: {
  organizationId: string;
  subjectId: string;
  key: string;
  limit: number;
  windowSeconds?: number;
}) {
  const windowSeconds = input.windowSeconds ?? 60;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const bucket = await prisma.mobileRateLimitBucket.upsert({
    where: {
      organizationId_subjectId_key_windowStart: {
        organizationId: input.organizationId,
        subjectId: input.subjectId,
        key: input.key,
        windowStart,
      },
    },
    create: {
      organizationId: input.organizationId,
      subjectId: input.subjectId,
      key: input.key,
      windowStart,
      count: 1,
      expiresAt: new Date(windowStart.getTime() + windowMs * 2),
    },
    update: { count: { increment: 1 } },
    select: { count: true },
  });
  if (bucket.count > input.limit) throw new Error(`操作过于频繁，请在 ${windowSeconds} 秒后重试`);
}
