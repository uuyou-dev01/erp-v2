import { defineConfig, devices } from "@playwright/test";
import { assertSafeTestDatabaseUrl } from "./lib/database/database-url-guard";
import packageJson from "./package.json";

const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? "";
const testDatabase = assertSafeTestDatabaseUrl(testDatabaseUrl);
const boundedDatabaseUrl = new URL(testDatabaseUrl);
if (!boundedDatabaseUrl.searchParams.has("connection_limit")) {
  boundedDatabaseUrl.searchParams.set("connection_limit", "5");
}
if (!boundedDatabaseUrl.searchParams.has("pool_timeout")) {
  boundedDatabaseUrl.searchParams.set("pool_timeout", "10");
}
const e2eDatabaseUrl = boundedDatabaseUrl.toString();
const requestedPort = Number.parseInt(process.env.E2E_PORT ?? "3100", 10);
if (!Number.isInteger(requestedPort) || requestedPort < 1024 || requestedPort > 65_535) {
  throw new Error("E2E_PORT 必须是 1024-65535 的整数");
}
const e2eOrigin = `http://127.0.0.1:${requestedPort}`;
const e2eAuthFile = `.data/e2e-auth-${requestedPort}.json`;
const e2eDistDir = `.next-e2e-${requestedPort}`;
process.env.E2E_AUTH_FILE = e2eAuthFile;
const e2eGitSha = /^[0-9a-f]{40}$/i.test(process.env.GIT_SHA ?? "")
  ? process.env.GIT_SHA!
  : "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

// Playwright workers import application modules directly, so they must use the
// same guarded database as the production-mode web server.
process.env.DATABASE_URL = e2eDatabaseUrl;
process.env.TEST_DATABASE_URL = e2eDatabaseUrl;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: e2eOrigin,
    trace: "on-first-retry",
  },
  webServer: {
    command: `npx tsx scripts/e2e-prepare.ts && npm run build && npm run start -- -p ${requestedPort}`,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NODE_ENV: "production",
      E2E_MODE: "true",
      DATABASE_URL: e2eDatabaseUrl,
      TEST_DATABASE_URL: e2eDatabaseUrl,
      NEXT_DIST_DIR: e2eDistDir,
      E2E_AUTH_FILE: e2eAuthFile,
      APP_BASE_URL: "https://e2e.invalid",
      APP_VERSION: packageJson.version,
      GIT_SHA: e2eGitSha,
      AUTH_SELF_SIGNUP_ENABLED: "false",
      ERP_SESSION_SECRET:
        process.env.E2E_SESSION_SECRET ?? "e2e-only-session-secret-2026-08-28-7f0d7a55d4f94fb7",
      AUTH_AUDIT_PEPPER:
        process.env.E2E_AUTH_AUDIT_PEPPER ?? "e2e-only-audit-pepper-2026-08-28-9720a0a127a448ba",
      MOBILE_CRON_SECRET:
        process.env.E2E_MOBILE_CRON_SECRET ??
        "e2e-only-mobile-cron-secret-2026-08-28-33e72f7f165b4f18",
      FX_SYNC_TOKEN:
        process.env.E2E_FX_SYNC_TOKEN ?? "e2e-only-fx-sync-token-2026-08-28-b9b15a890eb04819",
      E2E_OWNER_EMAIL: "e2e-owner@example.invalid",
      E2E_OWNER_PASSWORD: process.env.E2E_OWNER_PASSWORD ?? "e2e-owner-password-7fd243e68c2d4b33",
    },
    url: `${e2eOrigin}/api/health/live`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  metadata: {
    database: testDatabase.safeLabel,
  },
  projects: [
    {
      name: "auth-setup",
      testMatch: /auth\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
      },
    },
    {
      name: "chrome",
      testIgnore: /auth\.setup\.ts/,
      dependencies: ["auth-setup"],
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        storageState: e2eAuthFile,
      },
    },
  ],
});
