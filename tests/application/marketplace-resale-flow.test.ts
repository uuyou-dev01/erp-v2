import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
  }),
}));

import {
  changeSupplyOfferStatusAction,
  createSupplyOfferAction,
  getMarketplaceOffers,
} from "@/app/actions/supply-offers";
import {
  changeResaleListingStatusAction,
  createResaleListingAction,
} from "@/app/actions/resale-listings";
import {
  createResaleOrderFulfillmentAction,
  updateFulfillmentRequestStatusAction,
} from "@/app/actions/fulfillment-requests";
import {
  changeSettlementStatusAction,
  createSettlementFromFulfillmentAction,
} from "@/app/actions/settlements";
import { cancelCustomerOrder } from "@/app/actions/customer-orders";
import { getSettlementSummary } from "@/app/actions/reports";

const runId = `marketplace_resale_${Date.now()}`;
const userEmail = `${runId}@example.com`;
const organizationCode = `org_${runId}`;

let supplierStoreId = "";
let resellerStoreId = "";
let hiddenStoreId = "";
let platformId = "";
let offerId = "";
let resaleListingId = "";
let fulfillmentRequestId = "";
let settlementId = "";
let customerOrderId = "";
let testUserId = "";

describe("marketplace resale collaboration flow", () => {
  beforeAll(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T12:00:00.000Z"));
    process.env.ERP_DEV_USER_EMAIL = userEmail;

    const organization = await prisma.organization.create({
      data: {
        code: organizationCode,
        name: "Marketplace Resale Test Organization",
      },
    });

    const [supplierStore, resellerStore, hiddenStore] = await Promise.all([
      prisma.store.create({
        data: {
          organizationId: organization.id,
          code: `SUP_${runId}`,
          name: "Supplier Store",
          currency: "JPY",
        },
      }),
      prisma.store.create({
        data: {
          organizationId: organization.id,
          code: `RES_${runId}`,
          name: "Reseller Store",
          currency: "JPY",
        },
      }),
      prisma.store.create({
        data: {
          organizationId: organization.id,
          code: `HID_${runId}`,
          name: "Hidden Store",
          currency: "JPY",
        },
      }),
    ]);
    supplierStoreId = supplierStore.id;
    resellerStoreId = resellerStore.id;
    hiddenStoreId = hiddenStore.id;

    const user = await prisma.user.create({
      data: {
        email: userEmail,
        name: "Marketplace Resale Tester",
        password: "test",
        role: "OWNER",
        storeId: supplierStore.id,
      },
    });
    testUserId = user.id;

    await prisma.membership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    await prisma.storeAccess.createMany({
      data: [supplierStore, resellerStore, hiddenStore].map((store) => ({
        storeId: store.id,
        userId: user.id,
        role: "OWNER",
      })),
    });

    const partner = await prisma.partner.create({
      data: {
        storeId: supplierStore.id,
        code: `PARTNER_${runId}`,
        name: "Supplier Partner",
        defaultCurrency: "JPY",
      },
    });

    const platform = await prisma.platform.create({
      data: {
        storeId: resellerStore.id,
        code: `PLAT_${runId}`,
        name: "Resale Platform",
        country: "JP",
        defaultCurrency: "JPY",
        defaultFeeRate: "0.1000",
      },
    });
    platformId = platform.id;

    const fxEffectiveDate = new Date("2026-07-01T00:00:00.000Z");
    await prisma.fxRate.upsert({
      where: {
        fromCurrency_toCurrency_effectiveDate: {
          fromCurrency: "JPY",
          toCurrency: "CNY",
          effectiveDate: fxEffectiveDate,
        },
      },
      update: { rate: "0.05000000" },
      create: {
        fromCurrency: "JPY",
        toCurrency: "CNY",
        rate: "0.05000000",
        effectiveDate: fxEffectiveDate,
      },
    });

    const offerResult = await createSupplyOfferAction({
      storeId: supplierStore.id,
      title: "Authorized Camera Pallet",
      ownerPartnerId: partner.id,
      visibility: "PARTNER_ONLY",
      unitPrice: "6000",
      currency: "JPY",
      commissionRate: "0.2000",
      agreementTerms: "货主收取约定供货价，代卖方按成交额 20% 获取返佣。",
      fulfillmentMode: "SUPPLIER_SHIPS",
      viewerStoreIds: [resellerStore.id],
      items: [
        {
          title: "Vintage Camera",
          quantityAvailable: "2",
          unitPrice: "6000",
          currency: "JPY",
        },
      ],
    });
    expect(offerResult.success).toBe(true);
    if (offerResult.success) offerId = offerResult.id;

    const publishResult = await changeSupplyOfferStatusAction(offerId, "PUBLISHED");
    expect(publishResult.success).toBe(true);
  });

  afterAll(async () => {
    await prisma.store.deleteMany({
      where: { id: { in: [supplierStoreId, resellerStoreId, hiddenStoreId] } },
    });
    await prisma.organization.deleteMany({ where: { code: organizationCode } });
    delete process.env.ERP_DEV_USER_EMAIL;
    vi.useRealTimers();
  });

  it("shows partner-only offers only to authorized stores", async () => {
    const resellerOffers = await getMarketplaceOffers(resellerStoreId);
    const hiddenOffers = await getMarketplaceOffers(hiddenStoreId);

    expect(resellerOffers.map((offer) => offer.id)).toContain(offerId);
    expect(hiddenOffers.map((offer) => offer.id)).not.toContain(offerId);
  });

  it("rejects publishing a supply offer item with a catalog group sku", async () => {
    const group = await prisma.sKU.create({
      data: {
        storeId: supplierStoreId,
        code: `GROUP_${runId}_OFFER`,
        name: "Offer Catalog Group",
        catalogRole: "GROUP",
      },
    });

    const result = await createSupplyOfferAction({
      storeId: supplierStoreId,
      title: "Invalid Group Offer",
      visibility: "PRIVATE",
      agreementTerms: "测试商品组不可发布。",
      currency: "JPY",
      items: [
        {
          skuId: group.id,
          title: "Group should not be sellable",
          quantityAvailable: "1",
          unitPrice: "1000",
          currency: "JPY",
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("商品组只用于管理规格");
    }

    const invalidOffer = await prisma.supplyOffer.findFirst({
      where: {
        storeId: supplierStoreId,
        title: "Invalid Group Offer",
      },
    });
    expect(invalidOffer).toBeNull();
  });

  it("creates resale, reserves fulfillment quantity, ships, and settles", async () => {
    const resaleResult = await createResaleListingAction({
      storeId: resellerStoreId,
      supplyOfferId: offerId,
      platformId,
      title: "Resale Vintage Camera",
      targetPrice: "10000",
      currency: "JPY",
      quantityPlanned: "1",
      supplyUnitPrice: "6000",
      supplyCurrency: "JPY",
      commissionRate: "0.2000",
      platformFeeRate: "0.1000",
      fulfillmentMode: "SUPPLIER_SHIPS",
    });
    expect(resaleResult.success).toBe(true);
    if (resaleResult.success) resaleListingId = resaleResult.id;

    const activateResult = await changeResaleListingStatusAction(resaleListingId, "ACTIVE");
    expect(activateResult.success).toBe(true);

    const fulfillmentResult = await createResaleOrderFulfillmentAction({
      storeId: resellerStoreId,
      resaleListingId,
      quantity: "1",
      customerName: "Test Buyer",
      customerPhone: "09000000000",
      externalOrderNo: `EXT_${runId}`,
      shippingAddress: "Tokyo Test Address",
      shippingCountry: "JP",
    });
    expect(fulfillmentResult.success).toBe(true);
    if (fulfillmentResult.success) {
      fulfillmentRequestId = fulfillmentResult.fulfillmentRequestId;
      customerOrderId = fulfillmentResult.orderId;
    }

    const createdOrder = await prisma.customerOrder.findUniqueOrThrow({
      where: { id: customerOrderId },
    });
    expect(createdOrder.orderStatus).toBe("CONFIRMED");
    expect(createdOrder.resaleListingId).toBe(resaleListingId);
    expect(createdOrder.shippingCountry).toBe("JP");

    await expect(
      prisma.supplyOffer.findUniqueOrThrow({ where: { id: offerId } })
    ).resolves.toMatchObject({
      availableQty: expect.objectContaining({}),
      reservedQty: expect.objectContaining({}),
    });
    const reservedOffer = await prisma.supplyOffer.findUniqueOrThrow({ where: { id: offerId } });
    expect(reservedOffer.availableQty.toString()).toBe("2");
    expect(reservedOffer.reservedQty.toString()).toBe("1");

    const shipResult = await updateFulfillmentRequestStatusAction(fulfillmentRequestId, "SHIPPED", {
      carrier: "Yamato",
      trackingNo: `TRACK_${runId}`,
      shippingFee: "800",
      shippingCurrency: "JPY",
    });
    expect(shipResult.success).toBe(true);
    if (shipResult.success) {
      expect(shipResult.settlement).toMatchObject({ status: "CREATED" });
      settlementId = shipResult.settlement?.id ?? "";
    }

    const createdSettlement = await prisma.settlement.findUniqueOrThrow({
      where: { id: settlementId },
    });
    expect(createdSettlement.customerOrderId).toBe(customerOrderId);

    const shippedOrder = await prisma.customerOrder.findUniqueOrThrow({
      where: { id: customerOrderId },
    });
    expect(shippedOrder.orderStatus).toBe("SHIPPED");
    expect(shippedOrder.trackingNo).toBe(`TRACK_${runId}`);

    const shippedOffer = await prisma.supplyOffer.findUniqueOrThrow({ where: { id: offerId } });
    expect(shippedOffer.availableQty.toString()).toBe("1");
    expect(shippedOffer.reservedQty.toString()).toBe("0");

    const pendingEarning = await prisma.earningEvent.findFirstOrThrow({
      where: {
        storeId: resellerStoreId,
        userId: testUserId,
        sourceType: "SETTLEMENT",
        sourceId: settlementId,
        earningType: "RESALE_COMMISSION",
      },
    });
    expect(pendingEarning.status).toBe("PENDING");
    expect(pendingEarning.earningAmount.toString()).toBe("100");

    const settlementResult = await createSettlementFromFulfillmentAction(fulfillmentRequestId, resellerStoreId);
    expect(settlementResult.success).toBe(true);
    if (settlementResult.success) {
      expect(settlementResult.created).toBe(false);
      expect(settlementResult.id).toBe(settlementId);
    }

    const settlement = await prisma.settlement.findUniqueOrThrow({
      where: { id: settlementId },
      include: { lines: true },
    });
    // Every line is converted before aggregation. The settlement header is the
    // base-currency net amount, not a sum of mixed-currency source numbers.
    expect(settlement.totalAmount.toString()).toBe("240");
    expect(settlement.baseCurrency).toBe("CNY");
    expect(settlement.currency).toBe("CNY");
    expect(settlement.fxRate?.toString()).toBe("1");
    expect(settlement.baseAmount?.toString()).toBe("240");
    expect(settlement.lines.map((line) => line.lineType).sort()).toEqual([
      "COMMISSION",
      "PLATFORM_FEE",
      "SHIPPING_FEE",
      "SUPPLY_COST",
    ]);
    expect(settlement.lines.every((line) => line.baseCurrency === "CNY")).toBe(true);
    expect(settlement.lines.every((line) => line.fxRate?.toString() === "0.05")).toBe(true);

    const pendingSettlementSummary = await getSettlementSummary(resellerStoreId);
    expect(pendingSettlementSummary.baseCurrency).toBe("CNY");
    expect(pendingSettlementSummary.pendingPayable).toBe("340.00");
    expect(pendingSettlementSummary.pendingReceivable).toBe("100.00");
    expect(pendingSettlementSummary.pendingNetPayable).toBe("240.00");
    expect(pendingSettlementSummary.pendingCount).toBe(1);

    const confirmResult = await changeSettlementStatusAction(settlementId, "CONFIRMED");
    expect(confirmResult.success).toBe(true);
    const paidResult = await changeSettlementStatusAction(settlementId, "PAID");
    expect(paidResult.success).toBe(true);

    const earning = await prisma.earningEvent.findFirstOrThrow({
      where: {
        storeId: resellerStoreId,
        userId: testUserId,
        sourceType: "SETTLEMENT",
        sourceId: settlementId,
        earningType: "RESALE_COMMISSION",
      },
      include: { ledgerEntries: true, walletAccount: true },
    });
    expect(earning.status).toBe("SETTLED");
    expect(earning.earningAmount.toString()).toBe("100");
    expect(earning.currency).toBe("CNY");
    expect(earning.walletAccount?.ownerId).toBe(testUserId);
    expect(earning.ledgerEntries).toHaveLength(1);
    expect(earning.ledgerEntries[0]).toMatchObject({
      entryType: "CREDIT",
      currency: "CNY",
      status: "POSTED",
    });
    expect(earning.ledgerEntries[0].amount.toString()).toBe("100");

    const duplicatePaidResult = await changeSettlementStatusAction(settlementId, "PAID");
    expect(duplicatePaidResult.success).toBe(false);
    expect(
      await prisma.walletLedgerEntry.count({
        where: { earningEventId: earning.id },
      }),
    ).toBe(1);

    const paidSettlementSummary = await getSettlementSummary(resellerStoreId);
    expect(paidSettlementSummary.pendingNetPayable).toBe("0.00");
    expect(paidSettlementSummary.paidNetPayable).toBe("240.00");
    expect(paidSettlementSummary.paidCount).toBe(1);
  });

  it("cancels unshipped resale orders and releases fulfillment reservations", async () => {
    const resaleResult = await createResaleListingAction({
      storeId: resellerStoreId,
      supplyOfferId: offerId,
      platformId,
      title: "Cancelable Resale Camera",
      targetPrice: "10000",
      currency: "JPY",
      quantityPlanned: "1",
      supplyUnitPrice: "6000",
      supplyCurrency: "JPY",
      commissionRate: "0.2000",
      platformFeeRate: "0.1000",
      fulfillmentMode: "SUPPLIER_SHIPS",
    });
    expect(resaleResult.success).toBe(true);
    if (!resaleResult.success) return;

    const activateResult = await changeResaleListingStatusAction(resaleResult.id, "ACTIVE");
    expect(activateResult.success).toBe(true);

    const fulfillmentResult = await createResaleOrderFulfillmentAction({
      storeId: resellerStoreId,
      resaleListingId: resaleResult.id,
      quantity: "1",
      customerName: "Cancel Buyer",
      shippingAddress: "Osaka Test Address",
      shippingCountry: "JP",
    });
    expect(fulfillmentResult.success).toBe(true);
    if (!fulfillmentResult.success) return;

    const reservedOffer = await prisma.supplyOffer.findUniqueOrThrow({ where: { id: offerId } });
    expect(reservedOffer.availableQty.toString()).toBe("1");
    expect(reservedOffer.reservedQty.toString()).toBe("1");

    await cancelCustomerOrder(fulfillmentResult.orderId, "buyer cancelled");

    const releasedOffer = await prisma.supplyOffer.findUniqueOrThrow({ where: { id: offerId } });
    expect(releasedOffer.availableQty.toString()).toBe("1");
    expect(releasedOffer.reservedQty.toString()).toBe("0");

    const cancelledRequest = await prisma.fulfillmentRequest.findUniqueOrThrow({
      where: { id: fulfillmentResult.fulfillmentRequestId },
      include: { reservation: true },
    });
    expect(cancelledRequest.status).toBe("CANCELLED");
    expect(cancelledRequest.reservation?.status).toBe("RELEASED");

    const resaleListing = await prisma.resaleListing.findUniqueOrThrow({ where: { id: resaleResult.id } });
    expect(resaleListing.quantitySold.toString()).toBe("0");
  });
});
