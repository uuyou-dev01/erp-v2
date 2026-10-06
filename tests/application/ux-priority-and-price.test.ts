import { describe, expect, it } from "vitest";
import { listingPriceRisks } from "@/lib/application/listing-price-risk";
import { workQueueFocus } from "@/lib/application/workbench-focus";

describe("operational attention", () => {
  it("keeps shipping work ahead of external waits and optional listing coverage", () => {
    expect(workQueueFocus("pendingShipment")).toBe("now");
    expect(workQueueFocus("exception")).toBe("now");
    expect(workQueueFocus("pendingSettlement")).toBe("now");
    expect(workQueueFocus("shipped")).toBe("waiting");
    expect(workQueueFocus("inTransit")).toBe("waiting");
    expect(workQueueFocus("pendingListing")).toBe("opportunity");
  });
  it("flags the Mercari currency anomaly without changing historical data", () => {
    const row = {
      currency: "CNY",
      listedPrice: "3160",
      defaultShippingFee: "520",
      platform: { code: "MERCARI", defaultCurrency: "CNY" },
    };
    const original = structuredClone(row);
    expect(listingPriceRisks(row).map((risk) => risk.key)).toContain("currency");
    expect(row).toEqual(original);
    expect(
      listingPriceRisks({
        ...row,
        currency: "JPY",
        platform: { code: "MERCARI", defaultCurrency: "JPY" },
      })
    ).toEqual([]);
  });
  it("checks missing currency and implausible shipping but accepts unknown multi-currency platforms", () => {
    expect(listingPriceRisks({ currency: null })[0].key).toBe("currency");
    expect(
      listingPriceRisks({ currency: "USD", listedPrice: "20", defaultShippingFee: "25" })[0].key
    ).toBe("amount");
    expect(
      listingPriceRisks({
        currency: "EUR",
        listedPrice: "20",
        platform: { code: "CUSTOM", country: "GLOBAL" },
      })
    ).toEqual([]);
    expect(listingPriceRisks({ currency: "JPY", listedPrice: "0" })[0].key).toBe("amount");
  });
});
