import { createHash, createHmac } from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT = 5;

function auditPepper() {
  return (
    process.env.AUTH_AUDIT_PEPPER ||
    process.env.ERP_SESSION_SECRET ||
    "erp-v2-local-auth-audit-pepper"
  );
}

export function hashAuthSubject(value: string) {
  return createHmac("sha256", auditPepper()).update(value.trim().toLowerCase()).digest("hex");
}

async function requestFingerprint() {
  try {
    const requestHeaders = await headers();
    const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ip = forwarded || requestHeaders.get("x-real-ip") || "unknown";
    const userAgent = requestHeaders.get("user-agent") || "unknown";
    return {
      ipHash: hashAuthSubject(`ip:${ip}`),
      userAgentHash: createHash("sha256").update(userAgent).digest("hex"),
    };
  } catch {
    return { ipHash: hashAuthSubject("ip:unknown"), userAgentHash: null };
  }
}

export async function assertLoginRateLimit(email: string) {
  const fingerprint = await requestFingerprint();
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / LOGIN_WINDOW_MS) * LOGIN_WINDOW_MS);
  const expiresAt = new Date(windowStart.getTime() + LOGIN_WINDOW_MS * 2);
  const subjects = [hashAuthSubject(`email:${email}`), fingerprint.ipHash];
  for (const subjectHash of subjects) {
    const bucket = await prisma.authRateLimitBucket.findUnique({
      where: {
        action_subjectHash_windowStart: { action: "LOGIN", subjectHash, windowStart },
      },
      select: { attempts: true },
    });
    if ((bucket?.attempts ?? 0) >= LOGIN_LIMIT) {
      throw new Error("登录尝试过于频繁，请稍后再试");
    }
  }
  return { ...fingerprint, subjects, windowStart, expiresAt };
}

export async function recordLoginFailureAttempt(email: string) {
  const state = await assertLoginRateLimit(email);
  for (const subjectHash of state.subjects) {
    await prisma.authRateLimitBucket.upsert({
      where: {
        action_subjectHash_windowStart: {
          action: "LOGIN",
          subjectHash,
          windowStart: state.windowStart,
        },
      },
      update: { attempts: { increment: 1 }, expiresAt: state.expiresAt },
      create: {
        action: "LOGIN",
        subjectHash,
        windowStart: state.windowStart,
        attempts: 1,
        expiresAt: state.expiresAt,
      },
    });
  }
}

export async function recordAuthAudit(input: {
  eventType: string;
  outcome: "SUCCESS" | "FAILURE" | "BLOCKED";
  email?: string;
  userId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  const fingerprint = await requestFingerprint();
  return prisma.authAuditEvent.create({
    data: {
      userId: input.userId ?? null,
      eventType: input.eventType,
      outcome: input.outcome,
      subjectHash: input.email ? hashAuthSubject(`email:${input.email}`) : null,
      ipHash: fingerprint.ipHash,
      userAgentHash: fingerprint.userAgentHash,
      metadata: input.metadata,
    },
  });
}
