import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
  }),
}));

import { deletePlatformAction, updatePlatformAction } from "@/app/actions/platforms";

const runId = `platforms_action_${Date.now()}`;
const email = `${runId}@example.com`;
let organizationId = "";
let storeId = "";

describe("platform action results", () => {
  beforeAll(async () => {
    process.env.ERP_DEV_USER_EMAIL = email;
    const organization = await prisma.organization.create({ data: { code: runId, name: runId } });
    organizationId = organization.id;
    const store = await prisma.store.create({ data: { organizationId, code: runId, name: runId, currency: "CNY" } });
    storeId = store.id;
    const user = await prisma.user.create({ data: { email, password: "test", role: "OWNER", storeId } });
    await prisma.membership.create({ data: { organizationId, userId: user.id, role: "OWNER", status: "ACTIVE" } });
    await prisma.storeAccess.create({ data: { storeId, userId: user.id, role: "OWNER" } });
  });
  afterAll(async () => {
    delete process.env.ERP_DEV_USER_EMAIL;
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });
  it("returns a structured failure when updating a missing platform", async () => {
    const result = await updatePlatformAction(`missing_platform_${runId}`, {
      code: `PLAT_${runId}`,
      name: "Missing Platform",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("平台不存在");
    }
  });

  it("returns a structured failure when deleting with an inaccessible store", async () => {
    const result = await deletePlatformAction(
      `missing_platform_${runId}`,
      `store_${runId}`
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("无权访问该店铺");
    }
  });
});
