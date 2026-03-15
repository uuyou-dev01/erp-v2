"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { stringToDecimal } from "@/lib/decimal";

/**
 * Get all item units for a store
 */
export async function getItemUnits(storeId: string) {
  const items = await prisma.itemUnit.findMany({
    where: { storeId },
    include: {
      sku: true,
      location: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return items;
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
    ledgerEntries,
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
  const unitCostDecimal = stringToDecimal(data.unitCost);

  const item = await prisma.$transaction(async (tx) => {
    // Create item unit
    const newItem = await tx.itemUnit.create({
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

/**
 * Delete item unit (soft delete by setting status to CONSUMED)
 */
export async function deleteItemUnit(id: string) {
  const item = await prisma.itemUnit.update({
    where: { id },
    data: { status: "CONSUMED" },
  });

  revalidatePath("/inventory/items");
  return item;
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
