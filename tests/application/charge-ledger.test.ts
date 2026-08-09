import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  assertChargeTransition,
  calculateSuggestedCharge,
  settlementRemainder,
} from "@/lib/application/charge-ledger";

describe("operational charge ledger", () => {
  it("calculates fixed, per-item and percentage estimates without posting facts", () => {
    expect(calculateSuggestedCharge({ method: "FIXED", fixedAmount: "12.5" }).toString()).toBe("12.5");
    expect(calculateSuggestedCharge({ method: "PER_ITEM", fixedAmount: "3.2", quantity: "4" }).toString()).toBe("12.8");
    expect(calculateSuggestedCharge({ method: "PERCENTAGE", rate: "0.075", baseAmount: "200" }).toString()).toBe("15");
    expect(calculateSuggestedCharge({ method: "MANUAL" }).eq(new Decimal(0))).toBe(true);
  });

  it("requires immutable confirmed facts to be corrected with reversal events", () => {
    expect(() => assertChargeTransition("DRAFT", "SUBMITTED")).not.toThrow();
    expect(() => assertChargeTransition("SUBMITTED", "CONFIRMED")).not.toThrow();
    expect(() => assertChargeTransition("CONFIRMED", "VOID")).toThrow(/不能从 CONFIRMED/);
    expect(() => assertChargeTransition("SETTLED", "VOID")).toThrow();
  });

  it("keeps partial settlement balances exact", () => {
    expect(settlementRemainder({ amount: "100", settledAmounts: ["20.125", "9.875"] }).toString()).toBe("70");
  });
});
