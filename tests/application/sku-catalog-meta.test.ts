import { describe, expect, it } from "vitest";
import { mergeSkuCatalogAttributes, parseSkuCatalogMeta } from "@/lib/application/sku-catalog";

describe("sku catalog metadata compatibility", () => {
  it("uses the legacy shared currency for both prices", () => {
    const parsed = parseSkuCatalogMeta({ currency: "JPY" });

    expect(parsed.referencePriceCurrency).toBe("JPY");
    expect(parsed.referenceCostCurrency).toBe("JPY");
  });

  it("keeps sale and purchase reference currencies separate", () => {
    const merged = mergeSkuCatalogAttributes(
      { currency: "CNY" },
      { referencePriceCurrency: "JPY", referenceCostCurrency: "CNY" }
    );
    const parsed = parseSkuCatalogMeta(merged);

    expect(parsed.referencePriceCurrency).toBe("JPY");
    expect(parsed.referenceCostCurrency).toBe("CNY");
    expect(parsed.currency).toBe("JPY");
  });

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

  it("allows all SKU images to be removed", () => {
    const merged = mergeSkuCatalogAttributes(
      { images: [{ url: "/uploads/old-cover.webp", isCover: true }] },
      { images: [] }
    );

    expect(parseSkuCatalogMeta(merged).images).toEqual([]);
  });

  it("stores structured optional SKU weight and dimensions", () => {
    const merged = mergeSkuCatalogAttributes(null, {
      physicalDetails: {
        weightKg: "0.5",
        lengthCm: "30",
        widthCm: "20",
        heightCm: "10",
      },
    });
    const parsed = parseSkuCatalogMeta(merged);

    expect(parsed.physicalDetails).toEqual({
      weightKg: "0.5",
      lengthCm: "30",
      widthCm: "20",
      heightCm: "10",
    });
    expect(parsed.variantAttributes).not.toHaveProperty("physicalDetails");
  });

  it("allows SKU weight and dimensions to be cleared", () => {
    const merged = mergeSkuCatalogAttributes(
      { physicalDetails: { weightKg: "1", lengthCm: "12" } },
      { physicalDetails: null }
    );

    expect(parseSkuCatalogMeta(merged).physicalDetails).toBeNull();
  });
});
