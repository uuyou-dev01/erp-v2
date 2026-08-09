import { describe, expect, it, vi } from "vitest";
import { matchOrCreateQuickEntrySku } from "@/lib/application/quick-entry";
import { isUsedCondition } from "@/lib/quick-entry-utils";

function quickEntryInput(overrides: Record<string, string> = {}) {
  return {
    storeId: "store_1",
    rawBrand: "Nike",
    rawProductName: "Dunk SB Low 芝加哥",
    rawVariant: "43码",
    rawCategory: "鞋类",
    ...overrides,
  };
}

describe("quick entry SKU structure", () => {
  it("creates a product group and operational variant when a specification is provided", async () => {
    const create = vi
      .fn()
      .mockImplementationOnce(({ data }) => ({ id: "group_1", ...data }))
      .mockImplementationOnce(({ data }) => ({ id: "variant_1", ...data }));
    const tx = {
      sKU: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
        findUnique: vi.fn().mockResolvedValue(null),
        create,
        update: vi.fn(),
      },
    };

    const result = await matchOrCreateQuickEntrySku(tx as never, "store_1", quickEntryInput());

    expect(create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          catalogRole: "GROUP",
          name: "Dunk SB Low 芝加哥",
          variantAxes: ["规格"],
        }),
      })
    );
    expect(create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          parentSkuId: "group_1",
          catalogRole: "VARIANT",
          variantLabel: "43码",
        }),
      })
    );
    expect(result.sku.id).toBe("variant_1");
  });

  it("repairs a legacy auto-created independent SKU into a variant", async () => {
    const legacySimple = {
      id: "legacy_1",
      code: "dunk-sb-low-芝加哥-43码",
      name: "Dunk SB Low 芝加哥 43码",
      catalogRole: "SIMPLE",
      brand: "Nike",
      category: "鞋类",
      attributes: { variant: "43码" },
    };
    const update = vi.fn().mockImplementation(({ data }) => ({
      ...legacySimple,
      ...data,
    }));
    const tx = {
      sKU: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: "group_1", brand: "Nike", category: "鞋类" })
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(legacySimple),
        findUnique: vi.fn(),
        create: vi.fn(),
        update,
      },
    };

    const result = await matchOrCreateQuickEntrySku(tx as never, "store_1", quickEntryInput());

    expect(update).toHaveBeenCalledWith({
      where: { id: "legacy_1" },
      data: expect.objectContaining({
        parentSkuId: "group_1",
        catalogRole: "VARIANT",
        variantLabel: "43码",
      }),
    });
    expect(result.sku.catalogRole).toBe("VARIANT");
  });

  it("requires a specification when an existing product is group-managed", async () => {
    const tx = {
      sKU: {
        findFirst: vi.fn().mockResolvedValue({
          id: "group_1",
          catalogRole: "GROUP",
          name: "Dunk SB Low 芝加哥",
        }),
      },
    };

    await expect(
      matchOrCreateQuickEntrySku(tx as never, "store_1", quickEntryInput({ rawVariant: "" }))
    ).rejects.toThrow("按规格管理");
  });

  it("treats damaged and mixed batches as condition-tracked inventory", () => {
    expect(isUsedCondition("瑕疵")).toBe(true);
    expect(isUsedCondition("非统一")).toBe(true);
    expect(isUsedCondition("新品")).toBe(false);
  });
});
