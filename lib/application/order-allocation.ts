import Decimal from "decimal.js";

export const ORDER_ALLOCATION_STATUS = {
  PENDING: "PENDING",
  ALLOCATED: "ALLOCATED",
  SHIPPED: "SHIPPED",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
  RETURNED: "RETURNED",
} as const;

export const CLOSED_ALLOCATION_STATUSES = new Set<string>([
  ORDER_ALLOCATION_STATUS.SHIPPED,
  ORDER_ALLOCATION_STATUS.DELIVERED,
  ORDER_ALLOCATION_STATUS.RETURNED,
]);

export const RESERVING_ALLOCATION_STATUSES = [
  ORDER_ALLOCATION_STATUS.PENDING,
  ORDER_ALLOCATION_STATUS.ALLOCATED,
] as const;

export function computeAvailableAfterReservations(
  onHand: Decimal,
  reserved: Decimal
) {
  return onHand.minus(reserved);
}

export function canReserveQuantity(input: {
  onHand: Decimal;
  reserved: Decimal;
  requested: Decimal;
}) {
  return computeAvailableAfterReservations(input.onHand, input.reserved).gte(
    input.requested
  );
}

export function isLotConsumedAfterShipment(ledgerTotalAfterShipment: Decimal) {
  return ledgerTotalAfterShipment.lte(0);
}
