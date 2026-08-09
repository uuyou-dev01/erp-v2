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

import { deleteLocationAction, updateLocationAction } from "@/app/actions/locations";

const runId = `locations_action_${Date.now()}`;
const email = `${runId}@example.com`;
let organizationId = "";
let storeId = "";

describe("location action results", () => {
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
  it("returns a structured failure when updating a missing location", async () => {
    const result = await updateLocationAction({
      id: `missing_location_${runId}`,
      storeId: `store_${runId}`,
      code: `WH_${runId}`,
      name: "Missing Location",
      region: "CN_SHANGHAI",
      type: "WAREHOUSE",
      isSellableDefault: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("位置不存在");
    }
  });

  it("returns a structured failure when deleting a missing location", async () => {
    const result = await deleteLocationAction(
      `missing_location_${runId}`,
      `store_${runId}`
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("无权访问该店铺");
    }
  });
});
