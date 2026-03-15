import Decimal from "decimal.js";

/**
 * Convert Prisma Decimal to string for display
 */
export function decimalToString(value: Decimal | string | number): string {
  return new Decimal(value).toString();
}

/**
 * Convert string to Decimal for calculations
 */
export function stringToDecimal(value: string): Decimal {
  return new Decimal(value);
}

/**
 * Format decimal as currency
 */
export function formatCurrency(
  value: Decimal | string | number,
  currency: string = "USD"
): string {
  const decimal = new Decimal(value);
  return `${currency} ${decimal.toFixed(2)}`;
}

/**
 * Format decimal as quantity
 */
export function formatQuantity(value: Decimal | string | number): string {
  const decimal = new Decimal(value);
  return decimal.toString();
}

/**
 * Validate decimal input
 */
export function isValidDecimal(value: string): boolean {
  try {
    new Decimal(value);
    return true;
  } catch {
    return false;
  }
}
