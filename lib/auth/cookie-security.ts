import { assertSafeTestDatabaseUrl } from "@/lib/database/database-url-guard";

/**
 * Production cookies are Secure by default. The only exception is the local HTTP
 * E2E server, and that exception is allowed only after the isolated test database
 * URL has passed the same fail-closed guard used by the E2E fixtures.
 */
export function isSecureCookieEnabled() {
  if (process.env.NODE_ENV !== "production") return false;
  if (process.env.E2E_MODE !== "true") return true;
  assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  return false;
}
