import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("prisma config", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it("keeps seed configuration out of deprecated package.json#prisma", async () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));

    expect(packageJson).not.toHaveProperty("prisma");

    const prismaConfig = await import("../../prisma.config");
    expect(prismaConfig.default.migrations?.seed).toBe("tsx prisma/seed.ts");
  });

  it("loads DATABASE_URL from .env when Prisma loads config first", async () => {
    vi.resetModules();
    delete process.env.DATABASE_URL;

    await import("../../prisma.config");

    expect(process.env.DATABASE_URL).toMatch(/^postgresql:/);
  });
});
