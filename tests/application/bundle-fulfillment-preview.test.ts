import Decimal from "decimal.js";
import { describe, expect, it, vi } from "vitest";
import {
  agreementCoversBundleFulfillment,
  canAllocateBundleAtLocation,
  previewBundleFulfillment,
  type BundleAuthorizedInventorySnapshot,
  type BundleFulfillmentPreviewClient,
  type BundleFulfillmentPreviewResolvedLine,
} from "@/lib/application/bundle-fulfillment-preview";

const now = new Date("2026-09-07T08:00:00.000Z");

function agreement(
  overrides: Partial<Parameters<typeof agreementCoversBundleFulfillment>[0]> = {}
) {
  return {
    status: "ACTIVE",
    effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
    effectiveTo: new Date("2026-09-30T23:59:59.000Z"),
    inventoryPoolId: "pool-a",
    locationId: "warehouse-a",
    serviceTypes: ["FULFILLMENT"],
    ...overrides,
  };
}

function skuLine(
  id: string,
  quantity: string,
  overrides: Partial<BundleFulfillmentPreviewResolvedLine> = {}
): BundleFulfillmentPreviewResolvedLine {
  return {
    id,
    listingType: "SKU",
    skuId: "sku-a",
    itemUnitId: null,
    salesChannelAccountId: "channel-a",
    platformId: "platform-a",
    currency: "JPY",
    quantity: new Decimal(quantity),
    ...overrides,
  };
}

function snapshot(
  overrides: Partial<BundleAuthorizedInventorySnapshot> = {}
): BundleAuthorizedInventorySnapshot {
  return {
    lotQuantityByLocationSku: new Map(),
    itemIdsByLocationSku: new Map(),
    exactItemLocationById: new Map(),
    ...overrides,
  };
}

function listing(id: string, skuId: string) {
  return {
    id,
    status: "ACTIVE",
    listingType: "SKU",
    skuId,
    itemUnitId: null,
    salesChannelAccountId: "channel-a",
    platformId: "platform-a",
    currency: "JPY",
    platform: { code: "MERCARI" },
    salesChannelAccount: {
      id: "channel-a",
      organizationId: "seller-org",
      platformCode: "MERCARI",
      status: "ACTIVE",
    },
    itemUnit: null,
    resaleListings: [],
  };
}

function location(operatorOrganizationId = "seller-org") {
  return {
    id: "warehouse-a",
    code: "WH-A",
    name: "共同仓",
    region: "JP_TOKYO",
    operatorOrganizationId,
    isSellableDefault: true,
    store: { organizationId: operatorOrganizationId },
    capabilities: [{ code: "DIRECT_FULFILLMENT", enabled: true }],
    shippingLanesFrom: [{ laneType: "CUSTOMER_DELIVERY", destinationCountry: "JP", active: true }],
  };
}

function previewClient(overrides?: {
  operatorOrganizationId?: string;
  lots?: Array<Record<string, unknown>>;
  ledgers?: Array<{ entityId: string; deltaQty: Decimal }>;
  orderReservations?: Array<{
    lotId: string | null;
    itemUnitId: string | null;
    quantity: Decimal;
  }>;
  fulfillmentReservations?: Array<{
    lotId: string | null;
    itemUnitId: string | null;
    quantity: Decimal;
  }>;
  connections?: Array<{ pairKey: string }>;
  agreements?: Array<Record<string, unknown>>;
  fulfillers?: Array<{ organizationId: string; locationId: string; role: string }>;
}) {
  const rows = [listing("listing-a", "sku-a"), listing("listing-b", "sku-b")];
  const commonLocation = location(overrides?.operatorOrganizationId);
  const lots = overrides?.lots ?? [
    {
      id: "lot-a",
      skuId: "sku-a",
      inventoryPoolId: "pool-a",
      locationId: commonLocation.id,
      location: commonLocation,
    },
    {
      id: "lot-b",
      skuId: "sku-b",
      inventoryPoolId: "pool-a",
      locationId: commonLocation.id,
      location: commonLocation,
    },
  ];
  const ledgers =
    overrides?.ledgers ??
    lots.map((lot) => ({ entityId: String(lot.id), deltaQty: new Decimal(1) }));
  const mocks = {
    listing: { findMany: vi.fn().mockResolvedValue(rows) },
    channelAccess: { findUnique: vi.fn().mockResolvedValue({ id: "access-a" }) },
    inventoryPool: { findMany: vi.fn().mockResolvedValue([{ id: "pool-a" }]) },
    inventoryLot: { findMany: vi.fn().mockResolvedValue(lots) },
    itemUnit: { findMany: vi.fn().mockResolvedValue([]) },
    stockLedger: { findMany: vi.fn().mockResolvedValue(ledgers) },
    orderAllocation: {
      findMany: vi.fn().mockResolvedValue(overrides?.orderReservations ?? []),
    },
    fulfillmentInventoryAllocation: {
      findMany: vi.fn().mockResolvedValue(overrides?.fulfillmentReservations ?? []),
    },
    organizationConnection: {
      findMany: vi.fn().mockResolvedValue(overrides?.connections ?? []),
    },
    serviceAgreement: { findMany: vi.fn().mockResolvedValue(overrides?.agreements ?? []) },
    locationFulfiller: { findMany: vi.fn().mockResolvedValue(overrides?.fulfillers ?? []) },
  };
  return mocks as unknown as BundleFulfillmentPreviewClient;
}

describe("bundle fulfillment authorization preview", () => {
  it("reports only the actually duplicated Listing IDs and stops before database reads", async () => {
    const client = previewClient();
    const result = await previewBundleFulfillment(
      {
        storeId: "store-a",
        userId: "user-a",
        destinationMarket: "JP",
        lines: [
          { listingId: "listing-a", quantity: "1" },
          { listingId: "listing-a", quantity: "1" },
          { listingId: "listing-b", quantity: "1" },
        ],
        now,
      },
      client
    );

    expect(result.reasons).toContainEqual(
      expect.objectContaining({ code: "DUPLICATE_LISTING", listingIds: ["listing-a"] })
    );
    expect(client.listing.findMany).not.toHaveBeenCalled();
  });

  it("requires one currently effective agreement to cover service, warehouse and pool", () => {
    expect(
      agreementCoversBundleFulfillment(agreement(), {
        now,
        locationId: "warehouse-a",
        inventoryPoolId: "pool-a",
      })
    ).toBe(true);

    for (const invalid of [
      agreement({ status: "PAUSED" }),
      agreement({ effectiveFrom: new Date("2026-09-08T00:00:00.000Z") }),
      agreement({ effectiveTo: new Date("2026-09-06T23:59:59.000Z") }),
      agreement({ serviceTypes: ["RECEIVING"] }),
      agreement({ locationId: "warehouse-b" }),
      agreement({ inventoryPoolId: "pool-b" }),
    ]) {
      expect(
        agreementCoversBundleFulfillment(invalid, {
          now,
          locationId: "warehouse-a",
          inventoryPoolId: "pool-a",
        })
      ).toBe(false);
    }
  });

  it("does not combine two partial agreements into one fulfillment authorization", () => {
    const warehouseOnly = agreement({ inventoryPoolId: "pool-b" });
    const poolOnly = agreement({ locationId: "warehouse-b" });
    const target = { now, locationId: "warehouse-a", inventoryPoolId: "pool-a" };

    expect(
      [warehouseOnly, poolOnly].some((row) => agreementCoversBundleFulfillment(row, target))
    ).toBe(false);
  });

  it("aggregates same-SKU demand so two lines cannot count the same stock twice", () => {
    const inventory = snapshot({
      lotQuantityByLocationSku: new Map([["warehouse-a:sku-a", new Decimal(1)]]),
    });

    expect(
      canAllocateBundleAtLocation(
        [skuLine("listing-a", "1"), skuLine("listing-b", "1")],
        inventory,
        "warehouse-a"
      )
    ).toBe(false);
  });

  it("allows lot quantity plus whole generic ItemUnits, but not fractional ItemUnit use", () => {
    const inventory = snapshot({
      lotQuantityByLocationSku: new Map([["warehouse-a:sku-a", new Decimal("0.5")]]),
      itemIdsByLocationSku: new Map([["warehouse-a:sku-a", new Set(["item-a"])]]),
    });

    expect(
      canAllocateBundleAtLocation([skuLine("listing-a", "1.5")], inventory, "warehouse-a")
    ).toBe(true);
    expect(
      canAllocateBundleAtLocation(
        [skuLine("listing-a", "1")],
        snapshot({
          itemIdsByLocationSku: new Map([["warehouse-a:sku-a", new Set(["item-a"])]]),
        }),
        "warehouse-a"
      )
    ).toBe(true);
    expect(
      canAllocateBundleAtLocation(
        [skuLine("listing-a", "0.5")],
        snapshot({
          itemIdsByLocationSku: new Map([["warehouse-a:sku-a", new Set(["item-a"])]]),
        }),
        "warehouse-a"
      )
    ).toBe(false);
  });

  it("requires every exact ItemUnit listing to resolve to the same warehouse", () => {
    const exactLines = [
      skuLine("listing-a", "1", {
        listingType: "ITEM_UNIT",
        itemUnitId: "item-a",
      }),
      skuLine("listing-b", "1", {
        listingType: "ITEM_UNIT",
        itemUnitId: "item-b",
      }),
    ];
    const inventory = snapshot({
      exactItemLocationById: new Map([
        ["item-a", "warehouse-a"],
        ["item-b", "warehouse-b"],
      ]),
    });

    expect(canAllocateBundleAtLocation(exactLines, inventory, "warehouse-a")).toBe(false);
  });

  it("returns a common warehouse only from seller-owned, user-authorized pools", async () => {
    const result = await previewBundleFulfillment(
      {
        storeId: "store-a",
        userId: "user-a",
        destinationMarket: "JP",
        lines: [
          { listingId: "listing-a", quantity: "1" },
          { listingId: "listing-b", quantity: "1" },
        ],
        now,
      },
      previewClient()
    );

    expect(result.eligible).toBe(true);
    expect(result.commonLocationIds).toEqual(["warehouse-a"]);

    const unauthorizedPoolResult = await previewBundleFulfillment(
      {
        storeId: "store-a",
        userId: "user-a",
        destinationMarket: "JP",
        lines: [
          { listingId: "listing-a", quantity: "1" },
          { listingId: "listing-b", quantity: "1" },
        ],
        now,
      },
      previewClient({
        lots: [
          {
            id: "lot-a",
            skuId: "sku-a",
            inventoryPoolId: "pool-a",
            locationId: "warehouse-a",
            location: location(),
          },
          {
            id: "lot-b",
            skuId: "sku-b",
            inventoryPoolId: "partner-pool",
            locationId: "warehouse-a",
            location: location(),
          },
        ],
      })
    );

    expect(unauthorizedPoolResult.eligible).toBe(false);
    expect(unauthorizedPoolResult.commonLocationIds).toEqual([]);
  });

  it("requires connection, one effective pool/location agreement and a ship-capable fulfiller", async () => {
    const crossOrganizationOptions = {
      operatorOrganizationId: "warehouse-org",
      connections: [{ pairKey: "seller-org:warehouse-org" }],
      agreements: [
        {
          providerOrganizationId: "warehouse-org",
          ...agreement(),
        },
      ],
      fulfillers: [
        {
          organizationId: "warehouse-org",
          locationId: "warehouse-a",
          role: "OPERATOR",
        },
      ],
    };
    const input = {
      storeId: "store-a",
      userId: "user-a",
      destinationMarket: "JP",
      lines: [
        { listingId: "listing-a", quantity: "1" },
        { listingId: "listing-b", quantity: "1" },
      ],
      now,
    } as const;

    expect(
      (await previewBundleFulfillment(input, previewClient(crossOrganizationOptions))).eligible
    ).toBe(true);
    expect(
      (
        await previewBundleFulfillment(
          input,
          previewClient({ ...crossOrganizationOptions, connections: [] })
        )
      ).eligible
    ).toBe(false);
    expect(
      (
        await previewBundleFulfillment(
          input,
          previewClient({
            ...crossOrganizationOptions,
            agreements: [
              {
                providerOrganizationId: "warehouse-org",
                ...agreement({ effectiveTo: new Date("2026-09-06T23:59:59.000Z") }),
              },
            ],
          })
        )
      ).eligible
    ).toBe(false);
    expect(
      (
        await previewBundleFulfillment(
          input,
          previewClient({ ...crossOrganizationOptions, fulfillers: [] })
        )
      ).eligible
    ).toBe(false);
  });

  it("subtracts normal and fulfillment reservations before exposing a common warehouse", async () => {
    for (const reservedThrough of ["orderReservations", "fulfillmentReservations"] as const) {
      const result = await previewBundleFulfillment(
        {
          storeId: "store-a",
          userId: "user-a",
          destinationMarket: "JP",
          lines: [
            { listingId: "listing-a", quantity: "1" },
            { listingId: "listing-b", quantity: "1" },
          ],
          now,
        },
        previewClient({
          [reservedThrough]: [{ lotId: "lot-b", itemUnitId: null, quantity: new Decimal(1) }],
        })
      );

      expect(result.eligible).toBe(false);
      expect(result.commonLocationIds).toEqual([]);
    }
  });
});
