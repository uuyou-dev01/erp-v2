import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import {
  changeSupplyOfferStatusAction,
  createSupplyOfferAction,
  updateSupplyOfferChannelPolicyAction,
} from "@/app/actions/supply-offers";
import { changeResaleListingStatusAction, createResaleListingAction } from "@/app/actions/resale-listings";
import { createResaleOrderFulfillmentAction } from "@/app/actions/fulfillment-requests";
import { cancelCustomerOrder } from "@/app/actions/customer-orders";
import { getSkuStockBreakdown } from "@/lib/application/inventory";

const runId = `shared_offer_${Date.now()}`;
const email = `${runId}@example.com`;
let organizationId = "";
let storeId = "";
let offerId = "";
let skuId = "";
let firstListingId = "";
let secondListingId = "";

describe("supply offer shared inventory", () => {
  beforeAll(async () => {
    process.env.ERP_DEV_USER_EMAIL = email;
    const organization = await prisma.organization.create({
      data: { code: `ORG_${runId}`, name: "Shared Inventory Organization" },
    });
    organizationId = organization.id;
    const store = await prisma.store.create({
      data: { organizationId, code: `STORE_${runId}`, name: "Shared Inventory Store", currency: "JPY" },
    });
    storeId = store.id;
    const user = await prisma.user.create({
      data: { email, name: "Shared Inventory Owner", password: "test", role: "OWNER", storeId },
    });
    await prisma.membership.create({
      data: { organizationId, userId: user.id, role: "OWNER", status: "ACTIVE" },
    });
    await prisma.storeAccess.create({ data: { storeId, userId: user.id, role: "OWNER" } });
    const location = await prisma.location.create({
      data: { storeId, code: `WH_${runId}`, name: "Tokyo Shared Warehouse", type: "WAREHOUSE", region: "JP_TOKYO", isSellableDefault: true },
    });
    await prisma.locationCapability.create({
      data: { locationId: location.id, code: "DIRECT_FULFILLMENT" },
    });
    await prisma.shippingLane.create({
      data: {
        storeId,
        fromLocationId: location.id,
        laneType: "CUSTOMER_DELIVERY",
        destinationCountry: "JP",
      },
    });
    const sku = await prisma.sKU.create({
      data: { storeId, code: `SKU_${runId}`, name: "Shared Camera", imageUrl: "https://example.com/camera.jpg" },
    });
    skuId = sku.id;
    const lot = await prisma.inventoryLot.create({
      data: {
        storeId,
        skuId: sku.id,
        locationId: location.id,
        unitCost: "3000",
        costCurrency: "JPY",
        sourceType: "PURCHASE",
        sourceId: `PO_${runId}`,
        receivedAt: new Date(),
      },
    });
    await prisma.stockLedger.create({
      data: { storeId, entityType: "LOT", entityId: lot.id, locationId: location.id, deltaQty: "5", reason: "INBOUND_PURCHASE" },
    });
    const [firstPlatform, secondPlatform] = await Promise.all([
      prisma.platform.create({ data: { storeId, code: `A_${runId}`, name: "Sales Account A", country: "JP", defaultCurrency: "JPY" } }),
      prisma.platform.create({ data: { storeId, code: `B_${runId}`, name: "Sales Account B", country: "JP", defaultCurrency: "JPY" } }),
    ]);
    const channelAccounts = await prisma.salesChannelAccount.findMany({
      where: { legacyPlatformId: { in: [firstPlatform.id, secondPlatform.id] } },
      select: { id: true },
    });
    const offerResult = await createSupplyOfferAction({
      storeId,
      title: "Five cameras shared by many accounts",
      visibility: "PRIVATE",
      inventoryPolicy: "SHARED_POOL",
      unitPrice: "6000",
      currency: "JPY",
      agreementTerms: "货主收取供货价，代卖方保留供销差价。",
      salesChannelAccountIds: channelAccounts.map((channel) => channel.id),
      items: [{ skuId: sku.id, title: "Shared Camera", quantityAvailable: "5", unitPrice: "6000", currency: "JPY" }],
    });
    expect(offerResult.success).toBe(true);
    if (!offerResult.success) return;
    offerId = offerResult.id;
    expect((await changeSupplyOfferStatusAction(offerId, "PUBLISHED")).success).toBe(true);

    const first = await createResaleListingAction({ storeId, supplyOfferId: offerId, platformId: firstPlatform.id, title: "Camera A", targetPrice: "9000", quantityPlanned: "20" });
    const second = await createResaleListingAction({ storeId, supplyOfferId: offerId, platformId: secondPlatform.id, title: "Camera B", targetPrice: "9200", quantityPlanned: "20" });
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (!first.success || !second.success) return;
    firstListingId = first.id;
    secondListingId = second.id;
    expect((await changeResaleListingStatusAction(first.id, "ACTIVE")).success).toBe(true);
    expect((await changeResaleListingStatusAction(second.id, "ACTIVE")).success).toBe(true);
  });

  afterAll(async () => {
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    delete process.env.ERP_DEV_USER_EMAIL;
  });

  it("allows exposure on many accounts without reserving stock", async () => {
    const offer = await prisma.supplyOffer.findUniqueOrThrow({ where: { id: offerId } });
    const listings = await prisma.resaleListing.findMany({ where: { supplyOfferId: offerId } });
    const allocations = await prisma.fulfillmentInventoryAllocation.findMany({
      where: { fulfillmentRequest: { supplyOfferId: offerId }, status: "ALLOCATED" },
    });
    expect(listings).toHaveLength(2);
    expect(listings.every((listing) => listing.quantityPlanned.toString() === "20")).toBe(true);
    expect(offer.availableQty.toString()).toBe("5");
    expect(offer.reservedQty.toString()).toBe("0");
    expect(allocations).toHaveLength(0);
  });

  it("locks real stock on order, rejects oversell, and releases on cancellation", async () => {
    const firstOrder = await createResaleOrderFulfillmentAction({
      storeId,
      resaleListingId: firstListingId,
      quantity: "3",
      customerName: "Buyer A",
      shippingAddress: "Tokyo",
      shippingCountry: "JP",
    });
    expect(firstOrder.success).toBe(true);
    if (!firstOrder.success) return;

    const allocations = await prisma.fulfillmentInventoryAllocation.findMany({
      where: { fulfillmentRequestId: firstOrder.fulfillmentRequestId, status: "ALLOCATED" },
    });
    expect(allocations.reduce((sum, allocation) => sum + Number(allocation.quantity), 0)).toBe(3);

    const oversell = await createResaleOrderFulfillmentAction({
      storeId,
      resaleListingId: secondListingId,
      quantity: "3",
      customerName: "Buyer B",
      shippingAddress: "Osaka",
      shippingCountry: "JP",
    });
    expect(oversell.success).toBe(false);

    await cancelCustomerOrder(firstOrder.orderId, "buyer cancelled");
    const released = await prisma.fulfillmentInventoryAllocation.findMany({
      where: { fulfillmentRequestId: firstOrder.fulfillmentRequestId },
    });
    expect(released.every((allocation) => allocation.status === "RELEASED")).toBe(true);

    const retry = await createResaleOrderFulfillmentAction({
      storeId,
      resaleListingId: secondListingId,
      quantity: "3",
      customerName: "Buyer B",
      shippingAddress: "Osaka",
      shippingCountry: "JP",
    });
    expect(retry.success).toBe(true);
    if (retry.success) await cancelCustomerOrder(retry.orderId, "reset for quota scenario");
  });

  it("protects guaranteed quota while the remaining stock stays shared", async () => {
    const firstListing = await prisma.resaleListing.findUniqueOrThrow({
      where: { id: firstListingId },
      select: { supplyOfferChannelId: true },
    });
    expect(firstListing.supplyOfferChannelId).toBeTruthy();
    const quotaResult = await updateSupplyOfferChannelPolicyAction({
      channelId: firstListing.supplyOfferChannelId!,
      inventoryMode: "GUARANTEED",
      quotaQty: "2",
      status: "ACTIVE",
    });
    expect(quotaResult.success).toBe(true);

    const protectedStock = await getSkuStockBreakdown(storeId, skuId);
    expect(protectedStock.sellableQty).toBe(3);

    const guaranteedOrder = await createResaleOrderFulfillmentAction({
      storeId,
      resaleListingId: firstListingId,
      quantity: "2",
      customerName: "Guaranteed Buyer",
      shippingAddress: "Tokyo",
      shippingCountry: "JP",
    });
    expect(guaranteedOrder.success).toBe(true);
    if (!guaranteedOrder.success) return;

    const sharedOrder = await createResaleOrderFulfillmentAction({
      storeId,
      resaleListingId: secondListingId,
      quantity: "3",
      customerName: "Shared Buyer",
      shippingAddress: "Osaka",
      shippingCountry: "JP",
    });
    expect(sharedOrder.success).toBe(true);
    if (!sharedOrder.success) return;

    const soldOut = await createResaleOrderFulfillmentAction({
      storeId,
      resaleListingId: secondListingId,
      quantity: "1",
      customerName: "Late Buyer",
      shippingAddress: "Kyoto",
      shippingCountry: "JP",
    });
    expect(soldOut.success).toBe(false);

    await cancelCustomerOrder(guaranteedOrder.orderId, "quota release check");
    const channel = await prisma.supplyOfferChannel.findUniqueOrThrow({
      where: { id: firstListing.supplyOfferChannelId! },
    });
    expect(channel.quotaReservedQty.toString()).toBe("0");
    await cancelCustomerOrder(sharedOrder.orderId, "test cleanup");
  });

  it("binds a resale listing to one offer item so mixed-SKU offers cannot allocate the wrong product", async () => {
    const location = await prisma.location.findFirstOrThrow({ where: { storeId } });
    const secondSku = await prisma.sKU.create({
      data: { storeId, code: `SKU_B_${runId}`, name: "Shared Lens", imageUrl: "https://example.com/lens.jpg" },
    });
    const secondLot = await prisma.inventoryLot.create({
      data: {
        storeId,
        skuId: secondSku.id,
        locationId: location.id,
        unitCost: "1000",
        costCurrency: "JPY",
        sourceType: "PURCHASE",
        sourceId: `PO_B_${runId}`,
        receivedAt: new Date(),
      },
    });
    await prisma.stockLedger.create({
      data: { storeId, entityType: "LOT", entityId: secondLot.id, locationId: location.id, deltaQty: "2", reason: "INBOUND_PURCHASE" },
    });
    const mixedOffer = await createSupplyOfferAction({
      storeId,
      title: "Camera and lens mixed offer",
      visibility: "PRIVATE",
      currency: "JPY",
      agreementTerms: "货主收取供货价，代卖方保留供销差价。",
      items: [
        { skuId, title: "Shared Camera", quantityAvailable: "1", unitPrice: "6000", currency: "JPY" },
        { skuId: secondSku.id, title: "Shared Lens", quantityAvailable: "2", unitPrice: "3000", currency: "JPY" },
      ],
    });
    expect(mixedOffer.success).toBe(true);
    if (!mixedOffer.success) return;
    expect((await changeSupplyOfferStatusAction(mixedOffer.id, "PUBLISHED")).success).toBe(true);
    const items = await prisma.supplyOfferItem.findMany({ where: { offerId: mixedOffer.id } });
    const lensItem = items.find((item) => item.skuId === secondSku.id)!;
    const platformId = (await prisma.resaleListing.findUniqueOrThrow({ where: { id: secondListingId } })).platformId;

    const ambiguous = await createResaleListingAction({
      storeId,
      supplyOfferId: mixedOffer.id,
      platformId,
      title: "Ambiguous mixed listing",
      targetPrice: "5000",
    });
    expect(ambiguous.success).toBe(false);

    const lensListing = await createResaleListingAction({
      storeId,
      supplyOfferId: mixedOffer.id,
      supplyOfferItemId: lensItem.id,
      platformId,
      title: "Lens listing",
      targetPrice: "5000",
      quantityPlanned: "2",
    });
    expect(lensListing.success).toBe(true);
    if (!lensListing.success) return;
    expect((await changeResaleListingStatusAction(lensListing.id, "ACTIVE")).success).toBe(true);
    const sold = await createResaleOrderFulfillmentAction({
      storeId,
      resaleListingId: lensListing.id,
      quantity: "1",
      customerName: "Lens Buyer",
      shippingAddress: "Nagoya",
      shippingCountry: "JP",
    });
    expect(sold.success).toBe(true);
    if (!sold.success) return;
    const allocations = await prisma.fulfillmentInventoryAllocation.findMany({
      where: { fulfillmentRequestId: sold.fulfillmentRequestId, status: "ALLOCATED" },
    });
    expect(allocations).toHaveLength(1);
    expect(allocations[0].lotId).toBe(secondLot.id);
    await cancelCustomerOrder(sold.orderId, "test cleanup");
  });
});
