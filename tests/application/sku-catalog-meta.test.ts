import { describe, expect, it } from "vitest";
import { mergeSkuCatalogAttributes, parseSkuCatalogMeta } from "@/lib/application/sku-catalog";

describe("sku catalog metadata compatibility", () => {
  it("reads legacy barcode values from the former new-product fields", () => {
    const parsed = parseSkuCatalogMeta({
      productKind: "NEW",
      newFields: { barcode: "4901234567894", isSealed: true },
    });

    expect(parsed.barcode).toBe("4901234567894");
    expect(parsed.newFields?.isSealed).toBe(true);
  });

  it("stores barcode at SKU level without discarding legacy condition data", () => {
    const merged = mergeSkuCatalogAttributes(
      {
        productKind: "USED",
        usedFields: { defaultConditionGrade: "A", hasBox: true },
      },
      { barcode: "6901234567892" }
    );
    const parsed = parseSkuCatalogMeta(merged);

    expect(parsed.barcode).toBe("6901234567892");
    expect(parsed.productKind).toBe("USED");
    expect(parsed.usedFields).toEqual({
      defaultConditionGrade: "A",
      hasBox: true,
    });
  });

  it("allows a SKU barcode to be cleared", () => {
    const merged = mergeSkuCatalogAttributes({ barcode: "6901234567892" }, { barcode: null });

    expect(parseSkuCatalogMeta(merged).barcode).toBeNull();
  });
});
