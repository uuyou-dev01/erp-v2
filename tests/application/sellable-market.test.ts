import { describe, expect, it } from "vitest";
import {
  buildSellableMarketSummaries,
  inferMarketFromPlatform,
  inferMarketFromLocation,
  fulfillmentMarketsForLocation,
  isPlatformTargetForMarket,
  locationMatchesMarket,
  locationIsInMarket,
  locationMatchesPlatformMarket,
} from "@/lib/application/sellable-market";

describe("sellable market rules", () => {
  it("infers the sellable market from structured location region first", () => {
    expect(inferMarketFromLocation({ region: "JP_TOKYO", code: "WH-1", name: "仓库" })).toBe("JP");
    expect(
      inferMarketFromLocation({ region: "CN_SHANGHAI", code: "JP-NAME", name: "日本名" })
    ).toBe("CN");
  });

  it("keeps only target platforms for the product's sellable market", () => {
    expect(isPlatformTargetForMarket({ code: "MERCARI", country: "JP" }, "JP")).toBe(true);
    expect(isPlatformTargetForMarket({ code: "XIAN_YU", country: "CN" }, "JP")).toBe(false);
    expect(isPlatformTargetForMarket({ code: "XIAN_YU", country: "CN" }, "CN")).toBe(true);
    expect(isPlatformTargetForMarket({ code: "MERCARI", country: "JP" }, "CN")).toBe(false);
  });

  it("infers a platform market from its code when legacy data has no country", () => {
    expect(inferMarketFromPlatform({ code: "MERCARI", country: null })).toBe("JP");
    expect(inferMarketFromPlatform({ code: "XIAN_YU", country: null })).toBe("CN");
  });

  it("supports explicitly configured European warehouses and platforms", () => {
    expect(inferMarketFromLocation({ region: "EU_GERMANY" })).toBe("EU");
    expect(inferMarketFromPlatform({ code: "VINTED", country: "EU" })).toBe("EU");
    expect(isPlatformTargetForMarket({ code: "VINTED", country: "EU" }, "CN")).toBe(false);
  });

  it("allows a China warehouse to fulfill Japan through an explicit cross-border lane", () => {
    const shanghaiWarehouse = {
      region: "CN_SHANGHAI",
      code: "WH-CN",
      name: "上海代发仓",
      capabilities: [{ code: "DIRECT_FULFILLMENT", enabled: true }],
      shippingLanesFrom: [
        {
          laneType: "CUSTOMER_DELIVERY",
          destinationCountry: "JP",
          active: true,
        },
      ],
    };

    expect(inferMarketFromLocation(shanghaiWarehouse)).toBe("CN");
    expect(fulfillmentMarketsForLocation(shanghaiWarehouse)).toEqual(["JP"]);
    expect(locationMatchesMarket(shanghaiWarehouse, "JP")).toBe(true);
    expect(locationMatchesMarket(shanghaiWarehouse, "CN")).toBe(false);
    expect(locationIsInMarket(shanghaiWarehouse, "CN")).toBe(true);
    expect(locationIsInMarket(shanghaiWarehouse, "JP")).toBe(false);
    expect(
      locationMatchesPlatformMarket(shanghaiWarehouse, { code: "MERCARI", country: "JP" })
    ).toBe(true);
  });

  it("requires both order-fulfillment capability and an active customer lane", () => {
    const consolidationOnly = {
      region: "CN_SHANGHAI",
      capabilities: [{ code: "CONSOLIDATE", enabled: true }],
      shippingLanesFrom: [
        {
          laneType: "CUSTOMER_DELIVERY",
          destinationCountry: "JP",
          active: true,
        },
      ],
    };
    expect(fulfillmentMarketsForLocation(consolidationOnly)).toEqual([]);
    expect(locationMatchesMarket(consolidationOnly, "JP")).toBe(false);
  });

  it("does not leak country platforms into an unclassified warehouse market", () => {
    expect(isPlatformTargetForMarket({ code: "MERCARI", country: "JP" }, "UNKNOWN")).toBe(false);
    expect(isPlatformTargetForMarket({ code: "XIAN_YU", country: "CN" }, "UNKNOWN")).toBe(false);
    expect(isPlatformTargetForMarket({ code: "CUSTOM", country: null }, "UNKNOWN")).toBe(true);
    expect(isPlatformTargetForMarket({ code: "GLOBAL_STORE", country: "GLOBAL" }, "UNKNOWN")).toBe(
      true
    );
  });

  it("selects the highest sellable-quantity market as primary and keeps transit second-layer", () => {
    const summaries = buildSellableMarketSummaries({
      sellableLocations: [
        {
          locationId: "jp",
          code: "WH-JP",
          name: "日本仓",
          region: "JP_TOKYO",
          type: "WAREHOUSE",
          qty: 10,
        },
        {
          locationId: "cn",
          code: "WH-CN",
          name: "中国仓",
          region: "CN_SHANGHAI",
          type: "WAREHOUSE",
          qty: 2,
        },
      ],
      inTransitLocations: [
        {
          locationId: "jp-transit",
          code: "FWD-JP",
          name: "日本转运",
          region: "JP_OSAKA",
          type: "TRANSIT",
          qty: 4,
        },
      ],
      itemUnits: [],
    });

    expect(summaries[0]).toMatchObject({
      market: "JP",
      label: "日本市场",
      sellableQty: 10,
      inTransitQty: 4,
      isPrimary: true,
    });
    expect(summaries[1]).toMatchObject({
      market: "CN",
      sellableQty: 2,
      isPrimary: false,
    });
  });

  it("keeps cross-border-capable stock in the warehouse's physical market only", () => {
    const summaries = buildSellableMarketSummaries({
      sellableLocations: [
        {
          locationId: "jp-can-ship-cn",
          code: "WH-JP",
          name: "日本仓",
          region: "JP_TOKYO",
          type: "WAREHOUSE",
          fulfillableMarkets: ["JP", "CN"],
          qty: 6,
        },
      ],
      inTransitLocations: [],
      itemUnits: [],
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ market: "JP", sellableQty: 6 });
  });
});
