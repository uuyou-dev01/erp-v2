"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import {
  computeOrderFees,
  feeResultToStrings,
} from "@/lib/application/order-fees";
import { resolveFifoShipFromLocation } from "@/lib/application/inventory";
import { resolvePlatformListingDefaults } from "@/lib/platform-defaults";
import { requireUserContext } from "@/lib/auth/user-context";
import {
  completeTasksForRef,
  createTaskIfMissing,
  TASK_TYPE,
} from "@/lib/application/tasks";

const CONFIRMED_SALES_STATUSES = ["CONFIRMED", "SHIPPED", "DELIVERED"];

function revalidateListingSurfaces(listingId?: string) {
  revalidatePath("/listing");
  revalidatePath("/listing/pending");
  revalidatePath("/inventory/coverage");
  revalidatePath("/inventory/coverage/pending");
  revalidatePath("/inventory/sellable");
  revalidatePath("/inventory/sold");
  revalidatePath("/reports/team");
  if (listingId) revalidatePath(`/listing/${listingId}`);
}

async function recordListingCreateTask(input: {
  organizationId: string;
  storeId: string;
  userId: string;
  listingId: string;
}) {
  await createTaskIfMissing({
    organizationId: input.organizationId,
    storeId: input.storeId,
    type: TASK_TYPE.LISTING_CREATE,
    title: "创建上架记录",
    description: "上架动作完成后自动记录，用于团队上架统计。",
    refType: "LISTING",
    refId: input.listingId,
    createdById: input.userId,
  });
  await completeTasksForRef({
    organizationId: input.organizationId,
    storeId: input.storeId,
    type: TASK_TYPE.LISTING_CREATE,
    refType: "LISTING",
    refId: input.listingId,
    completedById: input.userId,
  });
}

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
  const context = await requireUserContext({ storeId });
  return await prisma.listing.findMany({
    where: {
      storeId: context.activeStoreId,
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
  const listing = await prisma.listing.findUnique({
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
  if (!listing) return null;
  await requireUserContext({ storeId: listing.storeId });
  return listing;
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
  const context = await requireUserContext({ storeId: data.storeId });
  const platform = await prisma.platform.findFirst({
    where: { id: data.platformId, storeId: context.activeStoreId },
    select: {
      defaultFeeRate: true,
      defaultCurrency: true,
      defaultShippingFee: true,
      shippingRules: true,
    },
  });
  if (!platform) {
    throw new Error("平台不存在或无权操作");
  }
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
      storeId: context.activeStoreId,
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

  await recordListingCreateTask({
    organizationId: context.organizationId,
    storeId: context.activeStoreId,
    userId: context.userId,
    listingId: listing.id,
  });

  revalidateListingSurfaces();
  return { id: listing.id };
}

export async function getListingFifoShipFromLocation(listingId: string) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { sku: true },
  });

  if (!listing || listing.listingType !== "SKU" || !listing.sku) {
    return { locationId: null as string | null };
  }

  const locationId = await resolveFifoShipFromLocation(
    listing.storeId,
    listing.sku.id
  );
  return { locationId };
}

export async function quickSellListing(data: {
  listingId: string;
  quantity?: string;
  unitPrice?: string;
  platformFeeAmount?: string;
  platformFeeRate?: string;
  shippingFee?: string;
  shipFromLocationId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress?: string;
  externalOrderNo?: string;
}) {
  try {
    const requestedQuantity = new Decimal(data.quantity || "1");

    if (requestedQuantity.lte(0)) {
      return { success: false, error: "售出数量必须大于 0" };
    }

    const saleResult = await prisma.$transaction(async (tx) => {
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
      throw new Error("只有在售 Listing 可以登记售出");
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
    const effectiveFeeRate = data.platformFeeRate
      ? new Decimal(data.platformFeeRate)
      : feeRate;
    const platformFeeAmount = data.platformFeeAmount
      ? new Decimal(data.platformFeeAmount)
      : null;
    const shippingFee = data.shippingFee
      ? new Decimal(data.shippingFee)
      : listing.shippingFeeOverride
        ? new Decimal(listing.shippingFeeOverride.toString())
        : listing.platform.defaultShippingFee
          ? new Decimal(listing.platform.defaultShippingFee.toString())
          : new Decimal(0);

    let inventoryCost = new Decimal(0);

    const customerOrder = await tx.customerOrder.create({
      data: {
        storeId: listing.storeId,
        orderNumber: `SALE-${Date.now()}`,
        platformId: listing.platformId,
        externalOrderNo: data.externalOrderNo || undefined,
        customerName: data.customerName || "散客",
        customerEmail: data.customerEmail || undefined,
        customerPhone: data.customerPhone || undefined,
        shippingAddress: data.shippingAddress || undefined,
        orderDate: new Date(),
        currency,
        subtotal: subtotal.toFixed(4),
        totalPaid: subtotal.toFixed(4),
        platformFee: (platformFeeAmount ?? subtotal.mul(effectiveFeeRate)).toFixed(4),
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
          ...(data.shipFromLocationId
            ? { locationId: data.shipFromLocationId }
            : {}),
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
            ...(data.shipFromLocationId
              ? { locationId: data.shipFromLocationId }
              : {}),
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
        throw new Error(
          data.shipFromLocationId
            ? "所选发货仓库存不足，无法完成售出"
            : "库存不足，无法完成售出"
        );
      }
    }

    const fees = computeOrderFees({
      subtotal,
      platformFeeRate: effectiveFeeRate,
      platformFeeAmount,
      shippingFee,
      inventoryCost,
    });
    const feeStrings = feeResultToStrings(fees);

    await tx.customerOrder.update({
      where: { id: customerOrder.id },
      data: { netRevenue: feeStrings.netRevenue },
    });

    return {
      orderId: customerOrder.id,
      orderNumber: customerOrder.orderNumber,
      storeId: customerOrder.storeId,
    };
    });

    const context = await requireUserContext({ storeId: saleResult.storeId });
    await createTaskIfMissing({
      organizationId: context.organizationId,
      storeId: saleResult.storeId,
      type: TASK_TYPE.SHIP_ORDER,
      title: `发货订单 ${saleResult.orderNumber}`,
      description: "Listing 快速售出后自动生成的打包/发货任务。",
      refType: "CUSTOMER_ORDER",
      refId: saleResult.orderId,
      createdById: context.userId,
    });

    revalidateListingSurfaces();
    revalidatePath("/sales");
    revalidatePath(`/sales/${saleResult.orderId}`);
    revalidatePath("/inventory/lots");
    revalidatePath("/inventory/items");
    return { success: true, orderId: saleResult.orderId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "登记售出失败，请重试",
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
  const context = await requireUserContext({ storeId: data.storeId });
  const platform = await prisma.platform.findUnique({
    where: { id: data.platformId },
  });
  if (!platform || platform.storeId !== context.activeStoreId) {
    throw new Error("平台不存在或无权操作");
  }

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
          storeId: context.activeStoreId,
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

  for (const listing of listings) {
    await recordListingCreateTask({
      organizationId: context.organizationId,
      storeId: context.activeStoreId,
      userId: context.userId,
      listingId: listing.id,
    });
  }

  revalidateListingSurfaces();
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
  const existing = await prisma.listing.findUnique({
    where: { id },
    select: { storeId: true },
  });
  if (!existing) throw new Error("上架记录不存在或无权修改");
  await requireUserContext({ storeId: existing.storeId });

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

  revalidateListingSurfaces(id);
  return listing;
}

export async function delistListing(id: string) {
  const existing = await prisma.listing.findUnique({
    where: { id },
    select: { storeId: true },
  });
  if (!existing) throw new Error("上架记录不存在或无权下架");
  await requireUserContext({ storeId: existing.storeId });

  const listing = await prisma.listing.update({
    where: { id },
    data: {
      status: "DELISTED",
      delistedAt: new Date(),
    },
  });

  revalidateListingSurfaces(id);
  return listing;
}

export async function deleteListing(id: string) {
  const existing = await prisma.listing.findUnique({
    where: { id },
    select: { storeId: true },
  });
  if (!existing) throw new Error("上架记录不存在或无权删除");
  const context = await requireUserContext({ storeId: existing.storeId });

  const deleted = await prisma.listing.deleteMany({
    where: { id, storeId: context.activeStoreId },
  });
  if (deleted.count === 0) throw new Error("上架记录不存在或无权删除");

  revalidateListingSurfaces();
}
