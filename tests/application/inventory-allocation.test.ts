import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  canReserveQuantity,
  computeAvailableAfterReservations,
} from "@/lib/application/order-allocation";

describe("inventory allocation reservation", () => {
  it("subtracts allocated quantity from available stock before shipping", () => {
    expect(
      computeAvailableAfterReservations(
        new Decimal(10),
        new Decimal(3)
      ).toString()
    ).toBe("7");
  });

  it("allows reservation when available quantity covers the request", () => {
    expect(
      canReserveQuantity({
        onHand: new Decimal(10),
        reserved: new Decimal(3),
        requested: new Decimal(7),
      })
    ).toBe(true);
  });

  it("rejects a reservation larger than available stock", () => {
    expect(
      canReserveQuantity({
        onHand: new Decimal(2),
        reserved: new Decimal(1),
        requested: new Decimal(2),
      })
    ).toBe(false);
  });
});
