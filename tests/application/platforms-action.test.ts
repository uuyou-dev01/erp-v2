import { describe, expect, it, vi } from "vitest";

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

describe("platform action results", () => {
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
