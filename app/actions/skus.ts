"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";

export interface CreateSKUInput {
  storeId: string;
  code: string;
  name: string;
  parentSkuId?: string | null;
  category?: string;
  brand?: string;
  attributes?: Record<string, unknown>;
  description?: string;
  imageUrl?: string;
}

export interface UpdateSKUInput extends CreateSKUInput {
  id: string;
}

export async function getSKUParentOptions(storeId: string, excludeId?: string) {
  return await prisma.sKU.findMany({
    where: {
      storeId,
      id: excludeId ? { not: excludeId } : undefined,
      parentSkuId: null,
    },
    select: {
      id: true,
      code: true,
      name: true,
      category: true,
      brand: true,
      _count: { select: { childSkus: true } },
    },
    orderBy: { code: "asc" },
  });
}

export async function getSKUs(storeId: string) {
  const skus = await prisma.sKU.findMany({
    where: { storeId },
    include: {
      parentSku: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      childSkus: {
        select: {
          id: true,
        },
      },
      inventoryLots: {
        select: {
          id: true,
          status: true,
        },
      },
      itemUnits: {
        select: {
          id: true,
          status: true,
        },
      },
      listings: {
        select: {
          status: true,
        },
      },
      _count: {
        select: {
          inventoryLots: true,
          itemUnits: true,
          listings: true,
          orderLines: true,
          purchaseLines: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const lotIds = skus.flatMap((sku) => sku.inventoryLots.map((lot) => lot.id));
  const ledgers =
    lotIds.length > 0
      ? await prisma.stockLedger.findMany({
          where: {
            entityType: "LOT",
            entityId: { in: lotIds },
          },
          select: {
            entityId: true,
            deltaQty: true,
          },
        })
      : [];

  const lotQuantityById = ledgers.reduce<Record<string, Decimal>>((acc, ledger) => {
    acc[ledger.entityId] = (acc[ledger.entityId] ?? new Decimal(0)).plus(
      new Decimal(ledger.deltaQty.toString())
    );
    return acc;
  }, {});

  return skus.map((sku) => {
    const availableLotQuantity = sku.inventoryLots.reduce((sum, lot) => {
      return sum.plus(lotQuantityById[lot.id] ?? new Decimal(0));
    }, new Decimal(0));
    const availableItemUnits = sku.itemUnits.filter((item) => item.status === "AVAILABLE").length;
    const activeListings = sku.listings.filter((listing) => listing.status === "ACTIVE").length;

    return {
      ...sku,
      businessSummary: {
        availableLotQuantity: availableLotQuantity.toString(),
        availableItemUnits,
        activeListings,
        purchaseLineCount: sku._count.purchaseLines,
        salesLineCount: sku._count.orderLines,
        hasAvailableStock: availableLotQuantity.gt(0) || availableItemUnits > 0,
      },
    };
  });
}

const VALID_SALES_STATUSES = ["CONFIRMED", "SHIPPED", "DELIVERED"];

function computeSalesMetrics(
  lines: Array<{
    quantity: { toString(): string };
    lineAmount: { toString(): string };
    orderId: string;
    order: {
      subtotal: { toString(): string };
      platformFee: { toString(): string };
      shippingFee: { toString(): string };
    };
    allocations: Array<{ costAmount: { toString(): string } }>;
  }>
) {
  let totalQuantity = new Decimal(0);
  let totalRevenue = new Decimal(0);
  let totalPlatformFee = new Decimal(0);
  let totalShippingFee = new Decimal(0);
  let totalInventoryCost = new Decimal(0);
  const unitPrices: Decimal[] = [];
  const orderIds = new Set<string>();

  for (const line of lines) {
    const qty = new Decimal(line.quantity.toString());
    const lineAmt = new Decimal(line.lineAmount.toString());
    totalQuantity = totalQuantity.plus(qty);
    totalRevenue = totalRevenue.plus(lineAmt);
    orderIds.add(line.orderId);

    if (qty.gt(0)) {
      unitPrices.push(lineAmt.div(qty));
    }

    const orderSubtotal = new Decimal(line.order.subtotal.toString());
    if (orderSubtotal.gt(0)) {
      const share = lineAmt.div(orderSubtotal);
      totalPlatformFee = totalPlatformFee.plus(
        new Decimal(line.order.platformFee.toString()).mul(share)
      );
      totalShippingFee = totalShippingFee.plus(
        new Decimal(line.order.shippingFee.toString()).mul(share)
      );
    }

    const lineCost = line.allocations.reduce(
      (sum, alloc) => sum.plus(new Decimal(alloc.costAmount.toString())),
      new Decimal(0)
    );
    totalInventoryCost = totalInventoryCost.plus(lineCost);
  }

  const grossProfit = totalRevenue
    .minus(totalPlatformFee)
    .minus(totalShippingFee)
    .minus(totalInventoryCost);
  const profitRate = totalRevenue.gt(0)
    ? grossProfit.div(totalRevenue).mul(100)
    : new Decimal(0);
  const avgUnitProfit = totalQuantity.gt(0)
    ? grossProfit.div(totalQuantity)
    : new Decimal(0);

  return {
    totalQuantity: totalQuantity.toString(),
    totalRevenue: totalRevenue.toFixed(2),
    orderCount: orderIds.size,
    totalPlatformFee: totalPlatformFee.toFixed(2),
    totalShippingFee: totalShippingFee.toFixed(2),
    totalInventoryCost: totalInventoryCost.toFixed(2),
    grossProfit: grossProfit.toFixed(2),
    profitRate: profitRate.toFixed(1),
    avgUnitProfit: avgUnitProfit.toFixed(2),
    avgUnitPrice:
      unitPrices.length > 0
        ? unitPrices
            .reduce((s, p) => s.plus(p), new Decimal(0))
            .div(unitPrices.length)
            .toFixed(2)
        : null,
    maxUnitPrice:
      unitPrices.length > 0 ? Decimal.max(...unitPrices).toFixed(2) : null,
    minUnitPrice:
      unitPrices.length > 0 ? Decimal.min(...unitPrices).toFixed(2) : null,
  };
}

export async function getSKUById(id: string) {
  const sku = await prisma.sKU.findUnique({
    where: { id },
    include: {
      parentSku: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      childSkus: {
        select: {
          id: true,
          code: true,
          name: true,
        },
        orderBy: { code: "asc" },
      },
      listings: {
        include: {
          platform: true,
        },
        orderBy: { listedAt: "desc" },
      },
      orderLines: {
        include: {
          order: {
            include: {
              platform: true,
            },
          },
          allocations: {
            select: {
              costAmount: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      purchaseLines: {
        include: {
          purchaseOrder: true,
        },
        orderBy: { createdAt: "desc" },
      },
      inventoryLots: {
        include: {
          location: true,
        },
      },
      itemUnits: {
        include: {
          location: true,
        },
      },
    },
  });

  if (!sku) return null;

  const lotIds = sku.inventoryLots.map((lot) => lot.id);
  const lotLedgers =
    lotIds.length > 0
      ? await prisma.stockLedger.findMany({
          where: {
            entityType: "LOT",
            entityId: { in: lotIds },
          },
        })
      : [];

  const lotQuantityById = lotLedgers.reduce<Record<string, Decimal>>((acc, ledger) => {
    acc[ledger.entityId] = (acc[ledger.entityId] ?? new Decimal(0)).plus(
      new Decimal(ledger.deltaQty.toString())
    );
    return acc;
  }, {});

  const inventoryLots = sku.inventoryLots.map((lot) => ({
    ...lot,
    availableQuantity: (lotQuantityById[lot.id] ?? new Decimal(0)).toString(),
  }));
  const availableLotQuantity = inventoryLots.reduce(
    (sum, lot) => sum.plus(new Decimal(lot.availableQuantity)),
    new Decimal(0)
  );
  const availableItemUnits = sku.itemUnits.filter((item) => item.status === "AVAILABLE").length;
  const activeListings = sku.listings.filter((listing) => listing.status === "ACTIVE").length;

  // --- Performance metrics ---
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const confirmedLines = sku.orderLines.filter((line) =>
    VALID_SALES_STATUSES.includes(line.order.orderStatus)
  );
  const lines30d = confirmedLines.filter(
    (line) => line.order.orderDate >= thirtyDaysAgo
  );
  const lines90d = confirmedLines.filter(
    (line) => line.order.orderDate >= ninetyDaysAgo
  );

  const metrics30d = computeSalesMetrics(lines30d);
  const metrics90d = computeSalesMetrics(lines90d);
  const metricsAllTime = computeSalesMetrics(confirmedLines);

  const latestConfirmedLine = confirmedLines[0];
  const latestUnitPrice =
    latestConfirmedLine &&
    new Decimal(latestConfirmedLine.quantity.toString()).gt(0)
      ? new Decimal(latestConfirmedLine.lineAmount.toString())
          .div(new Decimal(latestConfirmedLine.quantity.toString()))
          .toFixed(2)
      : null;
  const latestSoldAt = latestConfirmedLine?.order.orderDate ?? null;
  const salesCurrency = latestConfirmedLine?.order.currency ?? null;

  const activeListingPrices = sku.listings
    .filter((l) => l.status === "ACTIVE" && l.listedPrice)
    .map((l) => new Decimal(l.listedPrice!.toString()));
  const listingPriceRange =
    activeListingPrices.length > 0
      ? {
          min: Decimal.min(...activeListingPrices).toFixed(2),
          max: Decimal.max(...activeListingPrices).toFixed(2),
          currency:
            sku.listings.find((l) => l.status === "ACTIVE")?.currency ?? null,
        }
      : null;

  return {
    ...sku,
    inventoryLots,
    businessSummary: {
      availableLotQuantity: availableLotQuantity.toString(),
      availableItemUnits,
      activeListings,
      purchaseLineCount: sku.purchaseLines.length,
      salesLineCount: sku.orderLines.length,
      hasAvailableStock: availableLotQuantity.gt(0) || availableItemUnits > 0,
    },
    performanceMetrics: {
      last30d: metrics30d,
      last90d: metrics90d,
      allTime: metricsAllTime,
      latestUnitPrice,
      latestSoldAt: latestSoldAt?.toISOString() ?? null,
      salesCurrency,
      listingPriceRange,
    },
  };
}

export async function createSKU(data: CreateSKUInput) {
  const sku = await prisma.sKU.create({
    data: {
      storeId: data.storeId,
      code: data.code,
      name: data.name,
      parentSkuId: data.parentSkuId || null,
      category: data.category,
      brand: data.brand,
      attributes: data.attributes ? (data.attributes as never) : {},
      description: data.description,
      imageUrl: data.imageUrl,
    },
  });

  revalidatePath("/inventory/skus");
  return sku;
}

export async function updateSKU(data: UpdateSKUInput) {
  const sku = await prisma.sKU.update({
    where: { id: data.id },
    data: {
      code: data.code,
      name: data.name,
      parentSkuId: data.parentSkuId === data.id ? null : data.parentSkuId || null,
      category: data.category,
      brand: data.brand,
      attributes: data.attributes ? (data.attributes as never) : {},
      description: data.description,
      imageUrl: data.imageUrl,
    },
  });

  revalidatePath("/inventory/skus");
  revalidatePath(`/inventory/skus/${data.id}`);
  return sku;
}

export async function deleteSKU(id: string) {
  const related = await prisma.sKU.findUnique({
    where: { id },
    select: {
      _count: {
        select: {
          inventoryLots: true,
          itemUnits: true,
          listings: true,
          orderLines: true,
          purchaseLines: true,
        },
      },
    },
  });

  if (!related) {
    throw new Error("SKU不存在或已被删除");
  }

  const relationCount =
    related._count.inventoryLots +
    related._count.itemUnits +
    related._count.listings +
    related._count.orderLines +
    related._count.purchaseLines;

  if (relationCount > 0) {
    throw new Error("该SKU已有库存、采购、销售或刊登记录，不能直接删除。请先处理关联业务数据。");
  }

  await prisma.sKU.delete({
    where: { id },
  });

  revalidatePath("/inventory/skus");
}
