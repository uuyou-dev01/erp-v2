"use server";

import { createHash, randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { computeOrderFees, feeResultToStrings } from "@/lib/application/order-fees";
import { actionFailure, actionSuccess, toActionFailure } from "@/lib/application/action-result";
import {
  getEffectiveSellableQuantity,
  getSkuStockBreakdown,
  resolveFifoShipFromLocation,
} from "@/lib/application/inventory";
import { assertOperationalSku } from "@/lib/application/sku-operability";
import { resolvePlatformListingDefaults } from "@/lib/platform-defaults";
import { requiresSellableStockForListing } from "@/lib/core-platforms";
import { requireUserContext } from "@/lib/auth/user-context";
import {
  completeTasksForRef,
  createTaskIfMissing,
  TASK_STATUS,
  TASK_TYPE,
} from "@/lib/application/tasks";
import {
  ensureShipOrderTaskDispatch,
  notifyShipOrderQueue,
} from "@/lib/application/shipping-dispatch-lifecycle";
import { createShipOrderDispatch } from "@/lib/application/collaboration-protocol-shipping";
import { RESERVING_ALLOCATION_STATUSES } from "@/lib/application/order-allocation";
import { previewBundleFulfillment } from "@/lib/application/bundle-fulfillment-preview";
import { getOrderFulfillmentLocationIds } from "@/lib/application/location-fulfillment-roster";
import {
  inferMarketFromPlatform,
  locationMatchesMarket,
  locationMatchesPlatformMarket,
  marketLabel,
} from "@/lib/application/sellable-market";

const CONFIRMED_SALES_STATUSES = ["CONFIRMED", "SHIPPED", "DELIVERED"];

function revalidateListingSurfaces(listingId?: string) {
  revalidatePath("/listing");
  revalidatePath("/listing/pending");
  revalidatePath("/inventory/coverage");
  revalidatePath("/inventory/coverage/pending");
  revalidatePath("/inventory/sellable");
  revalidatePath("/inventory/sold");
  revalidatePath("/reports/workload");
  revalidatePath("/reports/team-performance");
  if (listingId) revalidatePath(`/listing/${listingId}`);
}

function parseDecimalInput(
  value: string | undefined,
  fieldLabel: string,
  options: {
    fallback?: string;
    requiredPositive?: boolean;
    nonNegative?: boolean;
    max?: Decimal.Value;
  } = {}
): { success: true; value: Decimal } | { success: false; error: string } {
  const raw = value?.trim() || options.fallback;
  if (!raw) {
    return { success: false, error: `${fieldLabel}必须是有效数字` };
  }

  let decimal: Decimal;
  try {
    decimal = new Decimal(raw);
  } catch {
    return { success: false, error: `${fieldLabel}必须是有效数字` };
  }

  if (!decimal.isFinite()) {
    return { success: false, error: `${fieldLabel}必须是有效数字` };
  }
  if (options.requiredPositive && decimal.lte(0)) {
    return { success: false, error: `${fieldLabel}必须大于 0` };
  }
  if (options.nonNegative && decimal.lt(0)) {
    return { success: false, error: `${fieldLabel}不能为负数` };
  }
  if (options.max !== undefined && decimal.gt(options.max)) {
    return { success: false, error: `${fieldLabel}不能大于 ${options.max}` };
  }

  return { success: true, value: decimal };
}

function parseOptionalDecimalInput(
  value: string | undefined,
  fieldLabel: string,
  options: {
    requiredPositive?: boolean;
    nonNegative?: boolean;
    max?: Decimal.Value;
  } = {}
): { success: true; value: Decimal | null } | { success: false; error: string } {
  if (value == null || value.trim() === "") {
    return { success: true, value: null };
  }

  return parseDecimalInput(value, fieldLabel, options);
}

function parseOptionalListingDateInput(
  value?: string
): { success: true; value: Date | null } | { success: false; error: string } {
  const normalized = value?.trim();
  if (!normalized) return { success: true, value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return { success: false, error: "上架时间必须是有效日期" };
  }

  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    return { success: false, error: "上架时间必须是有效日期" };
  }
  return { success: true, value: date };
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

async function assertListingHasSellableStock(input: {
  storeId: string;
  platformCode: string;
  platformCountry?: string | null;
  platformName: string;
  listingType: "SKU" | "ITEM_UNIT";
  skuId?: string;
  itemUnitId?: string;
}) {
  if (input.listingType === "SKU") {
    if (!input.skuId) throw new Error("请选择要上架的 SKU");
    await assertOperationalSku(prisma, {
      storeId: input.storeId,
      skuId: input.skuId,
      actionLabel: "上架",
    });
    if (!requiresSellableStockForListing(input.platformCode)) return;
    const breakdown = await getSkuStockBreakdown(input.storeId, input.skuId);
    const platform = { code: input.platformCode, country: input.platformCountry ?? null };
    const regionalSellableQty = breakdown.sellableLocations
      .filter((location) => locationMatchesPlatformMarket(location, platform))
      .reduce((sum, location) => sum + location.qty, 0);
    if (regionalSellableQty <= 0) {
      const market = marketLabel(inferMarketFromPlatform(platform));
      throw new Error(
        `${input.platformName} 上架需要可履约${market}的可售库存，请为库存节点配置订单发货能力和有效配送线路`
      );
    }
    return;
  }

  if (!requiresSellableStockForListing(input.platformCode)) return;

  if (!input.itemUnitId) throw new Error("请选择要上架的单件商品");
  const itemUnit = await prisma.itemUnit.findFirst({
    where: {
      id: input.itemUnitId,
      storeId: input.storeId,
      allocations: {
        none: { status: { in: [...RESERVING_ALLOCATION_STATUSES] } },
      },
    },
    include: {
      location: {
        select: {
          code: true,
          name: true,
          region: true,
          isSellableDefault: true,
          capabilities: { where: { enabled: true }, select: { code: true, enabled: true } },
          shippingLanesFrom: {
            where: { active: true, laneType: "CUSTOMER_DELIVERY" },
            select: { laneType: true, destinationCountry: true, active: true },
          },
        },
      },
    },
  });

  const platform = { code: input.platformCode, country: input.platformCountry ?? null };
  if (
    !itemUnit ||
    itemUnit.status !== "AVAILABLE" ||
    !itemUnit.location.isSellableDefault ||
    !locationMatchesPlatformMarket(itemUnit.location, platform)
  ) {
    const market = marketLabel(inferMarketFromPlatform(platform));
    throw new Error(
      `${input.platformName} 上架需要可履约${market}的可售库存，请为库存节点配置订单发货能力和有效配送线路`
    );
  }
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
  listedAt?: string;
  currency?: string;
  feeRateOverride?: string;
  shippingFeeOverride?: string;
  estimatedNet?: string;
}) {
  try {
    const context = await requireUserContext({ storeId: data.storeId });
    const platform = await prisma.platform.findFirst({
      where: { id: data.platformId, storeId: context.activeStoreId },
      select: {
        code: true,
        name: true,
        country: true,
        defaultFeeRate: true,
        defaultCurrency: true,
        defaultShippingFee: true,
        shippingRules: true,
        salesChannelAccount: { select: { id: true } },
      },
    });
    if (!platform) {
      throw new Error("平台不存在或无权操作");
    }
    const listedPriceInput = parseOptionalDecimalInput(data.listedPrice, "Listing 价格", {
      requiredPositive: true,
    });
    if (!listedPriceInput.success) {
      return actionFailure(listedPriceInput.error);
    }
    const listedAtInput = parseOptionalListingDateInput(data.listedAt);
    if (!listedAtInput.success) {
      return actionFailure(listedAtInput.error);
    }
    const feeRateInput = parseOptionalDecimalInput(data.feeRateOverride, "平台费率", {
      nonNegative: true,
      max: 1,
    });
    if (!feeRateInput.success) {
      return actionFailure(feeRateInput.error);
    }
    const shippingFeeInput = parseOptionalDecimalInput(data.shippingFeeOverride, "运费", {
      nonNegative: true,
    });
    if (!shippingFeeInput.success) {
      return actionFailure(shippingFeeInput.error);
    }
    const estimatedNetInput = parseOptionalDecimalInput(data.estimatedNet, "预估净收入");
    if (!estimatedNetInput.success) {
      return actionFailure(estimatedNetInput.error);
    }

    await assertListingHasSellableStock({
      storeId: context.activeStoreId,
      platformCode: platform.code,
      platformCountry: platform.country,
      platformName: platform.name,
      listingType: data.listingType,
      skuId: data.skuId,
      itemUnitId: data.itemUnitId,
    });

    const duplicateActiveListing = await prisma.listing.findFirst({
      where: {
        storeId: context.activeStoreId,
        salesChannelAccountId: platform.salesChannelAccount?.id,
        platformId: data.platformId,
        listingType: data.listingType,
        status: "ACTIVE",
        ...(data.listingType === "ITEM_UNIT"
          ? { itemUnitId: data.itemUnitId }
          : { skuId: data.skuId }),
      },
      select: { id: true },
    });
    if (duplicateActiveListing) {
      return actionFailure(
        `该${data.listingType === "ITEM_UNIT" ? "单件" : "SKU"}已在 ${platform.name} 上架`
      );
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
      !data.listedPrice && pricingSkuId ? await getSkuReferencePrice(pricingSkuId) : null;
    const listedPriceDecimal = listedPriceInput.value ?? referencePrice?.price ?? null;
    const resolvedCurrency =
      data.currency || referencePrice?.currency || platformDefaults?.currency || null;
    const feeRateDecimal = feeRateInput.value
      ? feeRateInput.value
      : platformDefaults?.feeRate
        ? new Decimal(platformDefaults.feeRate)
        : new Decimal(0);
    const shippingFeeDecimal = shippingFeeInput.value
      ? shippingFeeInput.value
      : platformDefaults?.shippingFee
        ? new Decimal(platformDefaults.shippingFee)
        : new Decimal(0);
    const estimatedNetDecimal = estimatedNetInput.value
      ? estimatedNetInput.value
      : listedPriceDecimal
        ? listedPriceDecimal.mul(new Decimal(1).minus(feeRateDecimal)).minus(shippingFeeDecimal)
        : null;

    const listing = await prisma.listing.create({
      data: {
        storeId: context.activeStoreId,
        salesChannelAccountId: platform.salesChannelAccount?.id,
        platformId: data.platformId,
        listingType: data.listingType,
        skuId: data.skuId,
        itemUnitId: data.itemUnitId,
        listedPrice: listedPriceDecimal,
        currency: resolvedCurrency,
        feeRateOverride: feeRateInput.value,
        shippingFeeOverride: shippingFeeInput.value,
        estimatedNet: estimatedNetDecimal,
        status: "ACTIVE",
        listedAt: listedAtInput.value ?? new Date(),
      },
    });

    await recordListingCreateTask({
      organizationId: context.organizationId,
      storeId: context.activeStoreId,
      userId: context.userId,
      listingId: listing.id,
    });

    revalidateListingSurfaces();
    return actionSuccess({ id: listing.id });
  } catch (error) {
    return toActionFailure(error, "添加上架记录失败，请重试");
  }
}

export async function getListingFifoShipFromLocation(listingId: string) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { sku: true, platform: true },
  });

  if (!listing || listing.listingType !== "SKU" || !listing.sku) {
    return { locationId: null as string | null };
  }

  const locationId = await resolveFifoShipFromLocation(
    listing.storeId,
    listing.sku.id,
    inferMarketFromPlatform(listing.platform)
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
  shippingCountry?: string;
  externalOrderNo?: string;
}) {
  try {
    const requestedQuantityResult = parseDecimalInput(data.quantity, "售出数量", {
      fallback: "1",
      requiredPositive: true,
    });
    if (!requestedQuantityResult.success) {
      return actionFailure(requestedQuantityResult.error);
    }
    const requestedQuantity = requestedQuantityResult.value;

    const unitPriceInput = parseOptionalDecimalInput(data.unitPrice, "售出单价", {
      requiredPositive: true,
    });
    if (!unitPriceInput.success) {
      return actionFailure(unitPriceInput.error);
    }

    const platformFeeRateInput = parseOptionalDecimalInput(data.platformFeeRate, "平台费率", {
      nonNegative: true,
    });
    if (!platformFeeRateInput.success) {
      return actionFailure(platformFeeRateInput.error);
    }

    const platformFeeAmountInput = parseOptionalDecimalInput(data.platformFeeAmount, "平台手续费", {
      nonNegative: true,
    });
    if (!platformFeeAmountInput.success) {
      return actionFailure(platformFeeAmountInput.error);
    }

    const shippingFeeInput = parseOptionalDecimalInput(data.shippingFee, "运费", {
      nonNegative: true,
    });
    if (!shippingFeeInput.success) {
      return actionFailure(shippingFeeInput.error);
    }

    const listingOwner = await prisma.listing.findUnique({
      where: { id: data.listingId },
      select: { storeId: true },
    });
    if (!listingOwner) return actionFailure("上架记录不存在");
    const context = await requireUserContext({ storeId: listingOwner.storeId });

    const saleResult = await prisma.$transaction(async (tx) => {
      const listing = await tx.listing.findUnique({
        where: { id: data.listingId },
        include: {
          platform: true,
          sku: true,
          itemUnit: {
            include: {
              sku: true,
              location: {
                include: {
                  capabilities: { where: { enabled: true } },
                  shippingLanesFrom: {
                    where: { active: true, laneType: "CUSTOMER_DELIVERY" },
                  },
                },
              },
            },
          },
        },
      });

      if (!listing) {
        throw new Error("上架记录不存在");
      }
      if (listing.storeId !== context.activeStoreId) {
        throw new Error("上架记录不存在或无权操作");
      }

      if (listing.status !== "ACTIVE") {
        throw new Error("只有在售 Listing 可以登记售出");
      }

      const sku = listing.sku || listing.itemUnit?.sku;
      if (!sku) {
        throw new Error("上架记录没有关联 SKU");
      }
      const platformMarket = inferMarketFromPlatform(listing.platform);
      const requestedDestination = data.shippingCountry?.trim().toUpperCase();
      const destinationMarket =
        requestedDestination && ["CN", "JP", "US", "EU", "GLOBAL"].includes(requestedDestination)
          ? (requestedDestination as typeof platformMarket)
          : platformMarket;

      const quantity = listing.listingType === "ITEM_UNIT" ? new Decimal(1) : requestedQuantity;
      const unitPrice = unitPriceInput.value
        ? unitPriceInput.value
        : listing.listedPrice
          ? new Decimal(listing.listedPrice.toString())
          : new Decimal(0);
      if (unitPrice.lte(0)) {
        throw new Error("售出单价必须大于 0");
      }
      const currency = listing.currency || listing.platform.defaultCurrency || "CNY";
      const subtotal = quantity.mul(unitPrice);
      const feeRate = listing.feeRateOverride
        ? new Decimal(listing.feeRateOverride.toString())
        : listing.platform.defaultFeeRate
          ? new Decimal(listing.platform.defaultFeeRate.toString())
          : new Decimal(0);
      const effectiveFeeRate = platformFeeRateInput.value ?? feeRate;
      const platformFeeAmount = platformFeeAmountInput.value;
      const shippingFee = shippingFeeInput.value
        ? shippingFeeInput.value
        : listing.shippingFeeOverride
          ? new Decimal(listing.shippingFeeOverride.toString())
          : listing.platform.defaultShippingFee
            ? new Decimal(listing.platform.defaultShippingFee.toString())
            : new Decimal(0);
      const shippingFeeStatus =
        shippingFeeInput.value !== null ||
        listing.shippingFeeOverride !== null ||
        listing.platform.defaultShippingFee !== null
          ? "ESTIMATED"
          : "PENDING";

      let inventoryCost = new Decimal(0);

      // Direct sales and supply-offer orders draw from the same physical pool.
      // Lock the SKU row so they cannot both pass availability checks concurrently.
      await tx.$queryRaw`SELECT "id" FROM "skus" WHERE "id" = ${sku.id} FOR UPDATE`;
      let lockedItemUnit:
        | (NonNullable<typeof listing.itemUnit> & {
            location: NonNullable<typeof listing.itemUnit>["location"];
          })
        | null = null;
      if (listing.listingType === "ITEM_UNIT" && listing.itemUnitId) {
        await tx.$queryRaw`SELECT "id" FROM "item_units" WHERE "id" = ${listing.itemUnitId} FOR UPDATE`;
        lockedItemUnit = await tx.itemUnit.findUnique({
          where: { id: listing.itemUnitId },
          include: {
            sku: true,
            location: {
              include: {
                capabilities: { where: { enabled: true } },
                shippingLanesFrom: {
                  where: { active: true, laneType: "CUSTOMER_DELIVERY" },
                },
              },
            },
          },
        });
      }
      const effectiveSellable = await getEffectiveSellableQuantity(
        tx,
        listing.storeId,
        sku.id,
        destinationMarket
      );
      if (quantity.gt(effectiveSellable)) {
        throw new Error("可售库存不足（部分库存可能已被货盘保证配额保护）");
      }

      const customerOrder = await tx.customerOrder.create({
        data: {
          storeId: listing.storeId,
          salesChannelAccountId: listing.salesChannelAccountId,
          orderNumber: `SALE-${Date.now()}-${randomUUID().slice(0, 8)}`,
          platformId: listing.platformId,
          externalOrderNo: data.externalOrderNo || undefined,
          customerName: data.customerName || "散客",
          customerEmail: data.customerEmail || undefined,
          customerPhone: data.customerPhone || undefined,
          shippingAddress: data.shippingAddress || undefined,
          shippingCountry: destinationMarket === "UNKNOWN" ? undefined : destinationMarket,
          orderDate: new Date(),
          currency,
          subtotal: subtotal.toFixed(4),
          totalPaid: subtotal.toFixed(4),
          platformFee: (platformFeeAmount ?? subtotal.mul(effectiveFeeRate)).toFixed(4),
          shippingFee: shippingFee.toFixed(4),
          shippingFeeStatus,
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
        if (
          !lockedItemUnit ||
          lockedItemUnit.storeId !== listing.storeId ||
          lockedItemUnit.skuId !== sku.id ||
          !lockedItemUnit.inventoryPoolId ||
          !context.inventoryPoolIds.includes(lockedItemUnit.inventoryPoolId) ||
          lockedItemUnit.status !== "AVAILABLE" ||
          lockedItemUnit.costStatus !== "CONFIRMED" ||
          !locationMatchesMarket(lockedItemUnit.location, destinationMarket)
        ) {
          throw new Error("关联单品已不可售");
        }
        const [reservedItemUnit, fulfillmentReservedItemUnit] = await Promise.all([
          tx.orderAllocation.findFirst({
            where: {
              itemUnitId: lockedItemUnit.id,
              status: { in: [...RESERVING_ALLOCATION_STATUSES] },
            },
            select: { id: true },
          }),
          tx.fulfillmentInventoryAllocation.findFirst({
            where: { itemUnitId: lockedItemUnit.id, status: "ALLOCATED" },
            select: { id: true },
          }),
        ]);
        if (reservedItemUnit || fulfillmentReservedItemUnit) {
          throw new Error("关联单品已被预留");
        }

        const unitCost = new Decimal(lockedItemUnit.unitCost.toString());
        inventoryCost = unitCost;

        await tx.orderAllocation.create({
          data: {
            orderLineId: orderLine.id,
            allocationType: "ITEM_UNIT",
            itemUnitId: lockedItemUnit.id,
            quantity: "1.0000",
            unitCost: unitCost.toFixed(4),
            costAmount: unitCost.toFixed(4),
            costCurrency: lockedItemUnit.costCurrency,
            costSourceType: lockedItemUnit.sourceType,
            costSourceId: lockedItemUnit.sourceId,
            status: "PENDING",
          },
        });

        await tx.listing.update({
          where: { id: listing.id },
          data: { status: "SOLD_OUT", delistedAt: new Date() },
        });
      } else {
        let remainingToAllocate = quantity;
        const lotCandidates = await tx.inventoryLot.findMany({
          where: {
            storeId: listing.storeId,
            skuId: sku.id,
            inventoryPoolId: { in: context.inventoryPoolIds },
            status: "ACTIVE",
            costStatus: "CONFIRMED",
            location: { isSellableDefault: true },
            ...(data.shipFromLocationId ? { locationId: data.shipFromLocationId } : {}),
          },
          select: { id: true },
          orderBy: { receivedAt: "asc" },
        });

        for (const lotId of lotCandidates.map((lot) => lot.id).sort()) {
          await tx.$queryRaw`SELECT "id" FROM "inventory_lots" WHERE "id" = ${lotId} FOR UPDATE`;
        }
        const lots = await tx.inventoryLot.findMany({
          where: {
            id: { in: lotCandidates.map((lot) => lot.id) },
            storeId: listing.storeId,
            skuId: sku.id,
            inventoryPoolId: { in: context.inventoryPoolIds },
            status: "ACTIVE",
            costStatus: "CONFIRMED",
            ...(data.shipFromLocationId ? { locationId: data.shipFromLocationId } : {}),
            location: { isSellableDefault: true },
          },
          include: {
            location: {
              include: {
                capabilities: { where: { enabled: true } },
                shippingLanesFrom: {
                  where: { active: true, laneType: "CUSTOMER_DELIVERY" },
                },
              },
            },
          },
          orderBy: { receivedAt: "asc" },
        });

        for (const lot of lots) {
          if (!locationMatchesMarket(lot.location, destinationMarket)) continue;
          const ledgers = await tx.stockLedger.findMany({
            where: { entityType: "LOT", entityId: lot.id },
          });
          const available = ledgers.reduce(
            (sum, ledger) => sum.plus(new Decimal(ledger.deltaQty.toString())),
            new Decimal(0)
          );
          const [activeAllocations, fulfillmentAllocations] = await Promise.all([
            tx.orderAllocation.findMany({
              where: {
                lotId: lot.id,
                status: { in: [...RESERVING_ALLOCATION_STATUSES] },
              },
              select: { quantity: true },
            }),
            tx.fulfillmentInventoryAllocation.findMany({
              where: { lotId: lot.id, status: "ALLOCATED" },
              select: { quantity: true },
            }),
          ]);
          const reserved = [...activeAllocations, ...fulfillmentAllocations].reduce(
            (sum, allocation) => sum.plus(new Decimal(allocation.quantity.toString())),
            new Decimal(0)
          );
          const availableAfterReservations = available.minus(reserved);

          if (availableAfterReservations.lte(0) || remainingToAllocate.lte(0)) continue;

          const allocatedQty = Decimal.min(availableAfterReservations, remainingToAllocate);
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
              costCurrency: lot.costCurrency,
              costSourceType: lot.sourceType,
              costSourceId: lot.sourceId,
              status: "PENDING",
            },
          });

          remainingToAllocate = remainingToAllocate.minus(allocatedQty);
        }

        if (remainingToAllocate.gt(0)) {
          const fulfillmentReservedItemUnitIds = (
            await tx.fulfillmentInventoryAllocation.findMany({
              where: {
                status: "ALLOCATED",
                itemUnitId: { not: null },
                fulfillmentRequest: { storeId: listing.storeId },
              },
              select: { itemUnitId: true },
            })
          ).flatMap((allocation) => (allocation.itemUnitId ? [allocation.itemUnitId] : []));
          const itemUnits = await tx.itemUnit.findMany({
            where: {
              storeId: listing.storeId,
              skuId: sku.id,
              inventoryPoolId: { in: context.inventoryPoolIds },
              ...(fulfillmentReservedItemUnitIds.length > 0
                ? { id: { notIn: fulfillmentReservedItemUnitIds } }
                : {}),
              status: "AVAILABLE",
              costStatus: "CONFIRMED",
              location: { isSellableDefault: true },
              allocations: {
                none: {
                  status: { in: [...RESERVING_ALLOCATION_STATUSES] },
                },
              },
              ...(data.shipFromLocationId ? { locationId: data.shipFromLocationId } : {}),
            },
            include: {
              location: {
                include: {
                  capabilities: { where: { enabled: true } },
                  shippingLanesFrom: {
                    where: { active: true, laneType: "CUSTOMER_DELIVERY" },
                  },
                },
              },
            },
            orderBy: { createdAt: "asc" },
          });

          for (const itemUnit of itemUnits) {
            if (!locationMatchesMarket(itemUnit.location, destinationMarket)) continue;
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
                costCurrency: itemUnit.costCurrency,
                costSourceType: itemUnit.sourceType,
                costSourceId: itemUnit.sourceId,
                status: "PENDING",
              },
            });

            remainingToAllocate = remainingToAllocate.minus(1);
          }
        }

        if (remainingToAllocate.gt(0)) {
          throw new Error(
            data.shipFromLocationId ? "所选发货仓库存不足，无法完成售出" : "库存不足，无法完成售出"
          );
        }

        const remainingSellable = await getEffectiveSellableQuantity(
          tx,
          listing.storeId,
          sku.id,
          destinationMarket
        );
        if (remainingSellable.lte(0)) {
          await tx.listing.update({
            where: { id: listing.id },
            data: { status: "SOLD_OUT", delistedAt: new Date() },
          });
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

    const fulfillmentLocationIds = await getOrderFulfillmentLocationIds(saleResult.orderId);
    const fulfillmentLocationId =
      fulfillmentLocationIds.length === 1 ? fulfillmentLocationIds[0] : null;
    if (fulfillmentLocationId) {
      await ensureShipOrderTaskDispatch({
        organizationId: context.organizationId,
        storeId: saleResult.storeId,
        orderId: saleResult.orderId,
        orderNumber: saleResult.orderNumber,
        createdById: context.userId,
        locationId: fulfillmentLocationId,
        description: "Listing 快速售出后自动生成的打包/发货任务。",
      });
    } else {
      await createTaskIfMissing({
        organizationId: context.organizationId,
        storeId: saleResult.storeId,
        type: TASK_TYPE.SHIP_ORDER,
        title: `发货订单 ${saleResult.orderNumber}`,
        description: "订单包含多个来源仓库，需要先拆分或重新分配库存。",
        refType: "CUSTOMER_ORDER",
        refId: saleResult.orderId,
        createdById: context.userId,
        fulfillmentLocationId: null,
        metadata: { fulfillmentLocationIds, assignmentMode: "MULTI_LOCATION_MANUAL" },
      });
    }

    revalidateListingSurfaces();
    revalidatePath("/sales");
    revalidatePath(`/sales/${saleResult.orderId}`);
    revalidatePath("/inventory/lots");
    revalidatePath("/inventory/items");
    return actionSuccess({ orderId: saleResult.orderId });
  } catch (error) {
    return toActionFailure(error, "登记售出失败，请重试");
  }
}

export async function previewBundleSellEligibility(data: {
  lines: Array<{
    listingId: string;
    quantity?: string;
  }>;
  shippingCountry: string;
}) {
  try {
    const firstListingId = data.lines[0]?.listingId?.trim();
    if (!firstListingId) return actionFailure("请选择需要打包出售的商品");

    const listingOwner = await prisma.listing.findUnique({
      where: { id: firstListingId },
      select: { storeId: true },
    });
    if (!listingOwner) return actionFailure("上架记录不存在");

    const context = await requireUserContext({ storeId: listingOwner.storeId });
    const preview = await previewBundleFulfillment({
      storeId: context.activeStoreId,
      userId: context.userId,
      lines: data.lines,
      destinationMarket: data.shippingCountry,
    });
    return actionSuccess({ preview });
  } catch (error) {
    return toActionFailure(error, "无法校验共同发货仓，请重试");
  }
}

export async function bundleSellListings(data: {
  requestId: string;
  lines: Array<{
    listingId: string;
    quantity?: string;
    allocatedAmount: string;
  }>;
  totalPrice: string;
  platformFeeAmount?: string;
  platformFeeRate?: string;
  shippingFee?: string;
  shipFromLocationId: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress?: string;
  shippingCountry?: string;
  externalOrderNo?: string;
}) {
  const requestId = data.requestId?.trim();
  if (!requestId || !/^[a-zA-Z0-9_-]{8,80}$/.test(requestId)) {
    return actionFailure("打包请求标识无效，请关闭弹窗后重新发起");
  }
  const bundleOrderNumber = `BUNDLE-${requestId}`;
  let bundlePayloadHash: string | null = null;

  try {
    const previouslyCommittedOrder = await prisma.customerOrder.findUnique({
      where: { orderNumber: bundleOrderNumber },
      select: { id: true, storeId: true, requestPayloadHash: true },
    });
    if (previouslyCommittedOrder) {
      await requireUserContext({ storeId: previouslyCommittedOrder.storeId });
    }

    const listingIds = [...new Set(data.lines.map((line) => line.listingId))];
    if (listingIds.length < 2 || listingIds.length !== data.lines.length) {
      return actionFailure("打包出售至少需要选择 2 条不同的 Listing");
    }

    const totalPriceInput = parseDecimalInput(data.totalPrice, "打包成交价", {
      requiredPositive: true,
    });
    if (!totalPriceInput.success) return actionFailure(totalPriceInput.error);
    const totalPrice = totalPriceInput.value.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

    const platformFeeRateInput = parseOptionalDecimalInput(data.platformFeeRate, "平台费率", {
      nonNegative: true,
      max: 1,
    });
    if (!platformFeeRateInput.success) return actionFailure(platformFeeRateInput.error);

    const platformFeeAmountInput = parseOptionalDecimalInput(data.platformFeeAmount, "平台手续费", {
      nonNegative: true,
    });
    if (!platformFeeAmountInput.success) return actionFailure(platformFeeAmountInput.error);

    const shippingFeeInput = parseOptionalDecimalInput(data.shippingFee, "邮费", {
      nonNegative: true,
    });
    if (!shippingFeeInput.success) return actionFailure(shippingFeeInput.error);

    if (!data.shipFromLocationId?.trim()) {
      return actionFailure("请选择本次打包订单的发货仓");
    }

    const parsedLines = data.lines.map((line) => {
      const quantityResult = parseDecimalInput(line.quantity, "售出数量", {
        requiredPositive: true,
      });
      if (!quantityResult.success) throw new Error(quantityResult.error);
      const amountResult = parseDecimalInput(line.allocatedAmount, "商品分摊金额", {
        nonNegative: true,
      });
      if (!amountResult.success) throw new Error(amountResult.error);
      return {
        listingId: line.listingId,
        quantity: quantityResult.value.toDecimalPlaces(4, Decimal.ROUND_HALF_UP),
        allocatedAmount: amountResult.value.toDecimalPlaces(4, Decimal.ROUND_HALF_UP),
      };
    });

    const allocatedTotal = parsedLines.reduce(
      (sum, line) => sum.plus(line.allocatedAmount),
      new Decimal(0)
    );
    if (!allocatedTotal.eq(totalPrice)) {
      return actionFailure(
        `商品分摊合计必须等于打包成交价（当前相差 ${totalPrice.minus(allocatedTotal).toFixed(2)}）`
      );
    }

    bundlePayloadHash = createHash("sha256")
      .update(
        JSON.stringify({
          lines: parsedLines
            .map((line) => ({
              listingId: line.listingId,
              quantity: line.quantity.toFixed(4),
              allocatedAmount: line.allocatedAmount.toFixed(4),
            }))
            .sort((a, b) => a.listingId.localeCompare(b.listingId)),
          totalPrice: totalPrice.toFixed(4),
          platformFeeAmount: platformFeeAmountInput.value?.toString() ?? null,
          platformFeeRate: platformFeeRateInput.value?.toString() ?? null,
          shippingFee: shippingFeeInput.value?.toString() ?? null,
          shipFromLocationId: data.shipFromLocationId.trim(),
          shippingCountry: data.shippingCountry?.trim().toUpperCase() ?? null,
          customerName: data.customerName?.trim() ?? null,
          customerEmail: data.customerEmail?.trim() ?? null,
          customerPhone: data.customerPhone?.trim() ?? null,
          shippingAddress: data.shippingAddress?.trim() ?? null,
          externalOrderNo: data.externalOrderNo?.trim() ?? null,
        })
      )
      .digest("hex");

    if (previouslyCommittedOrder) {
      if (previouslyCommittedOrder.requestPayloadHash !== bundlePayloadHash) {
        return actionFailure("该打包请求已用不同内容创建过订单，请关闭弹窗后重新发起");
      }
      return actionSuccess({ orderId: previouslyCommittedOrder.id });
    }

    const listingOwner = await prisma.listing.findUnique({
      where: { id: listingIds[0] },
      select: { storeId: true },
    });
    if (!listingOwner) return actionFailure("上架记录不存在");
    const context = await requireUserContext({ storeId: listingOwner.storeId });

    const saleResult = await prisma.$transaction(async (tx) => {
      const listings = await tx.listing.findMany({
        where: { id: { in: listingIds }, storeId: context.activeStoreId },
        include: {
          platform: true,
          salesChannelAccount: {
            select: {
              id: true,
              organizationId: true,
              platformCode: true,
              status: true,
            },
          },
          resaleListings: { select: { id: true } },
          sku: true,
          itemUnit: {
            include: {
              sku: true,
              location: {
                include: {
                  capabilities: { where: { enabled: true } },
                  shippingLanesFrom: {
                    where: { active: true, laneType: "CUSTOMER_DELIVERY" },
                  },
                },
              },
            },
          },
        },
      });

      if (listings.length !== listingIds.length) {
        throw new Error("部分上架记录不存在或无权操作");
      }
      if (listings.some((listing) => listing.status !== "ACTIVE")) {
        throw new Error("只有在售 Listing 可以加入打包订单");
      }
      if (listings.some((listing) => listing.resaleListings.length > 0)) {
        throw new Error("所选商品包含代卖来源，当前打包流程尚不能生成逐项预留与结算");
      }

      const firstListing = listings.find((listing) => listing.id === listingIds[0])!;
      if (listings.some((listing) => listing.platformId !== firstListing.platformId)) {
        throw new Error("打包出售的商品必须来自同一销售平台");
      }
      if (
        listings.some(
          (listing) => listing.salesChannelAccountId !== firstListing.salesChannelAccountId
        )
      ) {
        throw new Error("打包出售的商品必须来自同一平台店铺账号");
      }
      const currency = firstListing.currency?.trim().toUpperCase();
      if (!currency || listings.some((listing) => !listing.currency?.trim())) {
        throw new Error("打包出售的每条 Listing 都必须设置明确币种");
      }
      if (listings.some((listing) => listing.currency?.trim().toUpperCase() !== currency)) {
        throw new Error("打包出售的商品币种必须一致");
      }

      const requestedDestination = data.shippingCountry?.trim().toUpperCase();
      if (!requestedDestination || !["CN", "JP", "US", "EU"].includes(requestedDestination)) {
        throw new Error("请选择明确的客户收货国家/地区");
      }
      const destinationMarket = requestedDestination as ReturnType<typeof inferMarketFromPlatform>;
      const inputByListingId = new Map(parsedLines.map((line) => [line.listingId, line]));

      const salesAccount = firstListing.salesChannelAccount;
      if (!salesAccount) {
        throw new Error("所选 Listing 尚未关联明确的销售店铺账号，请先修复账号归属");
      }
      if (salesAccount.status !== "ACTIVE") {
        throw new Error("当前销售账号已停用，不能创建打包订单");
      }
      if (salesAccount.platformCode.toUpperCase() !== firstListing.platform.code.toUpperCase()) {
        throw new Error("销售店铺账号与 Listing 平台不一致，请先修复账号关联");
      }
      const channelAccess = await tx.channelAccess.findUnique({
        where: {
          salesChannelAccountId_userId: {
            salesChannelAccountId: salesAccount.id,
            userId: context.userId,
          },
        },
        select: { id: true },
      });
      if (!channelAccess) {
        throw new Error("当前用户没有该销售店铺账号的操作权限");
      }

      const shipFromLocation = await tx.location.findUnique({
        where: { id: data.shipFromLocationId },
        include: {
          store: { select: { organizationId: true } },
          capabilities: { where: { enabled: true }, select: { code: true } },
          shippingLanesFrom: {
            where: { active: true, laneType: "CUSTOMER_DELIVERY" },
            select: { destinationCountry: true },
          },
        },
      });
      if (!shipFromLocation || !shipFromLocation.isSellableDefault) {
        throw new Error("所选共同仓位不存在或当前不可发货");
      }
      if (
        !shipFromLocation.capabilities.some(
          (capability) => capability.code === "DIRECT_FULFILLMENT"
        )
      ) {
        throw new Error("所选共同仓位未启用订单发货能力");
      }
      if (
        destinationMarket !== "GLOBAL" &&
        !shipFromLocation.shippingLanesFrom.some(
          (lane) =>
            lane.destinationCountry === destinationMarket || lane.destinationCountry === "GLOBAL"
        )
      ) {
        throw new Error("所选共同仓位没有到客户目的地的有效配送线路");
      }

      const sellerOrganizationId = salesAccount.organizationId;
      const operatorOrganizationId =
        shipFromLocation.operatorOrganizationId ?? shipFromLocation.store.organizationId;
      if (!operatorOrganizationId) {
        throw new Error("所选仓位尚未绑定运营组织，不能创建发货任务");
      }
      const sellerInventoryPoolIds = new Set(
        (
          await tx.inventoryPool.findMany({
            where: { organizationId: sellerOrganizationId, status: "ACTIVE" },
            select: { id: true },
          })
        ).map((pool) => pool.id)
      );
      if (sellerInventoryPoolIds.size === 0) {
        throw new Error("销售组织没有可用库存池，请先完成库存归属配置");
      }
      const userInventoryPoolIds = new Set(context.inventoryPoolIds);
      let fulfillmentAgreements: Array<{
        inventoryPoolId: string | null;
        locationId: string | null;
        serviceTypes: unknown;
      }> = [];
      if (sellerOrganizationId !== operatorOrganizationId) {
        const connection = await tx.organizationConnection.findFirst({
          where: {
            pairKey: [sellerOrganizationId, operatorOrganizationId].sort().join(":"),
            status: "ACTIVE",
          },
          select: { id: true },
        });
        if (!connection) {
          throw new Error("销售账号所属组织与仓库运营方之间没有有效合作关系");
        }

        fulfillmentAgreements = await tx.serviceAgreement.findMany({
          where: {
            clientOrganizationId: sellerOrganizationId,
            providerOrganizationId: operatorOrganizationId,
            status: "ACTIVE",
            AND: [
              { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: new Date() } }] },
              { OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }] },
            ],
          },
          select: { inventoryPoolId: true, locationId: true, serviceTypes: true },
        });
        const locationCovered = fulfillmentAgreements.some((agreement) => {
          const serviceTypes = Array.isArray(agreement.serviceTypes)
            ? agreement.serviceTypes.map(String)
            : [];
          return (
            serviceTypes.includes("FULFILLMENT") &&
            (!agreement.locationId || agreement.locationId === shipFromLocation.id)
          );
        });
        if (!locationCovered) {
          throw new Error("仓库运营方没有覆盖所选仓位的有效代发协议");
        }
        const activeWarehouseFulfiller = await tx.locationFulfiller.findFirst({
          where: {
            organizationId: operatorOrganizationId,
            locationId: shipFromLocation.id,
            status: "ACTIVE",
            userId: { not: null },
            role: { in: ["MANAGER", "OPERATOR", "BACKUP"] },
          },
          select: { id: true },
        });
        if (!activeWarehouseFulfiller) {
          throw new Error("合作仓尚无可领取发货任务的有效仓库协作者");
        }
      }
      const inventoryPoolIsAuthorized = (inventoryPoolId: string | null) =>
        Boolean(
          inventoryPoolId &&
          sellerInventoryPoolIds.has(inventoryPoolId) &&
          userInventoryPoolIds.has(inventoryPoolId)
        ) &&
        (sellerOrganizationId === operatorOrganizationId ||
          fulfillmentAgreements.some((agreement) => {
            const serviceTypes = Array.isArray(agreement.serviceTypes)
              ? agreement.serviceTypes.map(String)
              : [];
            return (
              serviceTypes.includes("FULFILLMENT") &&
              (!agreement.locationId || agreement.locationId === shipFromLocation.id) &&
              (!agreement.inventoryPoolId || agreement.inventoryPoolId === inventoryPoolId)
            );
          }));

      const skuIds = [
        ...new Set(listings.map((listing) => listing.skuId || listing.itemUnit?.skuId)),
      ]
        .filter((skuId): skuId is string => Boolean(skuId))
        .sort();
      for (const skuId of skuIds) {
        await tx.$queryRaw`SELECT "id" FROM "skus" WHERE "id" = ${skuId} FOR UPDATE`;
      }

      const defaultFeeRate = firstListing.feeRateOverride
        ? new Decimal(firstListing.feeRateOverride.toString())
        : firstListing.platform.defaultFeeRate
          ? new Decimal(firstListing.platform.defaultFeeRate.toString())
          : new Decimal(0);
      const effectiveFeeRate = platformFeeRateInput.value ?? defaultFeeRate;
      const platformFeeAmount = platformFeeAmountInput.value;
      // The combined parcel can have different dimensions, so a per-listing
      // default must never silently become the bundle's shipping cost.
      const shippingFee = shippingFeeInput.value ?? new Decimal(0);

      const customerOrder = await tx.customerOrder.create({
        data: {
          storeId: firstListing.storeId,
          salesChannelAccountId: firstListing.salesChannelAccountId,
          requestPayloadHash: bundlePayloadHash,
          orderNumber: bundleOrderNumber,
          platformId: firstListing.platformId,
          externalOrderNo: data.externalOrderNo?.trim() || undefined,
          customerName: data.customerName?.trim() || "散客",
          customerEmail: data.customerEmail?.trim() || undefined,
          customerPhone: data.customerPhone?.trim() || undefined,
          shippingAddress: data.shippingAddress?.trim() || undefined,
          shippingCountry: destinationMarket === "UNKNOWN" ? undefined : destinationMarket,
          orderDate: new Date(),
          currency,
          subtotal: totalPrice.toFixed(4),
          totalPaid: totalPrice.toFixed(4),
          platformFee: (platformFeeAmount ?? totalPrice.mul(effectiveFeeRate)).toFixed(4),
          shippingFee: shippingFee.toFixed(4),
          shippingFeeStatus: shippingFeeInput.value === null ? "PENDING" : "ESTIMATED",
          orderStatus: "CONFIRMED",
          confirmedAt: new Date(),
        },
      });

      let inventoryCost = new Decimal(0);
      const exactItemUnitIdsInBundle = new Set(
        listings.flatMap((listing) =>
          listing.listingType === "ITEM_UNIT" && listing.itemUnitId ? [listing.itemUnitId] : []
        )
      );
      for (const listingId of listingIds) {
        const listing = listings.find((candidate) => candidate.id === listingId)!;
        const input = inputByListingId.get(listingId)!;
        const sku = listing.sku || listing.itemUnit?.sku;
        if (!sku) throw new Error("上架记录没有关联 SKU");

        const quantity = listing.listingType === "ITEM_UNIT" ? new Decimal(1) : input.quantity;
        const effectiveSellable = await getEffectiveSellableQuantity(
          tx,
          listing.storeId,
          sku.id,
          destinationMarket
        );
        if (quantity.gt(effectiveSellable)) {
          throw new Error(`${sku.name} 可售库存不足（部分库存可能已被预留）`);
        }

        const orderLine = await tx.orderLine.create({
          data: {
            orderId: customerOrder.id,
            skuId: sku.id,
            quantity: quantity.toFixed(4),
            unitPrice: input.allocatedAmount.div(quantity).toFixed(4),
            lineAmount: input.allocatedAmount.toFixed(4),
            supplyType: "FROM_STOCK",
            supplyStatus: "READY_TO_SHIP",
          },
        });

        if (listing.listingType === "ITEM_UNIT") {
          if (!listing.itemUnit) {
            throw new Error(`${sku.name} 没有关联可追踪单件库存`);
          }
          await tx.$queryRaw`SELECT "id" FROM "item_units" WHERE "id" = ${listing.itemUnit.id} FOR UPDATE`;
          const freshItemUnit = await tx.itemUnit.findUnique({
            where: { id: listing.itemUnit.id },
          });
          if (!freshItemUnit || !inventoryPoolIsAuthorized(freshItemUnit.inventoryPoolId)) {
            throw new Error(`${sku.name} 的库存不属于销售组织，必须通过代卖预留与结算流程`);
          }
          if (
            freshItemUnit.status !== "AVAILABLE" ||
            freshItemUnit.costStatus !== "CONFIRMED" ||
            freshItemUnit.locationId !== data.shipFromLocationId ||
            !locationMatchesMarket(listing.itemUnit.location, destinationMarket)
          ) {
            throw new Error(`${sku.name} 不在所选发货仓或已不可售`);
          }
          const [reservedByOrder, reservedByFulfillment] = await Promise.all([
            tx.orderAllocation.findFirst({
              where: {
                itemUnitId: freshItemUnit.id,
                status: { in: [...RESERVING_ALLOCATION_STATUSES] },
              },
              select: { id: true },
            }),
            tx.fulfillmentInventoryAllocation.findFirst({
              where: { itemUnitId: freshItemUnit.id, status: "ALLOCATED" },
              select: { id: true },
            }),
          ]);
          if (reservedByOrder || reservedByFulfillment) throw new Error(`${sku.name} 已被预留`);

          const unitCost = new Decimal(freshItemUnit.unitCost.toString());
          inventoryCost = inventoryCost.plus(unitCost);
          await tx.orderAllocation.create({
            data: {
              orderLineId: orderLine.id,
              allocationType: "ITEM_UNIT",
              itemUnitId: freshItemUnit.id,
              quantity: "1.0000",
              unitCost: unitCost.toFixed(4),
              costAmount: unitCost.toFixed(4),
              costCurrency: freshItemUnit.costCurrency,
              costSourceType: freshItemUnit.sourceType,
              costSourceId: freshItemUnit.sourceId,
              status: "PENDING",
            },
          });
          await tx.listing.update({
            where: { id: listing.id },
            data: { status: "SOLD_OUT", delistedAt: new Date() },
          });
          continue;
        }

        let remainingToAllocate = quantity;
        const lotCandidates = await tx.inventoryLot.findMany({
          where: {
            storeId: listing.storeId,
            skuId: sku.id,
            status: "ACTIVE",
            costStatus: "CONFIRMED",
            locationId: data.shipFromLocationId,
            location: { isSellableDefault: true },
          },
          select: { id: true },
          orderBy: { receivedAt: "asc" },
        });

        for (const lotId of lotCandidates.map((lot) => lot.id).sort()) {
          await tx.$queryRaw`SELECT "id" FROM "inventory_lots" WHERE "id" = ${lotId} FOR UPDATE`;
        }
        const lots = await tx.inventoryLot.findMany({
          where: {
            id: { in: lotCandidates.map((lot) => lot.id) },
            storeId: listing.storeId,
            skuId: sku.id,
            status: "ACTIVE",
            costStatus: "CONFIRMED",
            locationId: data.shipFromLocationId,
            location: { isSellableDefault: true },
          },
          include: {
            location: {
              include: {
                capabilities: { where: { enabled: true } },
                shippingLanesFrom: {
                  where: { active: true, laneType: "CUSTOMER_DELIVERY" },
                },
              },
            },
          },
          orderBy: { receivedAt: "asc" },
        });

        for (const lot of lots) {
          if (!inventoryPoolIsAuthorized(lot.inventoryPoolId)) continue;
          if (!locationMatchesMarket(lot.location, destinationMarket)) continue;
          const ledgers = await tx.stockLedger.findMany({
            where: { entityType: "LOT", entityId: lot.id },
          });
          const available = ledgers.reduce(
            (sum, ledger) => sum.plus(new Decimal(ledger.deltaQty.toString())),
            new Decimal(0)
          );
          const [activeAllocations, fulfillmentAllocations] = await Promise.all([
            tx.orderAllocation.findMany({
              where: { lotId: lot.id, status: { in: [...RESERVING_ALLOCATION_STATUSES] } },
              select: { quantity: true },
            }),
            tx.fulfillmentInventoryAllocation.findMany({
              where: { lotId: lot.id, status: "ALLOCATED" },
              select: { quantity: true },
            }),
          ]);
          const reserved = [...activeAllocations, ...fulfillmentAllocations].reduce(
            (sum, allocation) => sum.plus(new Decimal(allocation.quantity.toString())),
            new Decimal(0)
          );
          const availableAfterReservations = available.minus(reserved);
          if (availableAfterReservations.lte(0) || remainingToAllocate.lte(0)) continue;

          const allocatedQty = Decimal.min(availableAfterReservations, remainingToAllocate);
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
              costCurrency: lot.costCurrency,
              costSourceType: lot.sourceType,
              costSourceId: lot.sourceId,
              status: "PENDING",
            },
          });
          remainingToAllocate = remainingToAllocate.minus(allocatedQty);
        }

        if (remainingToAllocate.gt(0)) {
          const fulfillmentReservedItemUnitIds = (
            await tx.fulfillmentInventoryAllocation.findMany({
              where: {
                status: "ALLOCATED",
                itemUnitId: { not: null },
                fulfillmentRequest: { storeId: listing.storeId },
              },
              select: { itemUnitId: true },
            })
          ).flatMap((allocation) => (allocation.itemUnitId ? [allocation.itemUnitId] : []));
          const excludedItemUnitIds = Array.from(
            new Set([...fulfillmentReservedItemUnitIds, ...exactItemUnitIdsInBundle])
          );
          const itemUnits = await tx.itemUnit.findMany({
            where: {
              storeId: listing.storeId,
              skuId: sku.id,
              ...(excludedItemUnitIds.length > 0 ? { id: { notIn: excludedItemUnitIds } } : {}),
              status: "AVAILABLE",
              costStatus: "CONFIRMED",
              locationId: data.shipFromLocationId,
              location: { isSellableDefault: true },
              allocations: { none: { status: { in: [...RESERVING_ALLOCATION_STATUSES] } } },
            },
            include: {
              location: {
                include: {
                  capabilities: { where: { enabled: true } },
                  shippingLanesFrom: {
                    where: { active: true, laneType: "CUSTOMER_DELIVERY" },
                  },
                },
              },
            },
            orderBy: { createdAt: "asc" },
          });
          for (const itemUnit of itemUnits) {
            await tx.$queryRaw`SELECT "id" FROM "item_units" WHERE "id" = ${itemUnit.id} FOR UPDATE`;
            const freshItemUnit = await tx.itemUnit.findUnique({ where: { id: itemUnit.id } });
            if (
              !freshItemUnit ||
              freshItemUnit.status !== "AVAILABLE" ||
              freshItemUnit.costStatus !== "CONFIRMED" ||
              freshItemUnit.locationId !== data.shipFromLocationId ||
              !inventoryPoolIsAuthorized(freshItemUnit.inventoryPoolId)
            ) {
              continue;
            }
            if (!locationMatchesMarket(itemUnit.location, destinationMarket)) continue;
            if (remainingToAllocate.lt(1)) break;
            const [reservedByOrder, reservedByFulfillment] = await Promise.all([
              tx.orderAllocation.findFirst({
                where: {
                  itemUnitId: freshItemUnit.id,
                  status: { in: [...RESERVING_ALLOCATION_STATUSES] },
                },
                select: { id: true },
              }),
              tx.fulfillmentInventoryAllocation.findFirst({
                where: { itemUnitId: freshItemUnit.id, status: "ALLOCATED" },
                select: { id: true },
              }),
            ]);
            if (reservedByOrder || reservedByFulfillment) continue;

            const unitCost = new Decimal(freshItemUnit.unitCost.toString());
            inventoryCost = inventoryCost.plus(unitCost);
            await tx.orderAllocation.create({
              data: {
                orderLineId: orderLine.id,
                allocationType: "ITEM_UNIT",
                itemUnitId: freshItemUnit.id,
                quantity: "1.0000",
                unitCost: unitCost.toFixed(4),
                costAmount: unitCost.toFixed(4),
                costCurrency: freshItemUnit.costCurrency,
                costSourceType: freshItemUnit.sourceType,
                costSourceId: freshItemUnit.sourceId,
                status: "PENDING",
              },
            });
            remainingToAllocate = remainingToAllocate.minus(1);
          }
        }
        if (remainingToAllocate.gt(0)) {
          throw new Error(`${sku.name} 在所选发货仓没有足量的销售组织自有且已授权库存`);
        }

        const remainingSellable = await getEffectiveSellableQuantity(
          tx,
          listing.storeId,
          sku.id,
          destinationMarket
        );
        if (remainingSellable.lte(0)) {
          await tx.listing.update({
            where: { id: listing.id },
            data: { status: "SOLD_OUT", delistedAt: new Date() },
          });
        }
      }

      const fees = computeOrderFees({
        subtotal: totalPrice,
        platformFeeRate: effectiveFeeRate,
        platformFeeAmount,
        shippingFee,
        inventoryCost,
      });
      await tx.customerOrder.update({
        where: { id: customerOrder.id },
        data: { netRevenue: feeResultToStrings(fees).netRevenue },
      });

      const shippingTask = await tx.task.create({
        data: {
          organizationId: operatorOrganizationId,
          storeId: customerOrder.storeId,
          type: TASK_TYPE.SHIP_ORDER,
          status: TASK_STATUS.OPEN,
          title: `发货订单 ${customerOrder.orderNumber}`,
          description: "Listing 打包出售后自动生成的一单打包/发货任务。",
          refType: "CUSTOMER_ORDER",
          refId: customerOrder.id,
          createdById: context.userId,
          fulfillmentLocationId: shipFromLocation.id,
          metadata: {
            assignmentMode: "WAREHOUSE_QUEUE",
            bundleSale: true,
            work: { code: "SHIP_ORDER", name: "订单发货", quantity: 1, unit: "单" },
          },
        },
      });
      await createShipOrderDispatch(tx, {
        organizationId: operatorOrganizationId,
        createdByUserId: context.userId,
        locationId: shipFromLocation.id,
        orderId: customerOrder.id,
        taskId: shippingTask.id,
        idempotencyKey: `ship-order:${customerOrder.id}:${shipFromLocation.id}`,
        metadata: { storeId: customerOrder.storeId, taskId: shippingTask.id, bundleSale: true },
      });

      return {
        orderId: customerOrder.id,
        orderNumber: customerOrder.orderNumber,
        storeId: customerOrder.storeId,
        operatorOrganizationId,
        fulfillmentLocationId: shipFromLocation.id,
        shippingTaskId: shippingTask.id,
      };
    });

    try {
      await notifyShipOrderQueue({
        taskId: saleResult.shippingTaskId,
        organizationId: saleResult.operatorOrganizationId,
        storeId: saleResult.storeId,
        locationId: saleResult.fulfillmentLocationId,
        orderId: saleResult.orderId,
        actorId: context.userId,
        title: `发货订单 ${saleResult.orderNumber}`,
      });
    } catch (notificationError) {
      console.error("Bundle sale committed but warehouse notification failed", notificationError);
    }

    revalidateListingSurfaces();
    revalidatePath("/sales");
    revalidatePath(`/sales/${saleResult.orderId}`);
    revalidatePath("/inventory/lots");
    revalidatePath("/inventory/items");
    return actionSuccess({ orderId: saleResult.orderId });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      const existingOrder = await prisma.customerOrder.findUnique({
        where: { orderNumber: bundleOrderNumber },
        select: { id: true, storeId: true, requestPayloadHash: true },
      });
      if (existingOrder) {
        await requireUserContext({ storeId: existingOrder.storeId });
        if (bundlePayloadHash && existingOrder.requestPayloadHash === bundlePayloadHash) {
          return actionSuccess({ orderId: existingOrder.id });
        }
        return actionFailure("该打包请求已用不同内容创建过订单，请关闭弹窗后重新发起");
      }
    }
    return toActionFailure(error, "打包出售失败，请重试");
  }
}

export async function batchCreateListings(data: {
  storeId: string;
  platformId: string;
  skuIds: string[];
  listedPrice?: string;
  currency?: string;
}) {
  try {
    const context = await requireUserContext({ storeId: data.storeId });
    const platform = await prisma.platform.findUnique({
      where: { id: data.platformId },
      include: { salesChannelAccount: { select: { id: true } } },
    });
    if (!platform || platform.storeId !== context.activeStoreId) {
      throw new Error("平台不存在或无权操作");
    }
    const listedPriceInput = parseOptionalDecimalInput(data.listedPrice, "Listing 价格", {
      requiredPositive: true,
    });
    if (!listedPriceInput.success) {
      return actionFailure(listedPriceInput.error);
    }

    await Promise.all(
      data.skuIds.map((skuId) =>
        assertListingHasSellableStock({
          storeId: context.activeStoreId,
          platformCode: platform.code,
          platformCountry: platform.country,
          platformName: platform.name,
          listingType: "SKU",
          skuId,
        })
      )
    );

    const existingActiveListings = await prisma.listing.findMany({
      where: {
        storeId: context.activeStoreId,
        platformId: data.platformId,
        listingType: "SKU",
        status: "ACTIVE",
        skuId: { in: data.skuIds },
      },
      select: { skuId: true },
    });
    if (existingActiveListings.length > 0) {
      return actionFailure(`已有 ${existingActiveListings.length} 个 SKU 在 ${platform.name} 上架`);
    }

    const referenceBySku = new Map<string, { price: Decimal; currency: string | null } | null>();
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
        const resolvedPrice = listedPriceInput.value ?? reference?.price ?? null;
        const resolvedCurrency =
          data.currency || reference?.currency || platform?.defaultCurrency || null;
        let estimatedNet: Decimal | null = null;
        if (resolvedPrice && platform) {
          const feeRate = platform.defaultFeeRate
            ? new Decimal(platform.defaultFeeRate)
            : new Decimal(0);
          estimatedNet = resolvedPrice.mul(new Decimal(1).minus(feeRate));
        }

        return prisma.listing.create({
          data: {
            storeId: context.activeStoreId,
            salesChannelAccountId: platform.salesChannelAccount?.id,
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
    return actionSuccess({ count: listings.length });
  } catch (error) {
    return toActionFailure(error, "批量上架失败，请重试");
  }
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

  const listedPriceInput = parseOptionalDecimalInput(data.listedPrice, "Listing 价格", {
    requiredPositive: true,
  });
  if (!listedPriceInput.success) {
    throw new Error(listedPriceInput.error);
  }

  const updateData: Record<string, unknown> = {
    status: data.status,
    currency: data.currency,
  };

  if (listedPriceInput.value) {
    updateData.listedPrice = listedPriceInput.value;
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

export async function updateListingAction(
  id: string,
  data: {
    listedPrice?: string;
    currency?: string;
    status?: string;
  }
) {
  try {
    const listing = await updateListing(id, data);
    return actionSuccess({ id: listing.id });
  } catch (error) {
    return toActionFailure(error, "更新 Listing 失败，请重试");
  }
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

export async function delistListingAction(id: string) {
  try {
    const listing = await delistListing(id);
    return actionSuccess({ id: listing.id });
  } catch (error) {
    return toActionFailure(error, "下架失败，请重试");
  }
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
