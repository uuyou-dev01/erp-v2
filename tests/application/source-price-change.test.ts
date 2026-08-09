import { describe, expect, it } from "vitest";
import { calculateSourcePriceChange } from "@/lib/capture/service";

describe("source price changes", () => {
  it("calculates increases and their rate", () => {
    expect(calculateSourcePriceChange("100", "125")).toEqual({ previousAmount: "100.0000", amount: "125.0000", deltaAmount: "25.0000", deltaRate: "0.250000" });
  });

  it("handles zero previous amount without an invalid rate", () => {
    expect(calculateSourcePriceChange("0", "25").deltaRate).toBeNull();
  });
});
