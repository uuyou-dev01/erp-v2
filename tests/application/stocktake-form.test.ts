import { describe, expect, it } from "vitest";
import {
  isStocktakeDraftChanged,
  parseStocktakeUnitCostInput,
} from "@/lib/application/stocktake-form";

describe("stocktake form parsing", () => {
  it("treats invalid unit-cost drafts as invalid without throwing", () => {
    const parsed = parseStocktakeUnitCostInput("abc", "12.50");

    expect(parsed.valid).toBe(false);
    expect(parsed.decimal.toFixed(2)).toBe("12.50");
  });

  it("keeps invalid unit-cost drafts visible as changed rows", () => {
    expect(
      isStocktakeDraftChanged(
        { countedQty: "5", countedUnitCost: "not-a-number", notes: "" },
        5,
        "12.50"
      )
    ).toBe(true);
  });
});
