import { prisma } from "@/lib/prisma";

export type SetupPath = "existing" | "purchase";

export interface SetupSnapshot {
  storeId: string;
  storeName: string;
  storeCurrency: string;
  role: string;
  locationCount: number;
  operationalSkuCount: number;
  platformCount: number;
  inventoryLotCount: number;
  itemUnitCount: number;
  openingStockCount: number;
  purchaseOrderCount: number;
}

export interface SetupStatus {
  storeId: string;
  storeName: string;
  storeCurrency: string;
  role: string;
  canManageSetup: boolean;
  locationCount: number;
  operationalSkuCount: number;
  platformCount: number;
  inventoryRecordCount: number;
  openingStockCount: number;
  purchaseOrderCount: number;
  hasLocation: boolean;
  hasOperationalSku: boolean;
  hasPlatform: boolean;
  hasInventory: boolean;
  hasPurchaseOrder: boolean;
  hasInventoryOrPurchaseOrder: boolean;
  completedCoreCount: number;
  coreStepCount: number;
  isCoreComplete: boolean;
  shouldShowWorkbenchPrompt: boolean;
}

const SETUP_MANAGER_ROLES = new Set(["OWNER", "ADMIN", "MANAGER"]);

export function deriveSetupStatus(snapshot: SetupSnapshot): SetupStatus {
  const inventoryRecordCount = snapshot.inventoryLotCount + snapshot.itemUnitCount;
  const hasLocation = snapshot.locationCount > 0;
  const hasOperationalSku = snapshot.operationalSkuCount > 0;
  const hasPlatform = snapshot.platformCount > 0;
  const hasInventory = inventoryRecordCount > 0 || snapshot.openingStockCount > 0;
  const hasPurchaseOrder = snapshot.purchaseOrderCount > 0;
  const hasInventoryOrPurchaseOrder = hasInventory || hasPurchaseOrder;
  const completion = [hasLocation, hasOperationalSku, hasPlatform, hasInventoryOrPurchaseOrder];
  const completedCoreCount = completion.filter(Boolean).length;
  const isCoreComplete = completedCoreCount === completion.length;

  return {
    storeId: snapshot.storeId,
    storeName: snapshot.storeName,
    storeCurrency: snapshot.storeCurrency,
    role: snapshot.role,
    canManageSetup: SETUP_MANAGER_ROLES.has(snapshot.role),
    locationCount: snapshot.locationCount,
    operationalSkuCount: snapshot.operationalSkuCount,
    platformCount: snapshot.platformCount,
    inventoryRecordCount,
    openingStockCount: snapshot.openingStockCount,
    purchaseOrderCount: snapshot.purchaseOrderCount,
    hasLocation,
    hasOperationalSku,
    hasPlatform,
    hasInventory,
    hasPurchaseOrder,
    hasInventoryOrPurchaseOrder,
    completedCoreCount,
    coreStepCount: completion.length,
    isCoreComplete,
    shouldShowWorkbenchPrompt: snapshot.role === "OWNER" && !isCoreComplete,
  };
}

export function resolveSetupPath(
  requestedPath: string | undefined,
  status: Pick<SetupStatus, "hasInventory" | "hasPurchaseOrder">
): SetupPath | null {
  if (requestedPath === "existing" || requestedPath === "purchase") return requestedPath;
  if (status.hasInventory && !status.hasPurchaseOrder) return "existing";
  if (status.hasPurchaseOrder && !status.hasInventory) return "purchase";
  return null;
}

export function getMissingSetupLabels(
  status: Pick<
    SetupStatus,
    "hasLocation" | "hasOperationalSku" | "hasPlatform" | "hasInventoryOrPurchaseOrder"
  >
) {
  return [
    status.hasLocation ? null : "仓库位置",
    status.hasOperationalSku ? null : "可交易 SKU",
    status.hasPlatform ? null : "销售平台",
    status.hasInventoryOrPurchaseOrder ? null : "首批库存或采购单",
  ].filter((label): label is string => Boolean(label));
}

export async function getSetupStatus(input: { storeId: string; role: string }) {
  const [
    store,
    locationCount,
    operationalSkuCount,
    platformCount,
    inventoryLotCount,
    itemUnitCount,
    openingStockCount,
    purchaseOrderCount,
  ] = await Promise.all([
    prisma.store.findUniqueOrThrow({
      where: { id: input.storeId },
      select: { id: true, name: true, currency: true },
    }),
    prisma.location.count({ where: { storeId: input.storeId } }),
    prisma.sKU.count({
      where: {
        storeId: input.storeId,
        NOT: { catalogRole: "GROUP" },
        OR: [
          { catalogRole: "VARIANT" },
          { parentSkuId: { not: null } },
          { childSkus: { none: {} } },
        ],
      },
    }),
    prisma.platform.count({ where: { storeId: input.storeId } }),
    prisma.inventoryLot.count({ where: { storeId: input.storeId } }),
    prisma.itemUnit.count({ where: { storeId: input.storeId } }),
    prisma.openingStock.count({ where: { storeId: input.storeId } }),
    prisma.purchaseOrder.count({ where: { storeId: input.storeId } }),
  ]);

  return deriveSetupStatus({
    storeId: store.id,
    storeName: store.name,
    storeCurrency: store.currency,
    role: input.role,
    locationCount,
    operationalSkuCount,
    platformCount,
    inventoryLotCount,
    itemUnitCount,
    openingStockCount,
    purchaseOrderCount,
  });
}
