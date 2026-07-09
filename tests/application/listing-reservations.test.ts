import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Decimal from "decimal.js";
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
  batchCreateListings,
  createListing,
  quickSellListing,
  updateListingAction,
} from "@/app/actions/listings";
import {
  createPlatformAction,
  updatePlatformAction,
} from "@/app/actions/platforms";
import {
  cancelCustomerOrder,
  markOrderReturned,
  markOrderShipped,
} from "@/app/actions/customer-orders";

const runId = `reservation_${Date.now()}`;
const organizationCode = `org_${runId}`;
const storeId = `store_${runId}`;
const userEmail = `${runId}@example.com`;

let locationId = "";
let platformId = "";

describe("listing quick sell reservations", () => {
  beforeAll(async () => {
    process.env.ERP_DEV_USER_EMAIL = userEmail;

    const organization = await prisma.organization.create({
      data: {
        code: organizationCode,
        name: "Reservation Test Organization",
      },
    });

    const store = await prisma.store.create({
      data: {
        id: storeId,
        organizationId: organization.id,
        code: `STORE_${runId}`,
        name: "Reservation Test Store",
        currency: "CNY",
      },
    });

    const user = await prisma.user.create({
      data: {
        email: userEmail,
        name: "Reservation Tester",
        password: "test",
        role: "OWNER",
        storeId: store.id,
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
        storeId: store.id,
        userId: user.id,
        role: "OWNER",
      },
    });

    const location = await prisma.location.create({
      data: {
        storeId: store.id,
        code: `WH_${runId}`,
        name: "Reservation Warehouse",
        type: "WAREHOUSE",
        region: "CN_SHANGHAI",
      },
    });
    locationId = location.id;

    const platform = await prisma.platform.create({
      data: {
        storeId: store.id,
        code: `PLAT_${runId}`,
        name: "Reservation Platform",
        country: "CN",
        defaultCurrency: "CNY",
        defaultFeeRate: "0.1000",
      },
    });
    platformId = platform.id;

  });

  afterAll(async () => {
    const organization = await prisma.organization.findUnique({
      where: { code: organizationCode },
      select: { id: true },
    });
    if (organization) {
      await prisma.notification.deleteMany({
        where: { organizationId: organization.id },
      });
      await prisma.activityLog.deleteMany({
        where: { organizationId: organization.id },
      });
      await prisma.task.deleteMany({
        where: { organizationId: organization.id },
      });
    }
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.organization.deleteMany({ where: { code: organizationCode } });
    delete process.env.ERP_DEV_USER_EMAIL;
  });

  it("prevents a second quick sale from using stock already reserved by an unshipped order", async () => {
    const { listing, lotId } = await createSellableListing("double_sell");

    const firstSale = await quickSellListing({
      listingId: listing.id,
      quantity: "1",
      unitPrice: "180",
      shipFromLocationId: locationId,
      externalOrderNo: `SO_${runId}_1`,
    });

    expect(firstSale.success).toBe(true);
    await expectLotQuantity(lotId, "1");

    const secondSale = await quickSellListing({
      listingId: listing.id,
      quantity: "1",
      unitPrice: "180",
      shipFromLocationId: locationId,
      externalOrderNo: `SO_${runId}_2`,
    });

    expect(secondSale.success).toBe(false);
    if (!secondSale.success) {
      expect(secondSale.error).toContain("库存不足");
    }

    const allocations = await prisma.orderAllocation.findMany({
      where: { lotId },
    });
    expect(allocations).toHaveLength(1);
  });

  it("rejects a negative quick-sale unit price without reserving stock", async () => {
    const { listing, lotId } = await createSellableListing("negative_price");
    const externalOrderNo = `SO_${runId}_negative_price`;

    const sale = await quickSellListing({
      listingId: listing.id,
      quantity: "1",
      unitPrice: "-180",
      shipFromLocationId: locationId,
      externalOrderNo,
    });

    expect(sale.success).toBe(false);
    if (!sale.success) {
      expect(sale.error).toContain("售出单价必须大于 0");
    }

    await expectLotQuantity(lotId, "1");
    const order = await prisma.customerOrder.findFirst({
      where: { externalOrderNo },
    });
    expect(order).toBeNull();
    const allocations = await prisma.orderAllocation.findMany({
      where: { lotId },
    });
    expect(allocations).toHaveLength(0);
  });

  it("rejects a negative listing price without creating a listing", async () => {
    const sku = await createSku("negative_listing_price");

    const result = await createListing({
      storeId,
      platformId,
      listingType: "SKU",
      skuId: sku.id,
      listedPrice: "-180",
      currency: "CNY",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Listing 价格必须大于 0");
    }

    const listing = await prisma.listing.findFirst({
      where: { skuId: sku.id, platformId },
    });
    expect(listing).toBeNull();
  });

  it("rejects duplicate active listings for the same platform target", async () => {
    const { sku } = await createSellableListing("duplicate_sku_listing");

    const duplicateSku = await createListing({
      storeId,
      platformId,
      listingType: "SKU",
      skuId: sku.id,
      listedPrice: "188",
      currency: "CNY",
    });

    expect(duplicateSku.success).toBe(false);
    if (!duplicateSku.success) {
      expect(duplicateSku.error).toContain("已在");
    }

    const duplicateBatch = await batchCreateListings({
      storeId,
      platformId,
      skuIds: [sku.id],
      listedPrice: "188",
      currency: "CNY",
    });
    expect(duplicateBatch.success).toBe(false);
    if (!duplicateBatch.success) {
      expect(duplicateBatch.error).toContain("上架");
    }

    const itemSku = await createSku("duplicate_item_unit_listing");
    const itemUnit = await prisma.itemUnit.create({
      data: {
        storeId,
        skuId: itemSku.id,
        locationId,
        unitCost: "100",
        costCurrency: "CNY",
        sourceType: "E2E",
        sourceId: `${runId}_duplicate_item_unit_listing`,
        conditionGrade: "C",
      },
    });

    const firstItemListing = await createListing({
      storeId,
      platformId,
      listingType: "ITEM_UNIT",
      skuId: itemSku.id,
      itemUnitId: itemUnit.id,
      listedPrice: "188",
      currency: "CNY",
    });
    expect(firstItemListing.success).toBe(true);

    const duplicateItemListing = await createListing({
      storeId,
      platformId,
      listingType: "ITEM_UNIT",
      skuId: itemSku.id,
      itemUnitId: itemUnit.id,
      listedPrice: "198",
      currency: "CNY",
    });

    expect(duplicateItemListing.success).toBe(false);
    if (!duplicateItemListing.success) {
      expect(duplicateItemListing.error).toContain("已在");
    }

    const listings = await prisma.listing.findMany({
      where: {
        storeId,
        platformId,
        OR: [{ skuId: sku.id }, { itemUnitId: itemUnit.id }],
      },
    });
    expect(listings).toHaveLength(2);
  });

  it("rejects a negative batch listing price without creating listings", async () => {
    const sku = await createSku("negative_batch_listing_price");

    const result = await batchCreateListings({
      storeId,
      platformId,
      skuIds: [sku.id],
      listedPrice: "-180",
      currency: "CNY",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Listing 价格必须大于 0");
    }

    const listings = await prisma.listing.findMany({
      where: { skuId: sku.id, platformId },
    });
    expect(listings).toHaveLength(0);
  });

  it("rejects creating listings directly for a parent SKU with variants", async () => {
    const parent = await createSku("parent_listing");
    await prisma.sKU.create({
      data: {
        storeId,
        code: `SKU_${runId}_parent_listing_child`,
        name: "Reservation Product parent listing child",
        parentSkuId: parent.id,
      },
    });

    const singleResult = await createListing({
      storeId,
      platformId,
      listingType: "SKU",
      skuId: parent.id,
      listedPrice: "180",
      currency: "CNY",
    });
    expect(singleResult.success).toBe(false);
    if (!singleResult.success) {
      expect(singleResult.error).toContain("商品组只用于管理规格");
    }

    const batchResult = await batchCreateListings({
      storeId,
      platformId,
      skuIds: [parent.id],
      listedPrice: "180",
      currency: "CNY",
    });
    expect(batchResult.success).toBe(false);
    if (!batchResult.success) {
      expect(batchResult.error).toContain("商品组只用于管理规格");
    }

    const listings = await prisma.listing.findMany({
      where: { skuId: parent.id, platformId },
    });
    expect(listings).toHaveLength(0);
  });

  it("rejects listing fee inputs that would distort estimated net revenue", async () => {
    const negativeFeeSku = await createSku("negative_listing_fee_rate");
    const negativeFeeResult = await createListing({
      storeId,
      platformId,
      listingType: "SKU",
      skuId: negativeFeeSku.id,
      listedPrice: "180",
      currency: "CNY",
      feeRateOverride: "-0.1",
    });

    expect(negativeFeeResult.success).toBe(false);
    if (!negativeFeeResult.success) {
      expect(negativeFeeResult.error).toContain("平台费率不能为负数");
    }

    const excessiveFeeSku = await createSku("excessive_listing_fee_rate");
    const excessiveFeeResult = await createListing({
      storeId,
      platformId,
      listingType: "SKU",
      skuId: excessiveFeeSku.id,
      listedPrice: "180",
      currency: "CNY",
      feeRateOverride: "1.5",
    });

    expect(excessiveFeeResult.success).toBe(false);
    if (!excessiveFeeResult.success) {
      expect(excessiveFeeResult.error).toContain("平台费率不能大于 1");
    }

    const negativeShippingSku = await createSku("negative_listing_shipping");
    const negativeShippingResult = await createListing({
      storeId,
      platformId,
      listingType: "SKU",
      skuId: negativeShippingSku.id,
      listedPrice: "180",
      currency: "CNY",
      shippingFeeOverride: "-12",
    });

    expect(negativeShippingResult.success).toBe(false);
    if (!negativeShippingResult.success) {
      expect(negativeShippingResult.error).toContain("运费不能为负数");
    }

    const listings = await prisma.listing.findMany({
      where: {
        skuId: {
          in: [negativeFeeSku.id, excessiveFeeSku.id, negativeShippingSku.id],
        },
      },
    });
    expect(listings).toHaveLength(0);
  });

  it("rejects invalid platform default fee inputs without creating a platform", async () => {
    const negativeFeeCode = `NEG_FEE_${runId}`;
    const negativeFeeResult = await createPlatformAction({
      storeId,
      code: negativeFeeCode,
      name: "Negative Fee Platform",
      country: "CN",
      defaultCurrency: "CNY",
      defaultFeeRate: "-0.1",
    });

    expect(negativeFeeResult.success).toBe(false);
    if (!negativeFeeResult.success) {
      expect(negativeFeeResult.error).toContain("默认平台费率不能为负数");
    }

    const excessiveFeeCode = `HIGH_FEE_${runId}`;
    const excessiveFeeResult = await createPlatformAction({
      storeId,
      code: excessiveFeeCode,
      name: "Excessive Fee Platform",
      country: "CN",
      defaultCurrency: "CNY",
      defaultFeeRate: "1.5",
    });

    expect(excessiveFeeResult.success).toBe(false);
    if (!excessiveFeeResult.success) {
      expect(excessiveFeeResult.error).toContain("默认平台费率不能大于 1");
    }

    const negativeShippingCode = `NEG_SHIP_${runId}`;
    const negativeShippingResult = await createPlatformAction({
      storeId,
      code: negativeShippingCode,
      name: "Negative Shipping Platform",
      country: "CN",
      defaultCurrency: "CNY",
      defaultShippingFee: "-12",
    });

    expect(negativeShippingResult.success).toBe(false);
    if (!negativeShippingResult.success) {
      expect(negativeShippingResult.error).toContain("默认运费不能为负数");
    }

    const platforms = await prisma.platform.findMany({
      where: {
        storeId,
        code: { in: [negativeFeeCode, excessiveFeeCode, negativeShippingCode] },
      },
    });
    expect(platforms).toHaveLength(0);
  });

  it("rejects invalid platform default fee edits without mutating the platform", async () => {
    const code = `EDIT_FEE_${runId}`;
    const created = await createPlatformAction({
      storeId,
      code,
      name: "Editable Fee Platform",
      country: "CN",
      defaultCurrency: "CNY",
      defaultFeeRate: "0.1",
      defaultShippingFee: "12",
    });
    expect(created.success).toBe(true);
    if (!created.success) throw new Error(created.error);

    const result = await updatePlatformAction(created.id, {
      code,
      name: "Editable Fee Platform",
      country: "CN",
      defaultCurrency: "CNY",
      defaultFeeRate: "1.5",
      defaultShippingFee: "-12",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("默认平台费率不能大于 1");
    }

    const unchanged = await prisma.platform.findUniqueOrThrow({
      where: { id: created.id },
      select: { defaultFeeRate: true, defaultShippingFee: true },
    });
    expect(unchanged.defaultFeeRate?.toString()).toBe("0.1");
    expect(unchanged.defaultShippingFee?.toString()).toBe("12");
  });

  it("rejects a negative listing edit price without changing the listing", async () => {
    const { listing } = await createSellableListing("negative_edit_price");

    const result = await updateListingAction(listing.id, {
      listedPrice: "-99",
      currency: "CNY",
      status: "ACTIVE",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Listing 价格必须大于 0");
    }

    const unchanged = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
      select: { listedPrice: true, status: true },
    });
    expect(unchanged.listedPrice?.toString()).toBe("180");
    expect(unchanged.status).toBe("ACTIVE");
  });

  it("releases reserved stock when an unshipped order is cancelled", async () => {
    const { listing, lotId } = await createSellableListing("cancel_release");

    const sale = await quickSellListing({
      listingId: listing.id,
      quantity: "1",
      unitPrice: "180",
      shipFromLocationId: locationId,
      externalOrderNo: `SO_${runId}_cancel_1`,
    });
    expect(sale.success).toBe(true);
    if (!sale.success) throw new Error(sale.error);

    await cancelCustomerOrder(sale.orderId, "buyer cancelled");
    await expectLotQuantity(lotId, "1");

    const releasedSale = await quickSellListing({
      listingId: listing.id,
      quantity: "1",
      unitPrice: "180",
      shipFromLocationId: locationId,
      externalOrderNo: `SO_${runId}_cancel_2`,
    });

    expect(releasedSale.success).toBe(true);
    const allocationStatuses = await prisma.orderAllocation.findMany({
      where: { lotId },
      orderBy: { createdAt: "asc" },
      select: { status: true },
    });
    expect(allocationStatuses.map((allocation) => allocation.status)).toEqual([
      "CANCELLED",
      "PENDING",
    ]);
  });

  it("restores lot quantity when a shipped order is returned", async () => {
    const { listing, lotId } = await createSellableListing("return_restore");

    const sale = await quickSellListing({
      listingId: listing.id,
      quantity: "1",
      unitPrice: "180",
      shipFromLocationId: locationId,
      externalOrderNo: `SO_${runId}_return`,
    });
    expect(sale.success).toBe(true);
    if (!sale.success) throw new Error(sale.error);

    await markOrderShipped(sale.orderId, { trackingNo: `TRK_${runId}` });
    await expectLotQuantity(lotId, "0");

    await markOrderReturned(sale.orderId, {
      note: "buyer returned",
      returnTrackingNo: `RET_${runId}`,
      refundAmount: "180",
      platformFeeReversal: "18",
    });

    await expectLotQuantity(lotId, "1");
    const order = await prisma.customerOrder.findUniqueOrThrow({
      where: { id: sale.orderId },
      include: { lines: { include: { allocations: true } } },
    });
    expect(order.orderStatus).toBe("RETURNED");
    expect(order.lines[0].supplyStatus).toBe("RETURNED");
    expect(order.lines[0].allocations[0].status).toBe("RETURNED");
  });
});

async function createSku(suffix: string) {
  return await prisma.sKU.create({
    data: {
      storeId,
      code: `SKU_${runId}_${suffix}`,
      name: `Reservation Product ${suffix}`,
    },
  });
}

async function createSellableListing(suffix: string) {
  const sku = await createSku(suffix);

  const lot = await prisma.inventoryLot.create({
    data: {
      storeId,
      skuId: sku.id,
      locationId,
      unitCost: "100",
      costCurrency: "CNY",
      sourceType: "E2E",
      sourceId: `${runId}_${suffix}`,
      receivedAt: new Date("2026-06-22T01:00:00.000Z"),
    },
  });

  await prisma.stockLedger.create({
    data: {
      storeId,
      entityType: "LOT",
      entityId: lot.id,
      locationId,
      deltaQty: "1",
      reason: "INBOUND_PURCHASE",
      refType: "E2E",
      refId: `${runId}_${suffix}`,
    },
  });

  const listing = await createListing({
    storeId,
    platformId,
    listingType: "SKU",
    skuId: sku.id,
    listedPrice: "180",
    currency: "CNY",
  });
  expect(listing.success).toBe(true);
  if (!listing.success) throw new Error(listing.error);

  return { listing, lotId: lot.id, sku };
}

async function expectLotQuantity(lotId: string, expected: string) {
  const ledgers = await prisma.stockLedger.findMany({
    where: { entityType: "LOT", entityId: lotId },
    select: { deltaQty: true },
  });
  const quantity = ledgers.reduce(
    (sum, ledger) => sum.plus(new Decimal(ledger.deltaQty.toString())),
    new Decimal(0),
  );
  expect(quantity.toString()).toBe(expected);
}
