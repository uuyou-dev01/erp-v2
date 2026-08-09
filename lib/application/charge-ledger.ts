import Decimal from "decimal.js";

export const CHARGE_GROUPS = [
  "PLATFORM",
  "SHIPPING",
  "FULFILLMENT",
  "INSPECTION",
  "STORAGE",
  "PACKAGING",
  "AFTER_SALES",
  "TAX_DUTY",
  "COMMISSION",
  "PROCUREMENT",
  "OTHER",
] as const;

export type ChargeCalculationMethod = "MANUAL" | "FIXED" | "PER_ITEM" | "PERCENTAGE";

export function calculateSuggestedCharge(input: {
  method: ChargeCalculationMethod;
  fixedAmount?: Decimal.Value | null;
  rate?: Decimal.Value | null;
  quantity?: Decimal.Value | null;
  baseAmount?: Decimal.Value | null;
}) {
  const fixed = new Decimal(input.fixedAmount ?? 0);
  const rate = new Decimal(input.rate ?? 0);
  const quantity = new Decimal(input.quantity ?? 0);
  const baseAmount = new Decimal(input.baseAmount ?? 0);

  switch (input.method) {
    case "FIXED":
      return fixed;
    case "PER_ITEM":
      return fixed.mul(quantity);
    case "PERCENTAGE":
      return baseAmount.mul(rate);
    default:
      return new Decimal(0);
  }
}

export function assertChargeTransition(current: string, next: string) {
  const allowed: Record<string, string[]> = {
    DRAFT: ["SUBMITTED", "VOID"],
    SUBMITTED: ["CONFIRMED", "DISPUTED", "VOID"],
    DISPUTED: ["SUBMITTED", "VOID"],
    // Confirmed facts are immutable. Corrections are separate reversal events.
    CONFIRMED: ["PARTIALLY_SETTLED", "SETTLED"],
    PARTIALLY_SETTLED: ["SETTLED"],
    SETTLED: [],
    VOID: [],
  };
  if (!(allowed[current] ?? []).includes(next)) {
    throw new Error(`费用状态不能从 ${current} 变更为 ${next}`);
  }
}

export function settlementRemainder(input: {
  amount: Decimal.Value;
  settledAmounts: Decimal.Value[];
}) {
  return input.settledAmounts.reduce<Decimal>(
    (remaining, amount) => remaining.minus(new Decimal(amount)),
    new Decimal(input.amount),
  );
}
