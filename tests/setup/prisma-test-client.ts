import { assertSafeTestDatabaseUrl } from "../../lib/database/database-url-guard";

const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? "";
assertSafeTestDatabaseUrl(testDatabaseUrl);

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: testDatabaseUrl,
});
