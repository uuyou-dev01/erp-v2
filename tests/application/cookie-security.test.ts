import { afterEach, describe, expect, it } from "vitest";
import { isSecureCookieEnabled } from "@/lib/auth/cookie-security";

describe("cookie security mode", () => {
  const original = {
    nodeEnv: process.env.NODE_ENV,
    e2eMode: process.env.E2E_MODE,
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
  };
  const setNodeEnv = (value?: string) => {
    if (value) Object.assign(process.env, { NODE_ENV: value });
    else Reflect.deleteProperty(process.env, "NODE_ENV");
  };

  afterEach(() => {
    setNodeEnv(original.nodeEnv);
    if (original.e2eMode) process.env.E2E_MODE = original.e2eMode;
    else delete process.env.E2E_MODE;
    if (original.testDatabaseUrl) process.env.TEST_DATABASE_URL = original.testDatabaseUrl;
    else delete process.env.TEST_DATABASE_URL;
  });

  it("keeps production cookies secure by default", () => {
    setNodeEnv("production");
    delete process.env.E2E_MODE;
    delete process.env.TEST_DATABASE_URL;
    expect(isSecureCookieEnabled()).toBe(true);
  });

  it("allows local HTTP only for an isolated E2E database", () => {
    setNodeEnv("production");
    process.env.E2E_MODE = "true";
    process.env.TEST_DATABASE_URL = "postgresql://localhost/erp_e2e";
    expect(isSecureCookieEnabled()).toBe(false);
  });

  it("fails closed when E2E mode points at a non-test database", () => {
    setNodeEnv("production");
    process.env.E2E_MODE = "true";
    process.env.TEST_DATABASE_URL = "postgresql://localhost/erp";
    expect(() => isSecureCookieEnabled()).toThrow(/_test.*_e2e/);
  });
});
