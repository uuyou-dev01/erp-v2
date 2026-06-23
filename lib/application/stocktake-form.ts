import Decimal from "decimal.js";

export interface StocktakeDraftInput {
  countedQty: string;
  countedUnitCost: string;
  notes: string;
}

export function parseStocktakeIntegerInput(value: string, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function parseStocktakeUnitCostInput(value: string, fallback: string) {
  const text = value.trim() || fallback;

  try {
    const decimal = new Decimal(text);
    if (decimal.isFinite() && decimal.gte(0)) {
      return { valid: true as const, decimal };
    }
  } catch {
    // User-entered draft values can be temporarily invalid while typing.
  }

  return { valid: false as const, decimal: new Decimal(fallback) };
}

export function isStocktakeDraftChanged(
  draft: StocktakeDraftInput,
  bookQty: number,
  bookUnitCost: string
) {
  const countedQty = parseStocktakeIntegerInput(draft.countedQty, bookQty);
  const countedUnitCost = parseStocktakeUnitCostInput(draft.countedUnitCost, bookUnitCost);

  return (
    countedQty !== bookQty ||
    !countedUnitCost.valid ||
    !countedUnitCost.decimal.eq(new Decimal(bookUnitCost)) ||
    Boolean(draft.notes.trim())
  );
}
