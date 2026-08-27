import { spawnSync } from "node:child_process";
import { assertSafeTestDatabaseUrl } from "../lib/database/database-url-guard";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const identity = assertSafeTestDatabaseUrl(testDatabaseUrl);
const childEnv = {
  ...process.env,
  DATABASE_URL: testDatabaseUrl,
  TEST_DATABASE_URL: testDatabaseUrl,
};

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: childEnv,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} 执行失败（exit ${result.status ?? "unknown"}）`);
  }
}

console.log(`准备隔离 E2E 数据库：${identity.safeLabel}`);
run("npx", ["prisma", "migrate", "reset", "--force", "--skip-seed"]);
run("npx", ["prisma", "migrate", "deploy"]);
run("npx", ["tsx", "tests/e2e/fixtures/seed-e2e.ts"]);
