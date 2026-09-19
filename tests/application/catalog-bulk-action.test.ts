import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
  category: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    sKU: { findMany: mocks.findMany, update: mocks.update },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/auth/user-context", () => ({
  requireUserContext: async () => ({ activeStoreId: "store", organizationId: "org" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/application/product-category-service", () => ({
  resolveProductCategory: mocks.category,
}));
import { bulkUpdateSkuCatalogAction } from "@/app/actions/skus";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([{ id: "a", attributes: { custom: "preserved" } }]);
  mocks.category.mockResolvedValue({ id: "category", name: "玩具" });
  mocks.transaction.mockResolvedValue([]);
});
describe("catalog bulk authorization and updates", () => {
  it("rejects IDs outside the active store without writing", async () => {
    mocks.findMany.mockResolvedValue([]);
    expect(
      (await bulkUpdateSkuCatalogAction({ ids: ["foreign"], status: "disabled" })).success
    ).toBe(false);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["foreign"] }, storeId: "store" } })
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("deduplicates IDs, preserves metadata and updates in one transaction", async () => {
    expect(
      (await bulkUpdateSkuCatalogAction({ ids: ["a", "a"], status: "disabled" })).success
    ).toBe(true);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update.mock.calls[0][0].data.attributes).toMatchObject({
      custom: "preserved",
      catalogStatus: "disabled",
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
  it("resolves the category within the current organization", async () => {
    expect((await bulkUpdateSkuCatalogAction({ ids: ["a"], category: "玩具" })).success).toBe(true);
    expect(mocks.category).toHaveBeenCalledWith({ organizationId: "org", legacyName: "玩具" });
    expect(mocks.update.mock.calls[0][0].data).toEqual({
      categoryId: "category",
      category: "玩具",
    });
  });
  it("rejects empty, oversized or ambiguous operations", async () => {
    for (const input of [
      { ids: [], status: "disabled" as const },
      { ids: Array.from({ length: 501 }, (_, i) => String(i)), status: "disabled" as const },
      { ids: ["a"], status: "disabled" as const, category: "玩具" },
    ])
      expect((await bulkUpdateSkuCatalogAction(input)).success).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
