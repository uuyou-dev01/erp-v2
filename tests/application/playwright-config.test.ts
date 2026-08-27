import { afterEach, describe, expect, it, vi } from "vitest";

describe("playwright config", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalTestDatabaseUrl = process.env.TEST_DATABASE_URL;

  afterEach(() => {
    vi.resetModules();
    if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
    else delete process.env.DATABASE_URL;
    if (originalTestDatabaseUrl) process.env.TEST_DATABASE_URL = originalTestDatabaseUrl;
    else delete process.env.TEST_DATABASE_URL;
  });

  it("requires an isolated TEST_DATABASE_URL and production-mode server", async () => {
    process.env.TEST_DATABASE_URL = "postgresql://localhost/erp_e2e";
    const { default: config } = await import("../../playwright.config");
    const webServer = Array.isArray(config.webServer) ? config.webServer[0] : config.webServer;

    expect(webServer?.command).toContain("e2e-prepare.ts");
    expect(webServer?.command).toContain("npm run build");
    expect(webServer?.command).toContain("npm run start");
    expect(webServer?.command).not.toMatch(/db push|db:seed|next dev/);
    expect(webServer?.reuseExistingServer).toBe(false);
    expect(webServer?.env).toMatchObject({
      FORCE_COLOR: "0",
      NODE_ENV: "production",
      E2E_MODE: "true",
      DATABASE_URL: "postgresql://localhost/erp_e2e",
      AUTH_SELF_SIGNUP_ENABLED: "false",
      APP_BASE_URL: "https://e2e.invalid",
      GIT_SHA: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    });
    expect(webServer?.env).not.toHaveProperty("ERP_DEV_USER_EMAIL");
    expect(webServer?.env?.ERP_SESSION_SECRET).toMatch(/^e2e-only-session-secret-/);
    expect(webServer?.env?.AUTH_AUDIT_PEPPER).toMatch(/^e2e-only-audit-pepper-/);
    expect(config.projects?.find((project) => project.name === "chrome")?.dependencies).toEqual([
      "auth-setup",
    ]);
  });

  it("fails closed when TEST_DATABASE_URL is missing", async () => {
    delete process.env.TEST_DATABASE_URL;
    await expect(import("../../playwright.config")).rejects.toThrow(/TEST_DATABASE_URL/);
  });
});
