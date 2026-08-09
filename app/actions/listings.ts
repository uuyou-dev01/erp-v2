"use server";

import { randomUUID } from "crypto";
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
import { completeTasksForRef, createTaskIfMissing, TASK_TYPE } from "@/lib/application/tasks";
import { RESERVING_ALLOCATION_STATUSES } from "@/lib/application/order-allocation";
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
  revalidatePath("/reports/team");
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

      let inventoryCost = new Decimal(0);

      // Direct sales and supply-offer orders draw from the same physical pool.
      // Lock the SKU row so they cannot both pass availability checks concurrently.
      await tx.$queryRaw`SELECT "id" FROM "skus" WHERE "id" = ${sku.id} FOR UPDATE`;
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
          !listing.itemUnit ||
          listing.itemUnit.status !== "AVAILABLE" ||
          listing.itemUnit.costStatus !== "CONFIRMED" ||
          !locationMatchesMarket(listing.itemUnit.location, destinationMarket)
        ) {
          throw new Error("关联单品已不可售");
        }
        const reservedItemUnit = await tx.orderAllocation.findFirst({
          where: {
            itemUnitId: listing.itemUnit.id,
            status: { in: [...RESERVING_ALLOCATION_STATUSES] },
          },
          select: { id: true },
        });
        if (reservedItemUnit) {
          throw new Error("关联单品已被预留");
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
            costCurrency: listing.itemUnit.costCurrency,
            costSourceType: listing.itemUnit.sourceType,
            costSourceId: listing.itemUnit.sourceId,
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
            costStatus: "CONFIRMED",
            location: { isSellableDefault: true },
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
          const itemUnits = await tx.itemUnit.findMany({
            where: {
              storeId: listing.storeId,
              skuId: sku.id,
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
    return actionSuccess({ orderId: saleResult.orderId });
  } catch (error) {
    return toActionFailure(error, "登记售出失败，请重试");
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
