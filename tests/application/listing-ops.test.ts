import { describe, expect, it } from "vitest";
import type { ListingOpsItem } from "@/components/listing/listing-ops-types";
import { sortListingOpsItems } from "@/lib/application/listing-ops";

function listing(
  id: string,
  status: string,
  listedAt: string,
  listedPrice = "100"
): ListingOpsItem {
  return {
    id,
    salesChannelAccountId: null,
    hasResaleSource: false,
    listingType: "SKU",
    status,
    skuId: id,
    itemUnitId: null,
    skuCode: id,
    skuName: id,
    imageUrl: null,
    platform: { id: "platform", name: "Platform", code: "MERCARI" },
    listedPrice,
    currency: "CNY",
    platformFeeRate: null,
    defaultShippingFee: null,
    estimatedNet: null,
    listedAt,
    updatedAt: listedAt,
    sellableQty: 1,
    sellableLocations: [],
    risks: [],
  };
}

describe("listing operations sorting", () => {
  it("always places sold-out and delisted history below active listings", () => {
    const result = sortListingOpsItems(
      [
        listing("sold-newest", "SOLD_OUT", "2026-07-30T03:00:00.000Z"),
        listing("active-older", "ACTIVE", "2026-07-28T03:00:00.000Z"),
        listing("delisted-newer", "DELISTED", "2026-07-29T03:00:00.000Z"),
        listing("active-newest", "ACTIVE", "2026-07-30T02:00:00.000Z"),
      ],
      "updatedAt"
    );

    expect(result.map((item) => item.id)).toEqual([
      "active-newest",
      "active-older",
      "sold-newest",
      "delisted-newer",
    ]);
  });

  it("keeps the selected price order within active and historical sections", () => {
    const result = sortListingOpsItems(
      [
        listing("sold-low", "SOLD_OUT", "2026-07-30T03:00:00.000Z", "10"),
        listing("active-high", "ACTIVE", "2026-07-28T03:00:00.000Z", "200"),
        listing("active-low", "ACTIVE", "2026-07-29T03:00:00.000Z", "50"),
      ],
      "priceAsc"
    );

    expect(result.map((item) => item.id)).toEqual(["active-low", "active-high", "sold-low"]);
  });
});
