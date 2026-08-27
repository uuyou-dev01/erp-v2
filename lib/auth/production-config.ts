const PLACEHOLDER_SECRETS = new Set(["your-secret-key-here", "replace-me", "changeme"]);

function requireStrongSecret(name: string) {
  const value = process.env[name]?.trim();
  if (!value || value.length < 32 || PLACEHOLDER_SECRETS.has(value.toLowerCase())) {
    throw new Error(`生产环境必须配置至少 32 字符的 ${name}`);
  }
}

export function assertProductionAuthConfig() {
  if (process.env.NODE_ENV !== "production") return;
  requireStrongSecret("ERP_SESSION_SECRET");
  requireStrongSecret("AUTH_AUDIT_PEPPER");
  if (process.env.ERP_DEV_USER_EMAIL) {
    throw new Error("生产环境禁止配置 ERP_DEV_USER_EMAIL");
  }
  if (process.env.AUTH_SELF_SIGNUP_ENABLED === "true") {
    throw new Error("生产环境必须关闭 AUTH_SELF_SIGNUP_ENABLED；请使用受邀注册");
  }
}
