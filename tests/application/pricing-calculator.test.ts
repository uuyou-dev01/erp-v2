import { describe, expect, it } from "vitest";
import {
  applyPricingBasis,
  applyPricingPreset,
  emptyPricingDraft,
} from "@/lib/application/pricing-calculator";

describe("reusable pricing calculator draft", () => {
  it("starts empty with the requested 30 percent default", () => {
    expect(emptyPricingDraft()).toMatchObject({
      mode: "forward",
      cost: "",
      salePrice: "",
      marginPercent: "30",
      feePercent: "0",
    });
  });
  it("presets preserve entered cost and exchange rate", () => {
    const draft = {
      ...emptyPricingDraft(),
      cost: "369",
      currency: "JPY",
      exchangeRate: "20",
      shipping: "520",
    };
    expect(applyPricingPreset(draft, "fee")).toMatchObject({
      cost: "369",
      currency: "JPY",
      exchangeRate: "20",
      marginPercent: "30",
      feePercent: "10",
      shipping: "",
    });
    expect(applyPricingPreset(draft, "basic")).toMatchObject({ feePercent: "0", shipping: "0" });
  });
  it("replaces product cost but retains rates only for the same currency pair", () => {
    const draft = {
      ...emptyPricingDraft(),
      cost: "100",
      currency: "JPY",
      exchangeRate: "20",
      shipping: "520",
      marginPercent: "40",
    };
    const basis = {
      cost: { amount: "369", currency: "CNY", source: "采购" },
      reference: { amount: "10000", currency: "JPY", source: "成交" },
      unavailable: null,
    };
    expect(applyPricingBasis(draft, basis)).toMatchObject({
      mode: "forward",
      cost: "369",
      shipping: "520",
      exchangeRate: "20",
      marginPercent: "40",
    });
    expect(applyPricingBasis(draft, { ...basis, reference: null })).toMatchObject({
      cost: "369",
      currency: "CNY",
      shipping: "",
      exchangeRate: "",
    });
    expect(applyPricingBasis(draft, { cost: null, reference: null, unavailable: null }).cost).toBe(
      ""
    );
  });
});
