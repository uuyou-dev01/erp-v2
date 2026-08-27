import { createHmac, timingSafeEqual } from "node:crypto";

type SessionPayload = {
  userId: string;
  sessionVersion: number;
  expiresAt: number;
};

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sessionSecret() {
  const configured = process.env.ERP_SESSION_SECRET;
  if (configured && configured !== "your-secret-key-here") return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("生产环境必须配置 ERP_SESSION_SECRET");
  }
  return "erp-v2-local-development-session-secret";
}

function signature(value: string) {
  return createHmac("sha256", sessionSecret())
    .update(value)
    .digest("base64url");
}

export function createSessionToken(userId: string, sessionVersion: number) {
  const payload: SessionPayload = {
    userId,
    sessionVersion,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

export function readSessionToken(token: string | undefined) {
  if (!token) return null;
  const [encoded, actualSignature] = token.split(".");
  if (!encoded || !actualSignature) return null;
  const expectedSignature = signature(encoded);
  const actual = Buffer.from(actualSignature);
  const expected = Buffer.from(expectedSignature);
  if (
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (
      !payload.userId ||
      !Number.isInteger(payload.sessionVersion) ||
      payload.sessionVersion < 1 ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
