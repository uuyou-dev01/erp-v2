import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSessionToken, readSessionToken } from "@/lib/auth/session-token";

describe("production authentication foundation", () => {
  const originalSecret = process.env.ERP_SESSION_SECRET;

  afterEach(() => {
    if (originalSecret) process.env.ERP_SESSION_SECRET = originalSecret;
    else delete process.env.ERP_SESSION_SECRET;
  });

  it("binds signed sessions to user id and session version instead of email", () => {
    process.env.ERP_SESSION_SECRET = "test-session-secret-that-is-longer-than-thirty-two-characters";
    const token = createSessionToken("user_123", 7);
    expect(readSessionToken(token)).toMatchObject({ userId: "user_123", sessionVersion: 7 });
    expect(readSessionToken(`${token}tampered`)).toBeNull();
  });

  it("keeps invitation email fixed while leaving the personal name editable", () => {
    const source = readFileSync(
      join(process.cwd(), "components/auth/register-form.tsx"),
      "utf8"
    );
    const nameBlock = source.slice(source.indexOf('id="register-name"'), source.indexOf('id="register-email"'));
    const emailBlock = source.slice(
      source.indexOf('id="register-email"'),
      source.indexOf('id="register-password"')
    );
    expect(nameBlock).not.toContain("fixedEmail");
    expect(nameBlock).not.toContain("readOnly");
    expect(emailBlock).toContain("defaultValue={fixedEmail}");
    expect(emailBlock).toContain("readOnly={Boolean(fixedEmail)}");
    expect(emailBlock).toContain("仅在管理员明确开放注册时可用");
  });

  it("requires explicit self-signup and removes password-overwriting member creation", () => {
    const signupSource = readFileSync(join(process.cwd(), "lib/auth/signup-policy.ts"), "utf8");
    const teamSource = readFileSync(join(process.cwd(), "app/actions/team.ts"), "utf8");
    expect(signupSource).toContain('AUTH_SELF_SIGNUP_ENABLED === "true"');
    expect(signupSource).not.toContain('NODE_ENV !== "production"');
    expect(teamSource).not.toContain("createTeamMemberAction");
    expect(teamSource).not.toContain("hashPassword");
    expect(teamSource).not.toContain("passwordHash");
  });

  it("declares revocable accounts, one-time reset tokens, rate limits and fail-fast config", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const resetSource = readFileSync(
      join(process.cwd(), "app/actions/account-security.ts"),
      "utf8"
    );
    const configSource = readFileSync(
      join(process.cwd(), "lib/auth/production-config.ts"),
      "utf8"
    );
    expect(schema).toContain("sessionVersion  Int");
    expect(schema).toContain("accountStatus   String");
    expect(schema).toContain("model AuthToken");
    expect(schema).toContain("model AuthRateLimitBucket");
    expect(schema).toContain("model AuthAuditEvent");
    expect(resetSource).toContain("consumedAt: null");
    expect(resetSource).toContain("sessionVersion: { increment: 1 }");
    expect(configSource).toContain("生产环境禁止配置 ERP_DEV_USER_EMAIL");
    const nextConfigSource = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    expect(nextConfigSource).not.toContain("assertProductionAuthConfig");
    const registrationSource = readFileSync(join(process.cwd(), "app/actions/session.ts"), "utf8");
    expect(registrationSource).toContain("emailVerifiedAt: invitedSignup ? new Date() : null");
    expect(registrationSource).toContain('reason: "LEGACY_DEMO_PASSWORD"');
    expect(registrationSource).toContain("一次性密码重置链接");
    const passwordSource = readFileSync(join(process.cwd(), "lib/auth/password.ts"), "utf8");
    expect(passwordSource).toContain('process.env.NODE_ENV !== "production"');
    const instrumentationSource = readFileSync(join(process.cwd(), "instrumentation.ts"), "utf8");
    expect(instrumentationSource).toContain("assertProductionAuthConfig();");
    expect(instrumentationSource).toContain("process.exit(1)");
    const sessionSource = readFileSync(join(process.cwd(), "lib/auth/session-token.ts"), "utf8");
    expect(sessionSource).not.toContain("NEXTAUTH_SECRET");
    expect(sessionSource).toContain("process.env.ERP_SESSION_SECRET");
  });

  it("only relaxes Secure cookies for an explicitly isolated local E2E database", () => {
    const cookieSource = readFileSync(join(process.cwd(), "lib/auth/cookie-security.ts"), "utf8");
    const sessionSource = readFileSync(join(process.cwd(), "app/actions/session.ts"), "utf8");
    const contextSource = readFileSync(join(process.cwd(), "lib/auth/user-context.ts"), "utf8");
    expect(cookieSource).toContain('E2E_MODE !== "true"');
    expect(cookieSource).toContain("assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL)");
    expect(sessionSource).not.toContain('secure: process.env.NODE_ENV === "production"');
    expect(sessionSource).toContain("secure: isSecureCookieEnabled()");
    expect(contextSource).toContain('isSecureCookieEnabled() ? "__Host-erp_session"');
  });
});
