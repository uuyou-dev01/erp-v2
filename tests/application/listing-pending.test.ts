import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getListingPendingItems } from "@/lib/application/listing-pending";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
  }),
}));

import {
  batchCreateListings,
  createListing,
  delistListingAction,
  updateListingAction,
} from "@/app/actions/listings";

const runId = `listing_pending_${Date.now()}`;
const organizationCode = `org_${runId}`;
const storeId = `store_${runId}`;
const userEmail = `${runId}@example.com`;

let sellableLocationId = "";
let transitLocationId = "";
let mercariPlatformId = "";

describe("listing pending platform eligibility", () => {
  beforeAll(async () => {
    process.env.ERP_DEV_USER_EMAIL = userEmail;

    const organization = await prisma.organization.create({
      data: {
        code: organizationCode,
        name: "Listing Pending Test Organization",
      },
    });

    await prisma.store.create({
      data: {
        id: storeId,
        organizationId: organization.id,
        code: `STORE_${runId}`,
        name: "Listing Pending Test Store",
        currency: "CNY",
      },
    });

    const user = await prisma.user.create({
      data: {
        email: userEmail,
        name: "Listing Pending Tester",
        password: "test",
        role: "OWNER",
        storeId,
      },
    });

    await prisma.membership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    await prisma.storeAccess.create({
      data: {
        storeId,
        userId: user.id,
        role: "OWNER",
      },
    });

    const sellableLocation = await prisma.location.create({
      data: {
        storeId,
        code: `JP_${runId}`,
        name: "Japan Ready Warehouse",
        type: "WAREHOUSE",
        region: "JP_TOKYO",
        isSellableDefault: true,
      },
    });
    sellableLocationId = sellableLocation.id;

    const transitLocation = await prisma.location.create({
      data: {
        storeId,
        code: `CN_${runId}`,
        name: "China Transit Warehouse",
        type: "FORWARDER",
        region: "CN_SHANGHAI",
        isSellableDefault: false,
      },
    });
    transitLocationId = transitLocation.id;

    const mercari = await prisma.platform.create({
      data: platformData("MERCARI", "Mercari", "JP"),
    });
    mercariPlatformId = mercari.id;
    await prisma.platform.create({ data: platformData("YAHOO_AUCTION", "Yahoo Auction", "JP") });
    await prisma.platform.create({ data: platformData("SNKRDUNK", "SNKRDUNK", "JP") });
    await prisma.platform.create({ data: platformData("XIAN_YU", "Xianyu", "CN") });
  });

  afterAll(async () => {
    const organization = await prisma.organization.findUnique({
      where: { code: organizationCode },
      select: { id: true },
    });
    if (organization) {
      await prisma.task.deleteMany({ where: { organizationId: organization.id } });
    }
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.user.deleteMany({ where: { email: userEmail } });
    await prisma.organization.deleteMany({ where: { code: organizationCode } });
    delete process.env.ERP_DEV_USER_EMAIL;
  });

  it("does not offer fulfillment-strict platforms when stock is only in transit", async () => {
    const sku = await createLotStock("TRANSIT_ONLY", transitLocationId, "2");

    const items = await getListingPendingItems(storeId);
    const item = items.find((entry) => entry.skuId === sku.id);

    expect(item).toBeDefined();
    expect(item?.sellableQty).toBe(0);
    expect(item?.inTransitQty).toBe(2);
    expect(platformCodes(item)).toEqual(["XIAN_YU"]);
  });

  it("offers fulfillment-strict platforms when sellable stock is available", async () => {
    const sku = await createLotStock("SELLABLE", sellableLocationId, "2");

    const items = await getListingPendingItems(storeId);
    const item = items.find((entry) => entry.skuId === sku.id);

    expect(platformCodes(item)).toEqual([
      "MERCARI",
      "YAHOO_AUCTION",
      "SNKRDUNK",
      "XIAN_YU",
    ]);
  });

  it("blocks creating a fulfillment-strict listing when the SKU has no sellable stock", async () => {
    const sku = await createLotStock("CREATE_TRANSIT_ONLY", transitLocationId, "1");

    const result = await createListing({
        storeId,
        platformId: mercariPlatformId,
        listingType: "SKU",
        skuId: sku.id,
        listedPrice: "180",
        currency: "JPY",
      });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("可售库存");
    }
  });

  it("blocks bulk fulfillment-strict listings as an all-or-nothing preflight", async () => {
    const sellableSku = await createLotStock("BATCH_SELLABLE", sellableLocationId, "1");
    const transitSku = await createLotStock("BATCH_TRANSIT_ONLY", transitLocationId, "1");

    const result = await batchCreateListings({
        storeId,
        platformId: mercariPlatformId,
        skuIds: [sellableSku.id, transitSku.id],
        listedPrice: "180",
        currency: "JPY",
      });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("可售库存");
    }

    const listings = await prisma.listing.findMany({
      where: {
        platformId: mercariPlatformId,
        skuId: { in: [sellableSku.id, transitSku.id] },
      },
    });
    expect(listings).toHaveLength(0);
  });

  it("returns a structured failure when updating a missing listing", async () => {
    const result = await updateListingAction(`missing_listing_${runId}`, {
      listedPrice: "180",
      currency: "JPY",
      status: "ACTIVE",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("上架记录不存在");
    }
  });

  it("returns a structured failure when delisting a missing listing", async () => {
    const result = await delistListingAction(`missing_delist_${runId}`);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("上架记录不存在");
    }
  });
});

function platformData(code: string, name: string, country: string) {
  return {
    storeId,
    code,
    name,
    country,
    defaultCurrency: country === "JP" ? "JPY" : "CNY",
  };
}

async function createLotStock(
  suffix: string,
  locationId: string,
  quantity: string,
) {
  const sku = await prisma.sKU.create({
    data: {
      storeId,
      code: `SKU_${runId}_${suffix}`,
      name: `Listing Pending ${suffix}`,
    },
  });

  const lot = await prisma.inventoryLot.create({
    data: {
      storeId,
      skuId: sku.id,
      locationId,
      unitCost: "100",
      costCurrency: "CNY",
      sourceType: "TEST",
      sourceId: `${runId}_${suffix}`,
      receivedAt: new Date("2026-06-22T08:00:00.000Z"),
    },
  });

  await prisma.stockLedger.create({
    data: {
      storeId,
      entityType: "LOT",
      entityId: lot.id,
      locationId,
      deltaQty: quantity,
      reason: "INBOUND_PURCHASE",
      refType: "TEST",
      refId: `${runId}_${suffix}`,
    },
  });

  return sku;
}

function platformCodes(item: Awaited<ReturnType<typeof getListingPendingItems>>[number] | undefined) {
  return item?.availablePlatforms.map((platform) => platform.code) ?? [];
}
