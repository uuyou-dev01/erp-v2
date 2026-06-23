import { describe, expect, it, vi } from "vitest";

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

describe("location action results", () => {
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
