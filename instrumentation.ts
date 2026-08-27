export async function register() {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { assertProductionAuthConfig } = await import("@/lib/auth/production-config");
    const { validateProductionEnvironment } = await import("@/lib/runtime/env");
    assertProductionAuthConfig();
    validateProductionEnvironment();
  } catch (error) {
    console.error("[startup-config] production startup rejected", error);
    process.exit(1);
  }
}
