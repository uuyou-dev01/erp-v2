"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export type LocationType = "WAREHOUSE" | "FORWARDER" | "PERSON" | "TRANSIT";

export interface CreateLocationInput {
  storeId: string;
  code?: string;
  name: string;
  type: LocationType;
  isSellableDefault?: boolean;
}

export interface UpdateLocationInput extends CreateLocationInput {
  id: string;
}

export async function getLocations(storeId: string) {
  return await prisma.location.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getLocationById(id: string) {
  return await prisma.location.findUnique({
    where: { id },
  });
}

export async function createLocation(data: CreateLocationInput) {
  const code = data.code?.trim() || (await generateLocationCode(data.storeId, data.type));

  const location = await prisma.location.create({
    data: {
      storeId: data.storeId,
      code,
      name: data.name,
      type: data.type,
      isSellableDefault: data.isSellableDefault ?? true,
    },
  });

  revalidatePath("/inventory/locations");
  return location;
}

async function generateLocationCode(storeId: string, type: LocationType) {
  const prefixMap: Record<LocationType, string> = {
    WAREHOUSE: "WH",
    FORWARDER: "FW",
    PERSON: "PR",
    TRANSIT: "TR",
  };
  const prefix = prefixMap[type];

  const existing = await prisma.location.findMany({
    where: {
      storeId,
      code: {
        startsWith: `${prefix}-`,
      },
    },
    select: { code: true },
  });

  const usedNumbers = new Set(
    existing
      .map((item) => item.code.match(new RegExp(`^${prefix}-(\\d+)$`))?.[1])
      .filter((n): n is string => !!n)
      .map((n) => Number.parseInt(n, 10))
      .filter((n) => Number.isInteger(n))
  );

  let serial = 1;
  while (usedNumbers.has(serial)) {
    serial += 1;
  }

  return `${prefix}-${String(serial).padStart(3, "0")}`;
}

export async function updateLocation(data: UpdateLocationInput) {
  const location = await prisma.location.update({
    where: { id: data.id },
    data: {
      code: data.code,
      name: data.name,
      type: data.type,
      isSellableDefault: data.isSellableDefault,
    },
  });

  revalidatePath("/inventory/locations");
  revalidatePath(`/inventory/locations/${data.id}`);
  return location;
}

export async function getLocationStats(locationId: string) {
  const [lots, items] = await Promise.all([
    prisma.inventoryLot.findMany({
      where: { locationId },
      include: { sku: true },
    }),
    prisma.itemUnit.findMany({
      where: { locationId },
      include: { sku: true },
    }),
  ]);

  const skuIds = new Set([
    ...lots.map((l) => l.skuId),
    ...items.map((i) => i.skuId),
  ]);

  const activeLotCount = lots.filter((lot) => lot.status === "ACTIVE").length;
  const availableItemCount = items.filter((item) => item.status === "AVAILABLE").length;
  const allocatedItemCount = items.filter((item) => item.status === "ALLOCATED").length;
  const consumedItemCount = items.filter((item) => item.status === "CONSUMED").length;

  const skuBreakdown: Array<{
    skuCode: string;
    skuName: string;
    activeLotCount: number;
    availableItemCount: number;
    allocatedItemCount: number;
    consumedItemCount: number;
  }> = [];

  for (const skuId of skuIds) {
    const lotForSku = lots.find((l) => l.skuId === skuId);
    const itemForSku = items.find((i) => i.skuId === skuId);
    const sku = lotForSku?.sku || itemForSku?.sku;
    if (!sku) continue;

    skuBreakdown.push({
      skuCode: sku.code,
      skuName: sku.name,
      activeLotCount: lots.filter(
        (lot) => lot.skuId === skuId && lot.status === "ACTIVE"
      ).length,
      availableItemCount: items.filter(
        (item) => item.skuId === skuId && item.status === "AVAILABLE"
      ).length,
      allocatedItemCount: items.filter(
        (item) => item.skuId === skuId && item.status === "ALLOCATED"
      ).length,
      consumedItemCount: items.filter(
        (item) => item.skuId === skuId && item.status === "CONSUMED"
      ).length,
    });
  }

  skuBreakdown.sort((a, b) => {
    const sellableA = a.activeLotCount + a.availableItemCount;
    const sellableB = b.activeLotCount + b.availableItemCount;
    return sellableB - sellableA;
  });

  return {
    skuCount: skuIds.size,
    activeLotCount,
    availableItemCount,
    allocatedItemCount,
    consumedItemCount,
    skuBreakdown,
  };
}

export async function deleteLocation(id: string, storeId: string) {
  const [lotCount, itemCount, ledgerCount] = await Promise.all([
    prisma.inventoryLot.count({ where: { locationId: id, storeId } }),
    prisma.itemUnit.count({ where: { locationId: id, storeId } }),
    prisma.stockLedger.count({ where: { locationId: id, storeId } }),
  ]);

  if (lotCount > 0 || itemCount > 0 || ledgerCount > 0) {
    throw new Error("该位置下仍有关联库存/流水，无法删除。请先清空库存并处理相关记录。");
  }

  await prisma.location.delete({
    where: { id },
  });

  revalidatePath("/inventory/locations");
}
