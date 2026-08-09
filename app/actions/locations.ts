"use server";

import { prisma } from "@/lib/prisma";
import { isValidLocationRegion } from "@/lib/inventory/location-regions";
import { revalidatePath } from "next/cache";
import { requireUserContext } from "@/lib/auth/user-context";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import Decimal from "decimal.js";
import {
  countryFromLocationRegion,
  defaultCapabilitiesForLocationType,
  isFulfillmentDestinationCode,
  isLocationCapabilityCode,
  type FulfillmentDestinationCode,
  type LocationCapabilityCode,
} from "@/lib/inventory/location-fulfillment";

export type LocationType = "WAREHOUSE" | "FORWARDER" | "PERSON" | "TRANSIT";

export interface CreateLocationInput {
  storeId: string;
  code?: string;
  name: string;
  region: string;
  type: LocationType;
  isSellableDefault?: boolean;
  capabilities?: LocationCapabilityCode[];
  fulfillmentMarkets?: FulfillmentDestinationCode[];
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

function normalizeCapabilities(values: string[] | undefined, fallback: LocationCapabilityCode[]) {
  const normalized = [...new Set(values ?? fallback)];
  if (normalized.some((value) => !isLocationCapabilityCode(value))) {
    throw new Error("仓库能力配置无效");
  }
  return normalized as LocationCapabilityCode[];
}

function normalizeFulfillmentMarkets(values: string[] | undefined) {
  const normalized = [...new Set(values ?? [])];
  if (normalized.some((value) => !isFulfillmentDestinationCode(value))) {
    throw new Error("可履约地区配置无效");
  }
  return normalized as FulfillmentDestinationCode[];
}

export interface UpdateLocationInput extends CreateLocationInput {
  id: string;
}

export async function getLocations(storeId: string) {
  const context = await requireUserContext({ storeId });
  const genericProviderAgreements = await prisma.serviceAgreement.findMany({
    where: {
      clientOrganizationId: context.organizationId,
      status: "ACTIVE",
      locationId: null,
    },
    select: { providerOrganizationId: true },
  });
  return await prisma.location.findMany({
    where: {
      OR: [
        { storeId: context.activeStoreId },
        { accesses: { some: { userId: context.userId } } },
        {
          serviceAgreements: {
            some: { clientOrganizationId: context.organizationId, status: "ACTIVE" },
          },
        },
        {
          operatorOrganizationId: {
            in: genericProviderAgreements.map((item) => item.providerOrganizationId),
          },
        },
      ],
    },
    include: {
      capabilities: { where: { enabled: true }, orderBy: { code: "asc" } },
      shippingLanesFrom: {
        where: { active: true, laneType: "CUSTOMER_DELIVERY" },
        orderBy: [{ priority: "asc" }, { destinationCountry: "asc" }],
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getLocationById(id: string) {
  const location = await prisma.location.findUnique({
    where: { id },
    include: {
      capabilities: { orderBy: { code: "asc" } },
      shippingLanesFrom: { orderBy: [{ priority: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!location) return null;
  const context = await requireUserContext();
  const clientAgreement = await prisma.serviceAgreement.findFirst({
    where: {
      clientOrganizationId: context.organizationId,
      providerOrganizationId: location.operatorOrganizationId ?? "",
      status: "ACTIVE",
      OR: [{ locationId: location.id }, { locationId: null }],
    },
    select: { id: true },
  });
  if (
    !context.storeIds.includes(location.storeId) &&
    !context.locationIds.includes(location.id) &&
    location.operatorOrganizationId !== context.organizationId &&
    !clientAgreement
  ) {
    throw new Error("无权查看该仓库");
  }
  return location;
}

export async function createLocation(data: CreateLocationInput) {
  const context = await requireUserContext({ storeId: data.storeId });
  const code = data.code?.trim() || (await generateLocationCode(context.activeStoreId, data.type));
  const region = normalizeRegion(data.region);
  const isInventoryAvailable = data.isSellableDefault ?? true;
  const fallbackCapabilities = defaultCapabilitiesForLocationType(data.type);
  const capabilities = normalizeCapabilities(data.capabilities, fallbackCapabilities);
  const fallbackMarket = countryFromLocationRegion(region);
  const fulfillmentMarkets = normalizeFulfillmentMarkets(
    data.fulfillmentMarkets ??
      (isInventoryAvailable && capabilities.includes("DIRECT_FULFILLMENT") && fallbackMarket
        ? [fallbackMarket]
        : [])
  );

  const location = await prisma.location.create({
    data: {
      storeId: context.activeStoreId,
      code,
      name: data.name,
      region,
      type: data.type,
      isSellableDefault: isInventoryAvailable,
      capabilities: {
        create: capabilities.map((capability) => ({ code: capability })),
      },
      shippingLanesFrom: {
        create: fulfillmentMarkets.map((destinationCountry, index) => ({
          storeId: context.activeStoreId,
          laneType: "CUSTOMER_DELIVERY",
          destinationCountry,
          priority: (index + 1) * 10,
        })),
      },
    },
  });

  revalidatePath("/inventory/locations");
  revalidatePath("/inventory/sellable");
  return location;
}

export async function createLocationAction(data: CreateLocationInput) {
  try {
    const location = await createLocation(data);
    return actionSuccess({ id: location.id });
  } catch (error) {
    return toActionFailure(error, "保存仓库位置失败，请重试");
  }
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

  const capabilities = data.capabilities ? normalizeCapabilities(data.capabilities, []) : undefined;
  const fulfillmentMarkets = data.fulfillmentMarkets
    ? normalizeFulfillmentMarkets(data.fulfillmentMarkets)
    : undefined;

  const location = await prisma.$transaction(async (tx) => {
    const updated = await tx.location.update({
      where: { id: data.id },
      data: {
        code: data.code,
        name: data.name,
        region: normalizeRegion(data.region),
        type: data.type,
        isSellableDefault: data.isSellableDefault,
      },
    });

    if (capabilities) {
      await tx.locationCapability.deleteMany({ where: { locationId: data.id } });
      if (capabilities.length > 0) {
        await tx.locationCapability.createMany({
          data: capabilities.map((capability) => ({ locationId: data.id, code: capability })),
        });
      }
    }

    if (fulfillmentMarkets) {
      await tx.shippingLane.deleteMany({
        where: { fromLocationId: data.id, laneType: "CUSTOMER_DELIVERY" },
      });
      if (fulfillmentMarkets.length > 0) {
        await tx.shippingLane.createMany({
          data: fulfillmentMarkets.map((destinationCountry, index) => ({
            storeId: existing.storeId,
            fromLocationId: data.id,
            laneType: "CUSTOMER_DELIVERY",
            destinationCountry,
            priority: (index + 1) * 10,
          })),
        });
      }
    }

    return updated;
  });

  revalidatePath("/inventory/locations");
  revalidatePath(`/inventory/locations/${data.id}`);
  revalidatePath("/inventory/sellable");
  return location;
}

export async function updateLocationAction(data: UpdateLocationInput) {
  try {
    const location = await updateLocation(data);
    return actionSuccess({ id: location.id });
  } catch (error) {
    return toActionFailure(error, "保存仓库位置失败，请重试");
  }
}

export async function getLocationStats(locationId: string) {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { id: true, storeId: true, operatorOrganizationId: true },
  });
  if (!location) throw new Error("位置不存在或无权查看");
  const context = await requireUserContext();
  const clientAgreement = await prisma.serviceAgreement.findFirst({
    where: {
      clientOrganizationId: context.organizationId,
      providerOrganizationId: location.operatorOrganizationId ?? "",
      status: "ACTIVE",
      OR: [{ locationId }, { locationId: null }],
    },
    select: { id: true },
  });
  if (
    !context.storeIds.includes(location.storeId) &&
    !context.locationIds.includes(location.id) &&
    location.operatorOrganizationId !== context.organizationId &&
    !clientAgreement
  ) {
    throw new Error("无权查看该仓库");
  }
  const agreements = await prisma.serviceAgreement.findMany({
    where: {
      providerOrganizationId: context.organizationId,
      status: "ACTIVE",
      OR: [{ locationId }, { locationId: null }],
    },
    select: { inventoryPoolId: true },
  });
  const agreementPoolIds = agreements
    .map((agreement) => agreement.inventoryPoolId)
    .filter((id): id is string => Boolean(id));
  const canSeeAllPools = agreements.some((agreement) => agreement.inventoryPoolId === null);
  const visiblePoolIds = [...new Set([...context.inventoryPoolIds, ...agreementPoolIds])];
  const inventoryScope = canSeeAllPools
    ? { locationId }
    : {
        locationId,
        OR: [{ storeId: context.activeStoreId }, { inventoryPoolId: { in: visiblePoolIds } }],
      };

  const [lotAggregates, items] = await Promise.all([
    prisma.stockLedger.groupBy({
      by: ["entityId"],
      where: { ...inventoryScope, entityType: "LOT" },
      _sum: { deltaQty: true },
    }),
    prisma.itemUnit.findMany({
      where: inventoryScope,
      include: { sku: true },
    }),
  ]);

  const lotQuantities = lotAggregates
    .map((row) => ({
      lotId: row.entityId,
      qty: new Decimal(row._sum.deltaQty?.toString() ?? "0").toNumber(),
    }))
    .filter((row) => row.qty > 0);

  const lots = lotQuantities.length
    ? await prisma.inventoryLot.findMany({
        where: {
          id: { in: lotQuantities.map((row) => row.lotId) },
          ...(canSeeAllPools
            ? {}
            : {
                OR: [
                  { storeId: context.activeStoreId },
                  { inventoryPoolId: { in: visiblePoolIds } },
                ],
              }),
        },
        include: { sku: true },
      })
    : [];

  const lotQtyById = new Map(lotQuantities.map((row) => [row.lotId, row.qty]));
  const skuIds = new Set([...lots.map((l) => l.skuId), ...items.map((i) => i.skuId)]);

  const lotStockQty = lots.reduce((sum, lot) => sum + (lotQtyById.get(lot.id) ?? 0), 0);
  const availableItemCount = items.filter((item) => item.status === "AVAILABLE").length;
  const allocatedItemCount = items.filter((item) => item.status === "ALLOCATED").length;
  const consumedItemCount = items.filter((item) => item.status === "CONSUMED").length;

  const skuBreakdown: Array<{
    skuCode: string;
    skuName: string;
    lotStockQty: number;
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
      lotStockQty: lots
        .filter((lot) => lot.skuId === skuId)
        .reduce((sum, lot) => sum + (lotQtyById.get(lot.id) ?? 0), 0),
      availableItemCount: items.filter(
        (item) => item.skuId === skuId && item.status === "AVAILABLE"
      ).length,
      allocatedItemCount: items.filter(
        (item) => item.skuId === skuId && item.status === "ALLOCATED"
      ).length,
      consumedItemCount: items.filter((item) => item.skuId === skuId && item.status === "CONSUMED")
        .length,
    });
  }

  skuBreakdown.sort((a, b) => {
    const sellableA = a.lotStockQty + a.availableItemCount;
    const sellableB = b.lotStockQty + b.availableItemCount;
    return sellableB - sellableA;
  });

  return {
    skuCount: skuIds.size,
    lotStockQty,
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
  revalidatePath("/inventory/sellable");
}

export async function deleteLocationAction(id: string, storeId: string) {
  try {
    await deleteLocation(id, storeId);
    return actionSuccess({ id });
  } catch (error) {
    return toActionFailure(error, "删除仓库位置失败，请重试");
  }
}
