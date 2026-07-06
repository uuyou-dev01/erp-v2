import { describe, expect, it } from "vitest";
import {
  buildSellableMarketSummaries,
  inferMarketFromLocation,
  isPlatformTargetForMarket,
} from "@/lib/application/sellable-market";

describe("sellable market rules", () => {
  it("infers the sellable market from structured location region first", () => {
    expect(inferMarketFromLocation({ region: "JP_TOKYO", code: "WH-1", name: "仓库" })).toBe(
      "JP"
    );
    expect(inferMarketFromLocation({ region: "CN_SHANGHAI", code: "JP-NAME", name: "日本名" })).toBe(
      "CN"
    );
  });

  it("keeps only target platforms for the product's sellable market", () => {
    expect(isPlatformTargetForMarket({ code: "MERCARI", country: "JP" }, "JP")).toBe(true);
    expect(isPlatformTargetForMarket({ code: "XIAN_YU", country: "CN" }, "JP")).toBe(false);
    expect(isPlatformTargetForMarket({ code: "XIAN_YU", country: "CN" }, "CN")).toBe(true);
    expect(isPlatformTargetForMarket({ code: "MERCARI", country: "JP" }, "CN")).toBe(false);
  });

  it("falls back to all platforms when the market is unknown", () => {
    expect(isPlatformTargetForMarket({ code: "MERCARI", country: "JP" }, "UNKNOWN")).toBe(true);
    expect(isPlatformTargetForMarket({ code: "XIAN_YU", country: "CN" }, "UNKNOWN")).toBe(true);
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
});
