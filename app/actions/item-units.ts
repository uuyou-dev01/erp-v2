"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { stringToDecimal } from "@/lib/decimal";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { createItemUnitWithIdentity } from "@/lib/application/item-unit-identity";
import { assertOperationalSku } from "@/lib/application/sku-operability";

/**
 * Get all item units for a store
 */
export async function getItemUnits(storeId: string) {
  const items = await prisma.itemUnit.findMany({
    where: { storeId },
    include: {
      sku: {
        include: {
          parentSku: { select: { code: true, name: true } },
        },
      },
      location: true,
      listings: {
        where: { status: "ACTIVE" },
        select: { id: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return items.map((item) => ({
    ...item,
    unitCost: item.unitCost.toString(),
    photoCount: Array.isArray(item.photos) ? item.photos.length : 0,
    activeListingCount: item.listings.length,
  }));
}

/**
 * Get item unit by ID with full details
 */
export async function getItemUnitById(id: string) {
  const item = await prisma.itemUnit.findUnique({
    where: { id },
    include: {
      sku: true,
      location: true,
      listings: {
        include: { platform: true },
        orderBy: { listedAt: "desc" },
      },
      allocations: {
        include: {
          orderLine: {
            include: {
              order: true,
            },
          },
        },
      },
    },
  });

  if (!item) return null;

  const unitCost =
    typeof item.unitCost === "object" && item.unitCost !== null && "toString" in item.unitCost
      ? item.unitCost.toString()
      : String(item.unitCost);

  // Get ledger entries separately
  const ledgerEntries = await prisma.stockLedger.findMany({
    where: {
      entityType: "ITEM_UNIT",
      entityId: id,
    },
    orderBy: { occurredAt: "desc" },
  });

  return {
    ...item,
    unitCost,
    listings: item.listings.map((listing) => ({
      ...listing,
      listedPrice: listing.listedPrice?.toString() ?? null,
      feeRateOverride: listing.feeRateOverride?.toString() ?? null,
      shippingFeeOverride: listing.shippingFeeOverride?.toString() ?? null,
      estimatedNet: listing.estimatedNet?.toString() ?? null,
    })),
    ledgerEntries: ledgerEntries.map((entry) => ({
      ...entry,
      deltaQty: entry.deltaQty.toString(),
    })),
  };
}

/**
 * Create a new item unit
 */
export async function createItemUnit(data: {
  storeId: string;
  skuId: string;
  locationId: string;
  unitCost: string;
  costCurrency: string;
  conditionGrade?: string;
  photos?: string[];
  ownerId?: string;
  holderId?: string;
  notes?: string;
}) {
  await assertOperationalSku(prisma, {
    storeId: data.storeId,
    skuId: data.skuId,
    actionLabel: "创建单件库存",
  });

  const unitCostDecimal = stringToDecimal(data.unitCost);

  const item = await prisma.$transaction(async (tx) => {
    // Create item unit
    const newItem = await createItemUnitWithIdentity(tx, {
      storeId: data.storeId,
      data: {
        storeId: data.storeId,
        skuId: data.skuId,
        locationId: data.locationId,
        unitCost: unitCostDecimal,
        costCurrency: data.costCurrency,
        conditionGrade: data.conditionGrade,
        photos: data.photos || [],
        ownerId: data.ownerId,
        holderId: data.holderId,
        notes: data.notes,
        sourceType: "MANUAL",
        sourceId: "manual",
        status: "AVAILABLE",
      },
    });

    // Write to stock ledger (INBOUND_PURCHASE)
    await tx.stockLedger.create({
      data: {
        storeId: data.storeId,
        occurredAt: new Date(),
        entityType: "ITEM_UNIT",
        entityId: newItem.id,
        locationId: data.locationId,
        deltaQty: stringToDecimal("1"),
        reason: "INBOUND_PURCHASE",
        refType: "MANUAL",
        refId: newItem.id,
      },
    });

    return newItem;
  });

  revalidatePath("/inventory/items");
  return item;
}

export async function createItemUnitAction(data: {
  storeId: string;
  skuId: string;
  locationId: string;
  unitCost: string;
  costCurrency: string;
  conditionGrade?: string;
  photos?: string[];
  ownerId?: string;
  holderId?: string;
  notes?: string;
}) {
  try {
    const item = await createItemUnit(data);
    return actionSuccess({ id: item.id });
  } catch (error) {
    return toActionFailure(error, "创建单品失败，请重试");
  }
}

/**
 * Update item unit
 */
export async function updateItemUnit(
  id: string,
  data: {
    conditionGrade?: string;
    photos?: string[];
    ownerId?: string;
    holderId?: string;
    notes?: string;
  }
) {
  const existing = await prisma.itemUnit.findUnique({
    where: { id },
    include: {
      allocations: {
        where: { status: { in: ["PENDING", "ALLOCATED", "SHIPPED"] } },
      },
    },
  });

  if (!existing) {
    throw new Error("单品不存在");
  }

  if (existing.status !== "AVAILABLE" || existing.allocations.length > 0) {
    throw new Error("仅可用且未分配订单的单品可以编辑");
  }

  const item = await prisma.itemUnit.update({
    where: { id },
    data: {
      conditionGrade: data.conditionGrade,
      photos: data.photos,
      ownerId: data.ownerId,
      holderId: data.holderId,
      notes: data.notes,
    },
  });

  revalidatePath("/inventory/items");
  revalidatePath(`/inventory/items/${id}`);
  return item;
}

export async function updateItemUnitAction(
  id: string,
  data: {
    conditionGrade?: string;
    photos?: string[];
    ownerId?: string;
    holderId?: string;
    notes?: string;
  }
) {
  try {
    const item = await updateItemUnit(id, data);
    return actionSuccess({ id: item.id });
  } catch (error) {
    return toActionFailure(error, "保存单品失败，请重试");
  }
}

/**
 * Delete item unit when it has no blocking relations.
 */
export async function deleteItemUnit(id: string, storeId: string) {
  const item = await prisma.itemUnit.findFirst({
    where: { id, storeId },
    include: {
      allocations: {
        where: { status: { in: ["PENDING", "ALLOCATED", "SHIPPED"] } },
      },
      listings: { where: { status: "ACTIVE" } },
    },
  });

  if (!item) {
    throw new Error("单品不存在或无权删除");
  }

  if (item.status === "ALLOCATED") {
    throw new Error("该单品状态为已分配，无法删除。请先解除订单分配。");
  }

  if (item.allocations.length > 0) {
    throw new Error("该单品仍有关联订单分配，无法删除。");
  }

  if (item.listings.length > 0) {
    throw new Error("该单品仍有上架中的记录，请先下架后再删除。");
  }

  await prisma.$transaction(async (tx) => {
    await tx.listing.deleteMany({ where: { itemUnitId: id, storeId } });
    await tx.stockLedger.deleteMany({
      where: { storeId, entityType: "ITEM_UNIT", entityId: id },
    });
    await tx.itemUnit.delete({ where: { id } });
  });

  revalidatePath("/inventory/items");
  revalidatePath(`/inventory/items/${id}`);
  revalidatePath("/inventory/sellable");
}

export async function deleteItemUnitAction(id: string, storeId: string) {
  try {
    await deleteItemUnit(id, storeId);
    return actionSuccess({ id });
  } catch (error) {
    return toActionFailure(error, "删除单品失败，请重试");
  }
}

/**
 * Check if item unit is available (not allocated or consumed)
 */
export async function isItemUnitAvailable(id: string): Promise<boolean> {
  const item = await prisma.itemUnit.findUnique({
    where: { id },
    include: {
      allocations: {
        where: {
          status: {
            in: ["PENDING", "ALLOCATED"],
          },
        },
      },
    },
  });

  if (!item) return false;
  if (item.status !== "AVAILABLE") return false;
  if (item.allocations.length > 0) return false;

  return true;
}

export async function approveReturnInspection(itemUnitId: string, note?: string) {
  const item = await prisma.itemUnit.findUnique({ where: { id: itemUnitId } });
  if (!item) throw new Error("单品不存在");
  if (item.status !== "RETURN_CHECK") {
    throw new Error("只有退货待检单品可以检验放行");
  }

  const inspectionNote = note?.trim();
  const mergedNotes = [item.notes, inspectionNote ? `检验放行：${inspectionNote}` : "检验放行"]
    .filter(Boolean)
    .join("\n");

  await prisma.itemUnit.update({
    where: { id: itemUnitId },
    data: {
      status: "AVAILABLE",
      notes: mergedNotes || undefined,
    },
  });

  revalidatePath("/inventory/items");
  revalidatePath(`/inventory/items/${itemUnitId}`);
  revalidatePath("/inventory/sellable");
  revalidatePath("/workbench");
}
