"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";

export interface CreateInventoryLotInput {
  storeId: string;
  skuId: string;
  locationId: string;
  quantity: string; // Decimal as string
  unitCost: string; // Decimal as string
  costCurrency: string;
  sourceType: "PURCHASE" | "SPLIT";
  sourceId: string;
  receivedAt: Date;
}

export interface UpdateInventoryLotInput {
  id: string;
  locationId?: string;
  status?: "ACTIVE" | "CONSUMED";
}

export async function getInventoryLots(storeId: string) {
  return await prisma.inventoryLot.findMany({
    where: { storeId },
    include: {
      sku: true,
      location: true,
    },
    orderBy: { receivedAt: "desc" },
  });
}

export async function getInventoryLotById(id: string) {
  const lot = await prisma.inventoryLot.findUnique({
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

  if (!lot) return null;

  // Fetch stock ledgers separately
  const stockLedgers = await prisma.stockLedger.findMany({
    where: {
      entityType: "LOT",
      entityId: id,
    },
    orderBy: { occurredAt: "desc" },
    take: 20,
  });

  return {
    ...lot,
    stockLedgers,
  };
}

export async function getAvailableQuantity(lotId: string): Promise<string> {
  const ledgers = await prisma.stockLedger.findMany({
    where: {
      entityType: "LOT",
      entityId: lotId,
    },
  });

  const total = ledgers.reduce((sum, ledger) => {
    return sum.plus(new Decimal(ledger.deltaQty.toString()));
  }, new Decimal(0));

  return total.toString();
}

export async function createInventoryLot(data: CreateInventoryLotInput) {
  const quantity = new Decimal(data.quantity);
  const unitCost = new Decimal(data.unitCost);

  // Create lot and stock ledger in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create the inventory lot
    const lot = await tx.inventoryLot.create({
      data: {
        storeId: data.storeId,
        skuId: data.skuId,
        locationId: data.locationId,
        unitCost: unitCost.toFixed(4),
        costCurrency: data.costCurrency,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        receivedAt: data.receivedAt,
        status: "ACTIVE",
      },
    });

    // Write to stock ledger (INBOUND)
    await tx.stockLedger.create({
      data: {
        storeId: data.storeId,
        occurredAt: data.receivedAt,
        entityType: "LOT",
        entityId: lot.id,
        locationId: data.locationId,
        deltaQty: quantity.toFixed(4),
        reason: "INBOUND_PURCHASE",
        refType: data.sourceType,
        refId: data.sourceId,
        meta: {
          unitCost: unitCost.toString(),
          currency: data.costCurrency,
        },
      },
    });

    return lot;
  });

  revalidatePath("/inventory/lots");
  return result;
}

export async function updateInventoryLot(data: UpdateInventoryLotInput) {
  const lot = await prisma.inventoryLot.update({
    where: { id: data.id },
    data: {
      locationId: data.locationId,
      status: data.status,
    },
  });

  revalidatePath("/inventory/lots");
  revalidatePath(`/inventory/lots/${data.id}`);
  return lot;
}

export async function deleteInventoryLot(id: string) {
  // Check if lot has any stock ledger entries besides the initial inbound
  const ledgerCount = await prisma.stockLedger.count({
    where: {
      entityType: "LOT",
      entityId: id,
    },
  });

  if (ledgerCount > 1) {
    throw new Error(
      "Cannot delete lot with transaction history. Set status to CONSUMED instead."
    );
  }

  // Delete in transaction (lot and its initial ledger entry)
  await prisma.$transaction(async (tx) => {
    await tx.stockLedger.deleteMany({
      where: {
        entityType: "LOT",
        entityId: id,
      },
    });

    await tx.inventoryLot.delete({
      where: { id },
    });
  });

  revalidatePath("/inventory/lots");
}
