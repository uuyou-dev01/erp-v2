"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import {
  computeOrderFees,
  feeResultToStrings,
} from "@/lib/application/order-fees";
import { resolvePlatformListingDefaults } from "@/lib/platform-defaults";

const CONFIRMED_SALES_STATUSES = ["CONFIRMED", "SHIPPED", "DELIVERED"];

async function getSkuReferencePrice(skuId: string) {
  const latestSaleLine = await prisma.orderLine.findFirst({
    where: {
      skuId,
      order: {
        orderStatus: {
          in: CONFIRMED_SALES_STATUSES,
        },
      },
    },
    include: {
      order: {
        select: {
          currency: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (latestSaleLine) {
    const quantity = new Decimal(latestSaleLine.quantity.toString());
    if (quantity.gt(0)) {
      return {
        price: new Decimal(latestSaleLine.lineAmount.toString()).div(quantity),
        currency: latestSaleLine.order.currency,
      };
    }
  }

  const latestActiveListing = await prisma.listing.findFirst({
    where: {
      skuId,
      status: "ACTIVE",
      listedPrice: {
        not: null,
      },
    },
    select: {
      listedPrice: true,
      currency: true,
    },
    orderBy: { listedAt: "desc" },
  });

  if (latestActiveListing?.listedPrice) {
    return {
      price: new Decimal(latestActiveListing.listedPrice.toString()),
      currency: latestActiveListing.currency,
    };
  }

  return null;
}

export async function getListings(storeId: string, platformId?: string) {
  return await prisma.listing.findMany({
    where: {
      storeId,
      ...(platformId ? { platformId } : {}),
    },
    include: {
      platform: true,
      sku: true,
      itemUnit: {
        include: {
          sku: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getListingById(id: string) {
  return await prisma.listing.findUnique({
    where: { id },
    include: {
      platform: true,
      sku: true,
      itemUnit: {
        include: {
          sku: true,
          location: true,
        },
      },
    },
  });
}

export async function createListing(data: {
  storeId: string;
  platformId: string;
  listingType: "SKU" | "ITEM_UNIT";
  skuId?: string;
  itemUnitId?: string;
  listedPrice?: string;
  currency?: string;
  feeRateOverride?: string;
  shippingFeeOverride?: string;
  estimatedNet?: string;
}) {
  const platform = await prisma.platform.findUnique({
    where: { id: data.platformId },
    select: {
      defaultFeeRate: true,
      defaultCurrency: true,
      defaultShippingFee: true,
      shippingRules: true,
    },
  });
  const platformDefaults = platform ? resolvePlatformListingDefaults(platform) : null;

  let pricingSkuId = data.skuId;
  if (!pricingSkuId && data.itemUnitId) {
    const itemUnit = await prisma.itemUnit.findUnique({
      where: { id: data.itemUnitId },
      select: { skuId: true },
    });
    pricingSkuId = itemUnit?.skuId;
  }

  const referencePrice =
    !data.listedPrice && pricingSkuId
      ? await getSkuReferencePrice(pricingSkuId)
      : null;
  const listedPriceDecimal = data.listedPrice
    ? new Decimal(data.listedPrice)
    : referencePrice?.price || null;
  const resolvedCurrency =
    data.currency ||
    referencePrice?.currency ||
    platformDefaults?.currency ||
    null;
  const feeRateDecimal = data.feeRateOverride
    ? new Decimal(data.feeRateOverride)
    : platformDefaults?.feeRate
      ? new Decimal(platformDefaults.feeRate)
      : new Decimal(0);
  const shippingFeeDecimal = data.shippingFeeOverride
    ? new Decimal(data.shippingFeeOverride)
    : platformDefaults?.shippingFee
      ? new Decimal(platformDefaults.shippingFee)
      : new Decimal(0);
  const estimatedNetDecimal = data.estimatedNet
    ? new Decimal(data.estimatedNet)
    : listedPriceDecimal
      ? listedPriceDecimal.mul(new Decimal(1).minus(feeRateDecimal)).minus(shippingFeeDecimal)
      : null;

  const listing = await prisma.listing.create({
    data: {
      storeId: data.storeId,
      platformId: data.platformId,
      listingType: data.listingType,
      skuId: data.skuId,
      itemUnitId: data.itemUnitId,
      listedPrice: listedPriceDecimal,
      currency: resolvedCurrency,
      feeRateOverride: data.feeRateOverride ? new Decimal(data.feeRateOverride) : null,
      shippingFeeOverride: data.shippingFeeOverride ? new Decimal(data.shippingFeeOverride) : null,
      estimatedNet: estimatedNetDecimal,
      status: "ACTIVE",
      listedAt: new Date(),
    },
  });

  revalidatePath("/listing");
  return { id: listing.id };
}

export async function quickSellListing(data: {
  listingId: string;
  quantity?: string;
  unitPrice?: string;
  customerName?: string;
  externalOrderNo?: string;
}) {
  try {
    const requestedQuantity = new Decimal(data.quantity || "1");

    if (requestedQuantity.lte(0)) {
      return { success: false, error: "售出数量必须大于 0" };
    }

    const orderId = await prisma.$transaction(async (tx) => {
    const listing = await tx.listing.findUnique({
      where: { id: data.listingId },
      include: {
        platform: true,
        sku: true,
        itemUnit: {
          include: {
            sku: true,
          },
        },
      },
    });

    if (!listing) {
      throw new Error("上架记录不存在");
    }

    if (listing.status !== "ACTIVE") {
      throw new Error("只有上架中的商品可以快捷售出");
    }

    const sku = listing.sku || listing.itemUnit?.sku;
    if (!sku) {
      throw new Error("上架记录没有关联 SKU");
    }

    const quantity =
      listing.listingType === "ITEM_UNIT" ? new Decimal(1) : requestedQuantity;
    const unitPrice = data.unitPrice
      ? new Decimal(data.unitPrice)
      : listing.listedPrice
        ? new Decimal(listing.listedPrice.toString())
        : new Decimal(0);
    const currency =
      listing.currency || listing.platform.defaultCurrency || "CNY";
    const subtotal = quantity.mul(unitPrice);
    const feeRate = listing.feeRateOverride
      ? new Decimal(listing.feeRateOverride.toString())
      : listing.platform.defaultFeeRate
        ? new Decimal(listing.platform.defaultFeeRate.toString())
        : new Decimal(0);
    const shippingFee = listing.shippingFeeOverride
      ? new Decimal(listing.shippingFeeOverride.toString())
      : new Decimal(0);

    let inventoryCost = new Decimal(0);

    const customerOrder = await tx.customerOrder.create({
      data: {
        storeId: listing.storeId,
        orderNumber: `SALE-${Date.now()}`,
        platformId: listing.platformId,
        externalOrderNo: data.externalOrderNo || undefined,
        customerName: data.customerName || "散客",
        orderDate: new Date(),
        currency,
        subtotal: subtotal.toFixed(4),
        totalPaid: subtotal.toFixed(4),
        platformFee: subtotal.mul(feeRate).toFixed(4),
        shippingFee: shippingFee.toFixed(4),
        orderStatus: "CONFIRMED",
        confirmedAt: new Date(),
      },
    });

    const orderLine = await tx.orderLine.create({
      data: {
        orderId: customerOrder.id,
        skuId: sku.id,
        quantity: quantity.toFixed(4),
        unitPrice: unitPrice.toFixed(4),
        lineAmount: subtotal.toFixed(4),
        supplyType: "FROM_STOCK",
        supplyStatus: "READY_TO_SHIP",
      },
    });

    if (listing.listingType === "ITEM_UNIT") {
      if (!listing.itemUnit || listing.itemUnit.status !== "AVAILABLE") {
        throw new Error("关联单品已不可售");
      }

      const unitCost = new Decimal(listing.itemUnit.unitCost.toString());
      inventoryCost = unitCost;

      await tx.orderAllocation.create({
        data: {
          orderLineId: orderLine.id,
          allocationType: "ITEM_UNIT",
          itemUnitId: listing.itemUnit.id,
          quantity: "1.0000",
          unitCost: unitCost.toFixed(4),
          costAmount: unitCost.toFixed(4),
          status: "PENDING",
        },
      });

      await tx.listing.update({
        where: { id: listing.id },
        data: { status: "SOLD_OUT", delistedAt: new Date() },
      });
    } else {
      let remainingToAllocate = quantity;
      const lots = await tx.inventoryLot.findMany({
        where: {
          storeId: listing.storeId,
          skuId: sku.id,
          status: "ACTIVE",
        },
        orderBy: { receivedAt: "asc" },
      });

      for (const lot of lots) {
        const ledgers = await tx.stockLedger.findMany({
          where: { entityType: "LOT", entityId: lot.id },
        });
        const available = ledgers.reduce(
          (sum, ledger) => sum.plus(new Decimal(ledger.deltaQty.toString())),
          new Decimal(0)
        );

        if (available.lte(0) || remainingToAllocate.lte(0)) continue;

        const allocatedQty = Decimal.min(available, remainingToAllocate);
        const unitCost = new Decimal(lot.unitCost.toString());
        inventoryCost = inventoryCost.plus(allocatedQty.mul(unitCost));

        await tx.orderAllocation.create({
          data: {
            orderLineId: orderLine.id,
            allocationType: "LOT",
            lotId: lot.id,
            quantity: allocatedQty.toFixed(4),
            unitCost: unitCost.toFixed(4),
            costAmount: allocatedQty.mul(unitCost).toFixed(4),
            status: "PENDING",
          },
        });

        remainingToAllocate = remainingToAllocate.minus(allocatedQty);
      }

      if (remainingToAllocate.gt(0)) {
        const itemUnits = await tx.itemUnit.findMany({
          where: {
            storeId: listing.storeId,
            skuId: sku.id,
            status: "AVAILABLE",
          },
          orderBy: { createdAt: "asc" },
        });

        for (const itemUnit of itemUnits) {
          if (remainingToAllocate.lt(1)) break;
          const unitCost = new Decimal(itemUnit.unitCost.toString());
          inventoryCost = inventoryCost.plus(unitCost);

          await tx.orderAllocation.create({
            data: {
              orderLineId: orderLine.id,
              allocationType: "ITEM_UNIT",
              itemUnitId: itemUnit.id,
              quantity: "1.0000",
              unitCost: unitCost.toFixed(4),
              costAmount: unitCost.toFixed(4),
              status: "PENDING",
            },
          });

          remainingToAllocate = remainingToAllocate.minus(1);
        }
      }

      if (remainingToAllocate.gt(0)) {
        throw new Error("库存不足，无法完成售出");
      }
    }

    const fees = computeOrderFees({
      subtotal,
      platformFeeRate: feeRate,
      shippingFee,
      inventoryCost,
    });
    const feeStrings = feeResultToStrings(fees);

    await tx.customerOrder.update({
      where: { id: customerOrder.id },
      data: { netRevenue: feeStrings.netRevenue },
    });

    return customerOrder.id;
    });

  revalidatePath("/listing");
  revalidatePath("/sales");
    revalidatePath(`/sales/${orderId}`);
  revalidatePath("/inventory/lots");
  revalidatePath("/inventory/items");
    return { success: true, orderId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "快捷售出失败，请重试",
    };
  }
}

export async function batchCreateListings(data: {
  storeId: string;
  platformId: string;
  skuIds: string[];
  listedPrice?: string;
  currency?: string;
}) {
  const platform = await prisma.platform.findUnique({
    where: { id: data.platformId },
  });

  const referenceBySku = new Map<
    string,
    { price: Decimal; currency: string | null } | null
  >();
  if (!data.listedPrice) {
    const references = await Promise.all(
      data.skuIds.map(async (skuId) => ({
        skuId,
        reference: await getSkuReferencePrice(skuId),
      }))
    );
    for (const item of references) {
      referenceBySku.set(item.skuId, item.reference);
    }
  }

  const listings = await prisma.$transaction(
    data.skuIds.map((skuId) => {
      const reference = referenceBySku.get(skuId) || null;
      const resolvedPrice = data.listedPrice
        ? new Decimal(data.listedPrice)
        : reference?.price || null;
      const resolvedCurrency =
        data.currency || reference?.currency || platform?.defaultCurrency || null;
      let estimatedNet: Decimal | null = null;
      if (resolvedPrice && platform) {
        const feeRate = platform.defaultFeeRate ? new Decimal(platform.defaultFeeRate) : new Decimal(0);
        estimatedNet = resolvedPrice.mul(new Decimal(1).minus(feeRate));
      }

      return prisma.listing.create({
        data: {
          storeId: data.storeId,
          platformId: data.platformId,
          listingType: "SKU",
          skuId,
          listedPrice: resolvedPrice,
          currency: resolvedCurrency,
          estimatedNet,
          status: "ACTIVE",
          listedAt: new Date(),
        },
      });
    })
  );

  revalidatePath("/listing");
  return { count: listings.length };
}

export async function updateListing(
  id: string,
  data: {
    listedPrice?: string;
    currency?: string;
    status?: string;
  }
) {
  const updateData: Record<string, unknown> = {
    status: data.status,
    currency: data.currency,
  };

  if (data.listedPrice) {
    updateData.listedPrice = new Decimal(data.listedPrice);
  }

  if (data.status === "DELISTED") {
    updateData.delistedAt = new Date();
  }

  const listing = await prisma.listing.update({
    where: { id },
    data: updateData,
  });

  revalidatePath("/listing");
  revalidatePath(`/listing/${id}`);
  return listing;
}

export async function delistListing(id: string) {
  const listing = await prisma.listing.update({
    where: { id },
    data: {
      status: "DELISTED",
      delistedAt: new Date(),
    },
  });

  revalidatePath("/listing");
  revalidatePath(`/listing/${id}`);
  return listing;
}

export async function deleteListing(id: string) {
  await prisma.listing.delete({
    where: { id },
  });

  revalidatePath("/listing");
}
