import { afterEach, describe, expect, it } from "vitest";
import { verifyPassword } from "@/lib/auth/password";

describe("legacy demo password boundary", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDemoPassword = process.env.ERP_DEMO_PASSWORD;
  const setNodeEnv = (value?: string) => {
    if (value) Object.assign(process.env, { NODE_ENV: value });
    else Reflect.deleteProperty(process.env, "NODE_ENV");
  };

  afterEach(() => {
    setNodeEnv(originalNodeEnv);
    if (originalDemoPassword) process.env.ERP_DEMO_PASSWORD = originalDemoPassword;
    else delete process.env.ERP_DEMO_PASSWORD;
  });

  it("never accepts the placeholder password in production", async () => {
    setNodeEnv("production");
    delete process.env.ERP_DEMO_PASSWORD;
    await expect(verifyPassword("admin123", "hashed_password_placeholder")).resolves.toBe(false);
  });

  it("keeps the explicit development-only migration path", async () => {
    setNodeEnv("development");
    process.env.ERP_DEMO_PASSWORD = "local-demo-only";
    await expect(
      verifyPassword("local-demo-only", "hashed_password_placeholder")
    ).resolves.toBe(true);
  });
});
