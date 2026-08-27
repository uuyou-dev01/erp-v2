const PLACEHOLDER_VALUES = new Set([
  "change-me",
  "replace-me",
  "your-secret-key-here",
  "unknown",
]);

function required(name: string) {
  const value = process.env[name]?.trim();
  if (
    !value ||
    PLACEHOLDER_VALUES.has(value.toLowerCase()) ||
    /^(?:replace|change|your)-/i.test(value)
  ) {
    throw new Error(`生产环境缺少有效的 ${name}`);
  }
  return value;
}

function strongSecret(name: string) {
  const value = required(name);
  if (value.length < 32) throw new Error(`${name} 至少需要 32 个字符`);
  return value;
}

export function validateProductionEnvironment() {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const databaseUrl = required("DATABASE_URL");
  if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    throw new Error("DATABASE_URL 必须使用 PostgreSQL");
  }
  const parsedDatabaseUrl = new URL(databaseUrl);
  if (!parsedDatabaseUrl.password || /^(?:replace|change|your)-/i.test(parsedDatabaseUrl.password)) {
    throw new Error("DATABASE_URL 必须包含有效的生产数据库密码");
  }

  const baseUrl = required("APP_BASE_URL");
  if (!/^https:\/\//i.test(baseUrl)) throw new Error("APP_BASE_URL 必须使用 HTTPS");

  const secrets = [
    strongSecret("ERP_SESSION_SECRET"),
    strongSecret("AUTH_AUDIT_PEPPER"),
    strongSecret("MOBILE_CRON_SECRET"),
    strongSecret("FX_SYNC_TOKEN"),
  ];
  if (new Set(secrets).size !== secrets.length) {
    throw new Error("ERP_SESSION_SECRET、AUTH_AUDIT_PEPPER、MOBILE_CRON_SECRET 与 FX_SYNC_TOKEN 必须彼此独立");
  }

  if (process.env.ERP_DEV_USER_EMAIL || process.env.ERP_DEMO_PASSWORD) {
    throw new Error("生产环境禁止配置 ERP_DEV_USER_EMAIL 或 ERP_DEMO_PASSWORD");
  }
  if (process.env.AUTH_SELF_SIGNUP_ENABLED === "true") {
    throw new Error("首个生产版本禁止开放 AUTH_SELF_SIGNUP_ENABLED");
  }

  required("APP_VERSION");
  const gitSha = required("GIT_SHA");
  if (!/^[0-9a-f]{40}$/i.test(gitSha)) throw new Error("GIT_SHA 必须是完整的 40 位提交 SHA");

  const vapidValues = [
    process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_KEY,
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY,
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY,
    process.env.WEB_PUSH_SUBJECT,
  ];
  const configuredVapid = vapidValues.filter((value) => Boolean(value?.trim())).length;
  if (configuredVapid !== 0 && configuredVapid !== vapidValues.length) {
    throw new Error("Web Push 启用时必须完整配置 VAPID 公钥、私钥和联系地址");
  }
}

export function releaseMetadata() {
  return {
    version: process.env.APP_VERSION || "development",
    sha: process.env.GIT_SHA || "unknown",
    builtAt: process.env.BUILD_DATE || "unknown",
  };
}
