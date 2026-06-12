import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { isLotConsumedAfterShipment } from "@/lib/application/order-allocation";

describe("shipping ledger remaining quantity", () => {
  it("keeps a lot active when shipment leaves positive stock", () => {
    expect(isLotConsumedAfterShipment(new Decimal(7))).toBe(false);
  });

  it("consumes a lot when shipment leaves zero stock", () => {
    expect(isLotConsumedAfterShipment(new Decimal(0))).toBe(true);
  });

  it("consumes a lot when shipment leaves negative stock", () => {
    expect(isLotConsumedAfterShipment(new Decimal(-1))).toBe(true);
  });
});
