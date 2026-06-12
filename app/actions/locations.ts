"use server";

import { prisma } from "@/lib/prisma";
import { isValidLocationRegion } from "@/lib/inventory/location-regions";
import { revalidatePath } from "next/cache";
import { requireUserContext } from "@/lib/auth/user-context";

export type LocationType = "WAREHOUSE" | "FORWARDER" | "PERSON" | "TRANSIT";

export interface CreateLocationInput {
  storeId: string;
  code?: string;
  name: string;
  region: string;
  type: LocationType;
  isSellableDefault?: boolean;
}

function normalizeRegion(region: string): string {
  const value = region.trim();
  if (!value) {
    throw new Error("请选择地区");
  }
  if (!isValidLocationRegion(value)) {
    throw new Error("地区无效，请重新选择");
  }
  return value;
}

export interface UpdateLocationInput extends CreateLocationInput {
  id: string;
}

export async function getLocations(storeId: string) {
  const context = await requireUserContext({ storeId });
  return await prisma.location.findMany({
    where: { storeId: context.activeStoreId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getLocationById(id: string) {
  const location = await prisma.location.findUnique({
    where: { id },
  });
  if (!location) return null;
  await requireUserContext({ storeId: location.storeId });
  return location;
}

export async function createLocation(data: CreateLocationInput) {
  const context = await requireUserContext({ storeId: data.storeId });
  const code = data.code?.trim() || (await generateLocationCode(context.activeStoreId, data.type));

  const location = await prisma.location.create({
    data: {
      storeId: context.activeStoreId,
      code,
      name: data.name,
      region: normalizeRegion(data.region),
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
  const existing = await prisma.location.findUnique({
    where: { id: data.id },
    select: { storeId: true },
  });
  if (!existing) throw new Error("位置不存在或无权修改");
  await requireUserContext({ storeId: existing.storeId });

  const location = await prisma.location.update({
    where: { id: data.id },
    data: {
      code: data.code,
      name: data.name,
      region: normalizeRegion(data.region),
      type: data.type,
      isSellableDefault: data.isSellableDefault,
    },
  });

  revalidatePath("/inventory/locations");
  revalidatePath(`/inventory/locations/${data.id}`);
  return location;
}

export async function getLocationStats(locationId: string) {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { storeId: true },
  });
  if (!location) throw new Error("位置不存在或无权查看");
  const context = await requireUserContext({ storeId: location.storeId });

  const [lots, items] = await Promise.all([
    prisma.inventoryLot.findMany({
      where: { locationId, storeId: context.activeStoreId },
      include: { sku: true },
    }),
    prisma.itemUnit.findMany({
      where: { locationId, storeId: context.activeStoreId },
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
  const context = await requireUserContext({ storeId });
  const [lotCount, itemCount, ledgerCount] = await Promise.all([
    prisma.inventoryLot.count({ where: { locationId: id, storeId: context.activeStoreId } }),
    prisma.itemUnit.count({ where: { locationId: id, storeId: context.activeStoreId } }),
    prisma.stockLedger.count({ where: { locationId: id, storeId: context.activeStoreId } }),
  ]);

  if (lotCount > 0 || itemCount > 0 || ledgerCount > 0) {
    throw new Error("该位置下仍有关联库存/流水，无法删除。请先清空库存并处理相关记录。");
  }

  const deleted = await prisma.location.deleteMany({
    where: { id, storeId: context.activeStoreId },
  });
  if (deleted.count === 0) throw new Error("位置不存在或无权删除");

  revalidatePath("/inventory/locations");
}
