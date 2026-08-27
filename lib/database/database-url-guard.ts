export const TEST_DATABASE_SUFFIX_PATTERN = /_(?:test|e2e)$/i;

export interface DatabaseIdentity {
  databaseName: string;
  hostname: string;
  port: string;
  protocol: "postgres:" | "postgresql:";
  safeLabel: string;
}
export function parsePostgresDatabaseUrl(rawUrl: string): DatabaseIdentity {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("数据库 URL 格式无效");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("仅支持 PostgreSQL 数据库 URL");
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!databaseName || databaseName.includes("/")) {
    throw new Error("数据库 URL 必须包含单一、明确的数据库名称");
  }

  const hostname = parsed.hostname;
  const port = parsed.port || "5432";
  return {
    databaseName,
    hostname,
    port,
    protocol: parsed.protocol,
    safeLabel: `${hostname}:${port}/${databaseName}`,
  };
}

export function assertSafeTestDatabaseUrl(
  rawUrl: string | undefined,
  variableName = "TEST_DATABASE_URL",
): DatabaseIdentity {
  if (!rawUrl) {
    throw new Error(`${variableName} 未配置；E2E 禁止回退到 DATABASE_URL`);
  }

  const identity = parsePostgresDatabaseUrl(rawUrl);
  if (!TEST_DATABASE_SUFFIX_PATTERN.test(identity.databaseName)) {
    throw new Error(
      `${variableName} 指向 ${identity.safeLabel}；测试数据库名称必须以 _test 或 _e2e 结尾`,
    );
  }
  return identity;
}

export function assertConfirmedDatabase(
  rawUrl: string,
  confirmedDatabaseName: string | undefined,
): DatabaseIdentity {
  const identity = parsePostgresDatabaseUrl(rawUrl);
  if (!confirmedDatabaseName) {
    throw new Error("缺少 --confirm-db；不会对数据库执行备份或裁剪");
  }
  if (confirmedDatabaseName !== identity.databaseName) {
    throw new Error(
      `--confirm-db=${confirmedDatabaseName} 与目标数据库 ${identity.databaseName} 不一致`,
    );
  }
  return identity;
}
