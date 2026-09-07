import { describe, expect, it } from "vitest";
import {
  allocateBundleSaleAmounts,
  bundleAllocationDifference,
} from "@/lib/application/bundle-sale";

describe("bundle sale price allocation", () => {
  it("allocates a discounted total in proportion to listing prices", () => {
    expect(
      allocateBundleSaleAmounts("4500", [
        { id: "a", referenceAmount: "3000" },
        { id: "b", referenceAmount: "2000" },
      ])
    ).toEqual({ a: "2700.00", b: "1800.00" });
  });

  it("puts the rounding remainder on the last line", () => {
    const allocation = allocateBundleSaleAmounts("100", [
      { id: "a", referenceAmount: "1" },
      { id: "b", referenceAmount: "1" },
      { id: "c", referenceAmount: "1" },
    ]);

    expect(allocation).toEqual({ a: "33.33", b: "33.33", c: "33.34" });
    expect(bundleAllocationDifference("100", Object.values(allocation))).toBe("0.00");
  });

  it("falls back to an equal split when no listing has a price", () => {
    expect(
      allocateBundleSaleAmounts("90", [
        { id: "a", referenceAmount: null },
        { id: "b", referenceAmount: null },
      ])
    ).toEqual({ a: "45.00", b: "45.00" });
  });

  it("never creates a negative final allocation when the total is only a few cents", () => {
    const allocation = allocateBundleSaleAmounts(
      "0.03",
      ["a", "b", "c", "d", "e"].map((id) => ({ id, referenceAmount: "1" }))
    );

    expect(allocation).toEqual({
      a: "0.00",
      b: "0.00",
      c: "0.00",
      d: "0.00",
      e: "0.03",
    });
    expect(Object.values(allocation).every((amount) => Number(amount) >= 0)).toBe(true);
    expect(bundleAllocationDifference("0.03", Object.values(allocation))).toBe("0.00");
  });
});
