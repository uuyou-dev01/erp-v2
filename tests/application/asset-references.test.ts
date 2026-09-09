import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  count: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mobileAsset: {
      updateMany: mocks.updateMany,
      count: mocks.count,
    },
  },
}));

import { bindAssetReferences } from "@/lib/assets/references";

describe("bindAssetReferences", () => {
  beforeEach(() => {
    mocks.updateMany.mockReset();
    mocks.count.mockReset();
  });

  it("accepts evidence already bound to the same order by another uploader", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.count.mockResolvedValue(2);

    await expect(
      bindAssetReferences(
        ["owner-proof", "fulfiller-proof"],
        { organizationId: "org", storeId: "store", userId: "fulfiller" },
        "CUSTOMER_ORDER",
        "order"
      )
    ).resolves.toEqual(["owner-proof", "fulfiller-proof"]);

    expect(mocks.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          refType: "CUSTOMER_ORDER",
          refId: "order",
        }),
      })
    );
  });

  it("still rejects missing, unowned, or differently bound evidence", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.count.mockResolvedValue(1);

    await expect(
      bindAssetReferences(
        ["valid-proof", "other-business-proof"],
        { organizationId: "org", storeId: "store", userId: "fulfiller" },
        "CUSTOMER_ORDER",
        "order"
      )
    ).rejects.toThrow("部分凭证不存在");
  });
});
