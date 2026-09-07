import { describe, expect, it } from "vitest";
import {
  BUNDLE_FULFILLMENT_REASON_CODES,
  resolveBundleFulfillmentEligibility,
  type BundleFulfillmentLine,
} from "@/lib/application/bundle-fulfillment-eligibility";

function line(
  lineId: string,
  locations: BundleFulfillmentLine["candidatePhysicalLocations"],
  overrides: Partial<BundleFulfillmentLine> = {}
): BundleFulfillmentLine {
  return {
    lineId,
    salesChannelAccountId: "mercari-account-1",
    currency: "JPY",
    quantity: "1",
    candidatePhysicalLocations: locations,
    ...overrides,
  };
}

function location(
  locationId: string,
  availableQuantity: string | number = "1",
  fulfillmentMarkets: readonly string[] = ["JP"]
) {
  return { locationId, availableQuantity, fulfillmentMarkets };
}

describe("bundle fulfillment eligibility", () => {
  it("allows mixed ownership and resale sources at one common physical warehouse", () => {
    const result = resolveBundleFulfillmentEligibility({
      destinationMarket: "JP",
      lines: [
        line("owned", [location("warehouse-shared")], {
          inventoryOwnerId: "our-organization",
          sourceType: "PURCHASE",
        }),
        line("resale", [location("warehouse-shared")], {
          inventoryOwnerId: "partner-organization",
          sourceType: "CONSIGNMENT_RESALE",
        }),
      ],
    });

    expect(result).toEqual({
      parcelEligible: true,
      commonLocationIds: ["warehouse-shared"],
      reasons: [],
    });
  });

  it("requires one sales channel account even when the warehouse is shared", () => {
    const result = resolveBundleFulfillmentEligibility({
      destinationMarket: "JP",
      lines: [
        line("a", [location("warehouse-shared")]),
        line("b", [location("warehouse-shared")], {
          salesChannelAccountId: "mercari-account-2",
        }),
      ],
    });

    expect(result.parcelEligible).toBe(false);
    expect(result.commonLocationIds).toEqual(["warehouse-shared"]);
    expect(result.reasons.map(({ code }) => code)).toContain(
      BUNDLE_FULFILLMENT_REASON_CODES.SALES_CHANNEL_ACCOUNT_MISMATCH
    );
  });

  it("requires one currency and treats currency codes case-insensitively", () => {
    const commonInput = {
      destinationMarket: "JP",
      lines: [
        line("a", [location("warehouse")], { currency: "jpy" }),
        line("b", [location("warehouse")], { currency: "JPY" }),
      ],
    };
    expect(resolveBundleFulfillmentEligibility(commonInput).parcelEligible).toBe(true);

    const mismatch = resolveBundleFulfillmentEligibility({
      ...commonInput,
      lines: [commonInput.lines[0], { ...commonInput.lines[1], currency: "CNY" }],
    });
    expect(mismatch.reasons.map(({ code }) => code)).toContain(
      BUNDLE_FULFILLMENT_REASON_CODES.CURRENCY_MISMATCH
    );
  });

  it("returns every common location that has enough line-level stock", () => {
    const result = resolveBundleFulfillmentEligibility({
      destinationMarket: "JP",
      lines: [
        line(
          "a",
          [location("warehouse-b", 4), location("warehouse-a", 2), location("warehouse-low", 1)],
          { quantity: 2 }
        ),
        line("b", [location("warehouse-a", 5), location("warehouse-b", 3)]),
      ],
    });

    expect(result).toEqual({
      parcelEligible: true,
      commonLocationIds: ["warehouse-a", "warehouse-b"],
      reasons: [],
    });
  });

  it("rejects lines that do not have enough quantity at one warehouse", () => {
    const result = resolveBundleFulfillmentEligibility({
      destinationMarket: "JP",
      lines: [
        line("a", [location("warehouse", "1.5")], { quantity: "2" }),
        line("b", [location("warehouse", "5")]),
      ],
    });

    expect(result.parcelEligible).toBe(false);
    expect(result.commonLocationIds).toEqual([]);
    expect(result.reasons).toContainEqual(
      expect.objectContaining({
        code: BUNDLE_FULFILLMENT_REASON_CODES.INSUFFICIENT_LOCATION_QUANTITY,
        lineIds: ["a"],
      })
    );
  });

  it("accepts an exact destination or GLOBAL fulfillment route", () => {
    const result = resolveBundleFulfillmentEligibility({
      destinationMarket: "JP",
      lines: [
        line("a", [location("warehouse", 1, ["JP"])]),
        line("b", [location("warehouse", 1, ["GLOBAL"])]),
      ],
    });

    expect(result.parcelEligible).toBe(true);
    expect(result.commonLocationIds).toEqual(["warehouse"]);
  });

  it("reports when candidate warehouses cannot serve the destination", () => {
    const result = resolveBundleFulfillmentEligibility({
      destinationMarket: "JP",
      lines: [
        line("a", [location("warehouse", 2, ["CN"])]),
        line("b", [location("warehouse", 2, ["JP"])]),
      ],
    });

    expect(result.parcelEligible).toBe(false);
    expect(result.reasons).toContainEqual(
      expect.objectContaining({
        code: BUNDLE_FULFILLMENT_REASON_CODES.DESTINATION_MARKET_UNSUPPORTED,
        lineIds: ["a"],
      })
    );
  });

  it("asks for a destination without reporting a false unsupported-market error", () => {
    const result = resolveBundleFulfillmentEligibility({
      destinationMarket: " ",
      lines: [line("a", [location("warehouse")]), line("b", [location("warehouse")])],
    });

    expect(result.reasons.map(({ code }) => code)).toEqual([
      BUNDLE_FULFILLMENT_REASON_CODES.DESTINATION_MARKET_REQUIRED,
    ]);
  });

  it("rejects split fulfillment when each line can only ship from a different warehouse", () => {
    const result = resolveBundleFulfillmentEligibility({
      destinationMarket: "JP",
      lines: [line("a", [location("our-warehouse")]), line("b", [location("partner-warehouse")])],
    });

    expect(result.parcelEligible).toBe(false);
    expect(result.commonLocationIds).toEqual([]);
    expect(result.reasons).toContainEqual(
      expect.objectContaining({
        code: BUNDLE_FULFILLMENT_REASON_CODES.NO_COMMON_PHYSICAL_LOCATION,
        lineIds: ["a", "b"],
      })
    );
  });

  it("requires at least two lines and a positive requested quantity", () => {
    const result = resolveBundleFulfillmentEligibility({
      destinationMarket: "JP",
      lines: [line("a", [location("warehouse")], { quantity: 0 })],
    });

    expect(result.parcelEligible).toBe(false);
    expect(result.reasons.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        BUNDLE_FULFILLMENT_REASON_CODES.MULTIPLE_LINES_REQUIRED,
        BUNDLE_FULFILLMENT_REASON_CODES.INVALID_QUANTITY,
      ])
    );
  });
});
