import type { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { capabilitiesForLocationFulfillerRole } from "@/lib/application/collaboration-capabilities";
import {
  resolveBundleFulfillmentEligibility,
  type BundleFulfillmentReasonCode,
} from "@/lib/application/bundle-fulfillment-eligibility";
import { RESERVING_ALLOCATION_STATUSES } from "@/lib/application/order-allocation";
import { prisma } from "@/lib/prisma";

export type BundleFulfillmentPreviewClient = Pick<
  Prisma.TransactionClient,
  | "listing"
  | "channelAccess"
  | "inventoryPool"
  | "inventoryLot"
  | "itemUnit"
  | "stockLedger"
  | "orderAllocation"
  | "fulfillmentInventoryAllocation"
  | "organizationConnection"
  | "serviceAgreement"
  | "locationFulfiller"
>;

export interface BundleFulfillmentPreviewLineInput {
  listingId: string;
  quantity?: string | number;
}

export interface BundleFulfillmentPreviewInput {
  storeId: string;
  userId: string;
  lines: readonly BundleFulfillmentPreviewLineInput[];
  destinationMarket: string;
  /** Injectable clock for deterministic callers and tests. */
  now?: Date;
}

export const BUNDLE_FULFILLMENT_PREVIEW_REASON_CODES = {
  LISTING_ID_REQUIRED: "LISTING_ID_REQUIRED",
  DUPLICATE_LISTING: "DUPLICATE_LISTING",
  LISTING_NOT_FOUND: "LISTING_NOT_FOUND",
  LISTING_NOT_ACTIVE: "LISTING_NOT_ACTIVE",
  RESALE_WORKFLOW_UNSUPPORTED: "RESALE_WORKFLOW_UNSUPPORTED",
  PLATFORM_MISMATCH: "PLATFORM_MISMATCH",
  SALES_CHANNEL_ACCOUNT_INACTIVE: "SALES_CHANNEL_ACCOUNT_INACTIVE",
  SALES_CHANNEL_ACCOUNT_PLATFORM_MISMATCH: "SALES_CHANNEL_ACCOUNT_PLATFORM_MISMATCH",
  CHANNEL_ACCESS_REQUIRED: "CHANNEL_ACCESS_REQUIRED",
  SKU_REQUIRED: "SKU_REQUIRED",
  DUPLICATE_ITEM_UNIT: "DUPLICATE_ITEM_UNIT",
  NO_AUTHORIZED_INVENTORY_POOL: "NO_AUTHORIZED_INVENTORY_POOL",
  COMBINED_STOCK_INSUFFICIENT: "COMBINED_STOCK_INSUFFICIENT",
} as const;

export type BundleFulfillmentPreviewSpecificReasonCode =
  (typeof BUNDLE_FULFILLMENT_PREVIEW_REASON_CODES)[keyof typeof BUNDLE_FULFILLMENT_PREVIEW_REASON_CODES];

export type BundleFulfillmentPreviewReasonCode =
  | BundleFulfillmentPreviewSpecificReasonCode
  | BundleFulfillmentReasonCode;

export interface BundleFulfillmentPreviewReason {
  code: BundleFulfillmentPreviewReasonCode;
  message: string;
  listingIds: string[];
}

export interface BundleFulfillmentPreviewLocation {
  id: string;
  code: string;
  name: string;
  region: string | null;
  operatorOrganizationId: string;
}

export interface BundleFulfillmentPreviewResult {
  eligible: boolean;
  commonLocationIds: string[];
  commonLocations: BundleFulfillmentPreviewLocation[];
  reasons: BundleFulfillmentPreviewReason[];
}

export interface FulfillmentAgreementCoverage {
  status: string;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  inventoryPoolId: string | null;
  locationId: string | null;
  serviceTypes: unknown;
}

/**
 * One agreement must cover the service, time, warehouse and inventory pool at
 * once. Separate partial agreements cannot be combined into an authorization.
 */
export function agreementCoversBundleFulfillment(
  agreement: FulfillmentAgreementCoverage,
  input: { now: Date; locationId: string; inventoryPoolId: string }
) {
  const serviceTypes = Array.isArray(agreement.serviceTypes)
    ? agreement.serviceTypes.map((service) => String(service).trim().toUpperCase())
    : [];
  return (
    agreement.status === "ACTIVE" &&
    (!agreement.effectiveFrom || agreement.effectiveFrom <= input.now) &&
    (!agreement.effectiveTo || agreement.effectiveTo >= input.now) &&
    serviceTypes.includes("FULFILLMENT") &&
    (!agreement.locationId || agreement.locationId === input.locationId) &&
    (!agreement.inventoryPoolId || agreement.inventoryPoolId === input.inventoryPoolId)
  );
}

export type BundleFulfillmentPreviewResolvedLine = {
  id: string;
  listingType: string;
  skuId: string | null;
  itemUnitId: string | null;
  salesChannelAccountId: string | null;
  platformId: string;
  currency: string | null;
  quantity: Decimal;
};

type PreviewLocation = {
  id: string;
  code: string;
  name: string;
  region: string | null;
  operatorOrganizationId: string | null;
  isSellableDefault: boolean;
  store: { organizationId: string | null };
  capabilities: Array<{ code: string; enabled: boolean }>;
  shippingLanesFrom: Array<{
    laneType: string;
    destinationCountry: string | null;
    active: boolean;
  }>;
};

export type BundleAuthorizedInventorySnapshot = {
  lotQuantityByLocationSku: Map<string, Decimal>;
  itemIdsByLocationSku: Map<string, Set<string>>;
  exactItemLocationById: Map<string, string>;
};

const SUPPORTED_DESTINATIONS = new Set(["CN", "JP", "US", "EU"]);

function emptyResult(reasons: BundleFulfillmentPreviewReason[]): BundleFulfillmentPreviewResult {
  return { eligible: false, commonLocationIds: [], commonLocations: [], reasons };
}

function parsePositiveQuantity(value: string | number | undefined) {
  try {
    const quantity = new Decimal(value ?? 1);
    return quantity.isFinite() && quantity.gt(0) ? quantity : null;
  } catch {
    return null;
  }
}

function locationSkuKey(locationId: string, skuId: string) {
  return `${locationId}:${skuId}`;
}

function pairKey(left: string, right: string) {
  return [left, right].sort().join(":");
}

function supportsDestination(location: PreviewLocation, destinationMarket: string) {
  return (
    location.capabilities.some(
      (capability) => capability.code === "DIRECT_FULFILLMENT" && capability.enabled
    ) &&
    location.shippingLanesFrom.some(
      (lane) =>
        lane.active &&
        lane.laneType === "CUSTOMER_DELIVERY" &&
        (lane.destinationCountry === destinationMarket || lane.destinationCountry === "GLOBAL")
    )
  );
}

function canUseWholeItemUnits(remaining: Decimal, itemCount: number) {
  return remaining.lte(0) || (remaining.isInteger() && remaining.lte(itemCount));
}

function canAllocateGenericQuantityAtLocation(
  snapshot: BundleAuthorizedInventorySnapshot,
  locationId: string,
  skuId: string,
  quantity: Decimal
) {
  const key = locationSkuKey(locationId, skuId);
  const lotQuantity = snapshot.lotQuantityByLocationSku.get(key) ?? new Decimal(0);
  const remaining = Decimal.max(quantity.minus(lotQuantity), 0);
  return canUseWholeItemUnits(remaining, snapshot.itemIdsByLocationSku.get(key)?.size ?? 0);
}

/**
 * Prevents two lines for the same SKU from independently counting the same
 * physical stock. Exact ItemUnit listings are reserved first and are excluded
 * from generic SKU availability by the snapshot builder.
 */
export function canAllocateBundleAtLocation(
  lines: readonly BundleFulfillmentPreviewResolvedLine[],
  snapshot: BundleAuthorizedInventorySnapshot,
  locationId: string
) {
  const exactItemIds = new Set<string>();
  for (const line of lines) {
    if (line.listingType !== "ITEM_UNIT") continue;
    if (
      !line.itemUnitId ||
      exactItemIds.has(line.itemUnitId) ||
      snapshot.exactItemLocationById.get(line.itemUnitId) !== locationId
    ) {
      return false;
    }
    exactItemIds.add(line.itemUnitId);
  }

  const demandBySku = new Map<string, Decimal>();
  for (const line of lines) {
    if (line.listingType === "ITEM_UNIT" || !line.skuId) continue;
    demandBySku.set(
      line.skuId,
      (demandBySku.get(line.skuId) ?? new Decimal(0)).plus(line.quantity)
    );
  }
  return [...demandBySku].every(([skuId, quantity]) =>
    canAllocateGenericQuantityAtLocation(snapshot, locationId, skuId, quantity)
  );
}

const locationSelect = {
  id: true,
  code: true,
  name: true,
  region: true,
  operatorOrganizationId: true,
  isSellableDefault: true,
  store: { select: { organizationId: true } },
  capabilities: {
    where: { enabled: true },
    select: { code: true, enabled: true },
  },
  shippingLanesFrom: {
    where: { active: true, laneType: "CUSTOMER_DELIVERY" },
    select: { laneType: true, destinationCountry: true, active: true },
  },
} satisfies Prisma.LocationSelect;

/**
 * Read-only, authorization-aware preview for the bundle dialog. The result is
 * advisory: the committing transaction must still lock and re-check inventory,
 * agreements and permissions.
 */
export async function previewBundleFulfillment(
  input: BundleFulfillmentPreviewInput,
  client: BundleFulfillmentPreviewClient = prisma
): Promise<BundleFulfillmentPreviewResult> {
  const reasons: BundleFulfillmentPreviewReason[] = [];
  const now = input.now ?? new Date();
  const destinationMarket = input.destinationMarket.trim().toUpperCase();
  const normalizedListingIds = input.lines.map((line) => line.listingId.trim());
  const requestedListingIds = normalizedListingIds.filter(Boolean);
  const uniqueListingIds = [...new Set(requestedListingIds)];

  if (input.lines.length < 2) {
    reasons.push({
      code: "MULTIPLE_LINES_REQUIRED",
      message: "打包出售至少需要选择两条 Listing。",
      listingIds: uniqueListingIds,
    });
  }
  if (requestedListingIds.length !== input.lines.length) {
    reasons.push({
      code: BUNDLE_FULFILLMENT_PREVIEW_REASON_CODES.LISTING_ID_REQUIRED,
      message: "打包明细缺少 Listing 标识。",
      listingIds: [],
    });
  }
  const duplicateListingIds = uniqueListingIds.filter(
    (listingId) =>
      normalizedListingIds.indexOf(listingId) !== normalizedListingIds.lastIndexOf(listingId)
  );
  if (duplicateListingIds.length > 0) {
    reasons.push({
      code: BUNDLE_FULFILLMENT_PREVIEW_REASON_CODES.DUPLICATE_LISTING,
      message: "同一条 Listing 不能在打包订单中重复选择。",
      listingIds: duplicateListingIds,
    });
  }
  if (!SUPPORTED_DESTINATIONS.has(destinationMarket)) {
    reasons.push({
      code: "DESTINATION_MARKET_REQUIRED",
      message: "请选择明确的客户收货国家/地区。",
      listingIds: uniqueListingIds,
    });
  }

  const quantityByListingId = new Map<string, Decimal>();
  for (const line of input.lines) {
    const listingId = line.listingId.trim();
    if (!listingId) continue;
    const quantity = parsePositiveQuantity(line.quantity);
    if (!quantity) {
      reasons.push({
        code: "INVALID_QUANTITY",
        message: `Listing ${listingId} 的出售数量必须大于 0。`,
        listingIds: [listingId],
      });
      continue;
    }
    quantityByListingId.set(listingId, quantity);
  }
  if (reasons.length > 0) return emptyResult(reasons);

  const listingRows = await client.listing.findMany({
    where: { id: { in: uniqueListingIds }, storeId: input.storeId },
    select: {
      id: true,
      status: true,
      listingType: true,
      skuId: true,
      itemUnitId: true,
      salesChannelAccountId: true,
      platformId: true,
      currency: true,
      platform: { select: { code: true } },
      salesChannelAccount: {
        select: { id: true, organizationId: true, platformCode: true, status: true },
      },
      itemUnit: { select: { skuId: true } },
      resaleListings: { select: { id: true } },
    },
  });
  const listingById = new Map(listingRows.map((listing) => [listing.id, listing]));
  const missingListingIds = uniqueListingIds.filter((listingId) => !listingById.has(listingId));
  if (missingListingIds.length > 0) {
    reasons.push({
      code: BUNDLE_FULFILLMENT_PREVIEW_REASON_CODES.LISTING_NOT_FOUND,
      message: "部分 Listing 不存在或不属于当前店铺。",
      listingIds: missingListingIds,
    });
  }

  const orderedRows = uniqueListingIds.flatMap((listingId) => {
    const row = listingById.get(listingId);
    return row ? [row] : [];
  });
  const inactiveIds = orderedRows.filter((row) => row.status !== "ACTIVE").map((row) => row.id);
  if (inactiveIds.length > 0) {
    reasons.push({
      code: BUNDLE_FULFILLMENT_PREVIEW_REASON_CODES.LISTING_NOT_ACTIVE,
      message: "只有在售 Listing 可以加入打包订单。",
      listingIds: inactiveIds,
    });
  }
  const resaleIds = orderedRows.filter((row) => row.resaleListings.length > 0).map((row) => row.id);
  if (resaleIds.length > 0) {
    reasons.push({
      code: BUNDLE_FULFILLMENT_PREVIEW_REASON_CODES.RESALE_WORKFLOW_UNSUPPORTED,
      message: "代卖商品当前不能加入普通打包订单。",
      listingIds: resaleIds,
    });
  }
  const platformIds = new Set(orderedRows.map((row) => row.platformId));
  if (platformIds.size > 1) {
    reasons.push({
      code: BUNDLE_FULFILLMENT_PREVIEW_REASON_CODES.PLATFORM_MISMATCH,
      message: "打包出售的商品必须来自同一销售平台。",
      listingIds: orderedRows.map((row) => row.id),
    });
  }
  const accountIds = orderedRows.map((row) => row.salesChannelAccountId?.trim() ?? "");
  const missingAccountIds = orderedRows
    .filter((_, index) => !accountIds[index])
    .map((row) => row.id);
  if (missingAccountIds.length > 0) {
    reasons.push({
      code: "SALES_CHANNEL_ACCOUNT_REQUIRED",
      message: "所有 Listing 都必须关联明确的销售店铺账号。",
      listingIds: missingAccountIds,
    });
  }
  if (new Set(accountIds.filter(Boolean)).size > 1) {
    reasons.push({
      code: "SALES_CHANNEL_ACCOUNT_MISMATCH",
      message: "打包出售的商品必须来自同一销售店铺账号。",
      listingIds: orderedRows.map((row) => row.id),
    });
  }
  const currencies = orderedRows.map((row) => row.currency?.trim().toUpperCase() ?? "");
  const missingCurrencyIds = orderedRows
    .filter((_, index) => !currencies[index])
    .map((row) => row.id);
  if (missingCurrencyIds.length > 0) {
    reasons.push({
      code: "CURRENCY_REQUIRED",
      message: "所有 Listing 都必须设置明确币种。",
      listingIds: missingCurrencyIds,
    });
  }
  if (new Set(currencies.filter(Boolean)).size > 1) {
    reasons.push({
      code: "CURRENCY_MISMATCH",
      message: "打包出售的商品币种必须一致。",
      listingIds: orderedRows.map((row) => row.id),
    });
  }
  const missingSkuIds = orderedRows
    .filter((row) => !(row.skuId ?? row.itemUnit?.skuId))
    .map((row) => row.id);
  if (missingSkuIds.length > 0) {
    reasons.push({
      code: BUNDLE_FULFILLMENT_PREVIEW_REASON_CODES.SKU_REQUIRED,
      message: "部分 Listing 没有关联 SKU。",
      listingIds: missingSkuIds,
    });
  }
  const exactItemIds = orderedRows.flatMap((row) =>
    row.listingType === "ITEM_UNIT" && row.itemUnitId ? [row.itemUnitId] : []
  );
  if (new Set(exactItemIds).size !== exactItemIds.length) {
    reasons.push({
      code: BUNDLE_FULFILLMENT_PREVIEW_REASON_CODES.DUPLICATE_ITEM_UNIT,
      message: "多条 Listing 指向同一个单件库存，不能重复出售。",
      listingIds: orderedRows
        .filter(
          (row) =>
            row.itemUnitId &&
            exactItemIds.indexOf(row.itemUnitId) !== exactItemIds.lastIndexOf(row.itemUnitId)
        )
        .map((row) => row.id),
    });
  }
  if (reasons.length > 0) return emptyResult(reasons);

  const firstListing = orderedRows[0];
  const salesAccount = firstListing.salesChannelAccount;
  if (!salesAccount || salesAccount.status !== "ACTIVE") {
    return emptyResult([
      {
        code: BUNDLE_FULFILLMENT_PREVIEW_REASON_CODES.SALES_CHANNEL_ACCOUNT_INACTIVE,
        message: "销售店铺账号不存在或已停用。",
        listingIds: orderedRows.map((row) => row.id),
      },
    ]);
  }
  if (salesAccount.platformCode.toUpperCase() !== firstListing.platform.code.toUpperCase()) {
    return emptyResult([
      {
        code: BUNDLE_FULFILLMENT_PREVIEW_REASON_CODES.SALES_CHANNEL_ACCOUNT_PLATFORM_MISMATCH,
        message: "销售店铺账号与 Listing 平台不一致。",
        listingIds: orderedRows.map((row) => row.id),
      },
    ]);
  }
  const channelAccess = await client.channelAccess.findUnique({
    where: {
      salesChannelAccountId_userId: {
        salesChannelAccountId: salesAccount.id,
        userId: input.userId,
      },
    },
    select: { id: true },
  });
  if (!channelAccess) {
    return emptyResult([
      {
        code: BUNDLE_FULFILLMENT_PREVIEW_REASON_CODES.CHANNEL_ACCESS_REQUIRED,
        message: "当前用户没有该销售店铺账号的操作权限。",
        listingIds: orderedRows.map((row) => row.id),
      },
    ]);
  }

  const authorizedPools = await client.inventoryPool.findMany({
    where: {
      organizationId: salesAccount.organizationId,
      status: "ACTIVE",
      accesses: { some: { userId: input.userId } },
    },
    select: { id: true },
  });
  const authorizedPoolIds = new Set(authorizedPools.map((pool) => pool.id));
  if (authorizedPoolIds.size === 0) {
    return emptyResult([
      {
        code: BUNDLE_FULFILLMENT_PREVIEW_REASON_CODES.NO_AUTHORIZED_INVENTORY_POOL,
        message: "当前用户没有销售组织有效库存池的操作权限。",
        listingIds: orderedRows.map((row) => row.id),
      },
    ]);
  }

  const previewLines: BundleFulfillmentPreviewResolvedLine[] = orderedRows.map((row) => ({
    id: row.id,
    listingType: row.listingType,
    skuId: row.skuId ?? row.itemUnit?.skuId ?? null,
    itemUnitId: row.itemUnitId,
    salesChannelAccountId: row.salesChannelAccountId,
    platformId: row.platformId,
    currency: row.currency,
    quantity:
      row.listingType === "ITEM_UNIT"
        ? new Decimal(1)
        : (quantityByListingId.get(row.id) ?? new Decimal(1)),
  }));
  const skuIds = [...new Set(previewLines.flatMap((line) => (line.skuId ? [line.skuId] : [])))];

  const [lots, itemUnits] = await Promise.all([
    client.inventoryLot.findMany({
      where: {
        storeId: input.storeId,
        skuId: { in: skuIds },
        inventoryPoolId: { in: [...authorizedPoolIds] },
        status: "ACTIVE",
        costStatus: "CONFIRMED",
      },
      select: {
        id: true,
        skuId: true,
        inventoryPoolId: true,
        locationId: true,
        location: { select: locationSelect },
      },
    }),
    client.itemUnit.findMany({
      where: {
        storeId: input.storeId,
        skuId: { in: skuIds },
        inventoryPoolId: { in: [...authorizedPoolIds] },
        status: "AVAILABLE",
        costStatus: "CONFIRMED",
      },
      select: {
        id: true,
        skuId: true,
        inventoryPoolId: true,
        locationId: true,
        location: { select: locationSelect },
      },
    }),
  ]);

  const locationById = new Map<string, PreviewLocation>();
  for (const inventory of [...lots, ...itemUnits]) {
    locationById.set(inventory.locationId, inventory.location as PreviewLocation);
  }
  const crossOrganizationPairs = [...locationById.values()].flatMap((location) => {
    const operatorOrganizationId =
      location.operatorOrganizationId ?? location.store.organizationId ?? null;
    return operatorOrganizationId && operatorOrganizationId !== salesAccount.organizationId
      ? [{ locationId: location.id, operatorOrganizationId }]
      : [];
  });
  const providerOrganizationIds = [
    ...new Set(crossOrganizationPairs.map((pair) => pair.operatorOrganizationId)),
  ];
  const connectionPairKeys = providerOrganizationIds.map((providerOrganizationId) =>
    pairKey(salesAccount.organizationId, providerOrganizationId)
  );

  const [connections, agreements, fulfillers] = await Promise.all([
    connectionPairKeys.length
      ? client.organizationConnection.findMany({
          where: { pairKey: { in: connectionPairKeys }, status: "ACTIVE" },
          select: { pairKey: true },
        })
      : Promise.resolve([]),
    providerOrganizationIds.length
      ? client.serviceAgreement.findMany({
          where: {
            clientOrganizationId: salesAccount.organizationId,
            providerOrganizationId: { in: providerOrganizationIds },
            status: "ACTIVE",
            AND: [
              { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }] },
              { OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] },
            ],
          },
          select: {
            providerOrganizationId: true,
            status: true,
            effectiveFrom: true,
            effectiveTo: true,
            inventoryPoolId: true,
            locationId: true,
            serviceTypes: true,
          },
        })
      : Promise.resolve([]),
    crossOrganizationPairs.length
      ? client.locationFulfiller.findMany({
          where: {
            status: "ACTIVE",
            userId: { not: null },
            organizationId: { in: providerOrganizationIds },
            locationId: { in: crossOrganizationPairs.map((pair) => pair.locationId) },
          },
          select: { organizationId: true, locationId: true, role: true },
        })
      : Promise.resolve([]),
  ]);
  const activeConnectionKeys = new Set(connections.map((connection) => connection.pairKey));
  const fulfillerPairs = new Set(
    fulfillers.flatMap((fulfiller) =>
      new Set<string>(capabilitiesForLocationFulfillerRole(fulfiller.role)).has("warehouse.ship")
        ? [`${fulfiller.organizationId}:${fulfiller.locationId}`]
        : []
    )
  );

  const inventoryIsAuthorizedAtLocation = (inventory: {
    inventoryPoolId: string | null;
    location: PreviewLocation;
  }) => {
    const inventoryPoolId = inventory.inventoryPoolId;
    const location = inventory.location;
    if (
      !inventoryPoolId ||
      !authorizedPoolIds.has(inventoryPoolId) ||
      !location.isSellableDefault ||
      !supportsDestination(location, destinationMarket)
    ) {
      return false;
    }
    const operatorOrganizationId =
      location.operatorOrganizationId ?? location.store.organizationId ?? null;
    if (!operatorOrganizationId) return false;
    if (operatorOrganizationId === salesAccount.organizationId) return true;
    if (!activeConnectionKeys.has(pairKey(salesAccount.organizationId, operatorOrganizationId))) {
      return false;
    }
    if (!fulfillerPairs.has(`${operatorOrganizationId}:${location.id}`)) return false;
    return agreements.some(
      (agreement) =>
        agreement.providerOrganizationId === operatorOrganizationId &&
        agreementCoversBundleFulfillment(agreement, {
          now,
          locationId: location.id,
          inventoryPoolId,
        })
    );
  };

  const lotIds = lots.map((lot) => lot.id);
  const itemUnitIds = itemUnits.map((item) => item.id);
  const [lotLedgers, orderReservations, fulfillmentReservations] = await Promise.all([
    lotIds.length
      ? client.stockLedger.findMany({
          where: {
            storeId: input.storeId,
            entityType: "LOT",
            entityId: { in: lotIds },
          },
          select: { entityId: true, deltaQty: true },
        })
      : Promise.resolve([]),
    lotIds.length || itemUnitIds.length
      ? client.orderAllocation.findMany({
          where: {
            status: { in: [...RESERVING_ALLOCATION_STATUSES] },
            OR: [{ lotId: { in: lotIds } }, { itemUnitId: { in: itemUnitIds } }],
          },
          select: { lotId: true, itemUnitId: true, quantity: true },
        })
      : Promise.resolve([]),
    lotIds.length || itemUnitIds.length
      ? client.fulfillmentInventoryAllocation.findMany({
          where: {
            status: "ALLOCATED",
            OR: [{ lotId: { in: lotIds } }, { itemUnitId: { in: itemUnitIds } }],
          },
          select: { lotId: true, itemUnitId: true, quantity: true },
        })
      : Promise.resolve([]),
  ]);

  const lotOnHand = new Map<string, Decimal>();
  for (const ledger of lotLedgers) {
    lotOnHand.set(
      ledger.entityId,
      (lotOnHand.get(ledger.entityId) ?? new Decimal(0)).plus(ledger.deltaQty.toString())
    );
  }
  const lotReserved = new Map<string, Decimal>();
  const reservedItemIds = new Set<string>();
  for (const allocation of [...orderReservations, ...fulfillmentReservations]) {
    if (allocation.lotId) {
      lotReserved.set(
        allocation.lotId,
        (lotReserved.get(allocation.lotId) ?? new Decimal(0)).plus(allocation.quantity.toString())
      );
    }
    if (allocation.itemUnitId) reservedItemIds.add(allocation.itemUnitId);
  }

  const exactItemIdSet = new Set(exactItemIds);
  const snapshot: BundleAuthorizedInventorySnapshot = {
    lotQuantityByLocationSku: new Map(),
    itemIdsByLocationSku: new Map(),
    exactItemLocationById: new Map(),
  };
  for (const lot of lots) {
    if (!inventoryIsAuthorizedAtLocation(lot as typeof lot & { location: PreviewLocation }))
      continue;
    const available = Decimal.max(
      (lotOnHand.get(lot.id) ?? new Decimal(0)).minus(lotReserved.get(lot.id) ?? 0),
      0
    );
    if (available.lte(0)) continue;
    const key = locationSkuKey(lot.locationId, lot.skuId);
    snapshot.lotQuantityByLocationSku.set(
      key,
      (snapshot.lotQuantityByLocationSku.get(key) ?? new Decimal(0)).plus(available)
    );
  }
  for (const item of itemUnits) {
    if (
      reservedItemIds.has(item.id) ||
      !inventoryIsAuthorizedAtLocation(item as typeof item & { location: PreviewLocation })
    ) {
      continue;
    }
    if (exactItemIdSet.has(item.id)) {
      snapshot.exactItemLocationById.set(item.id, item.locationId);
      continue;
    }
    const key = locationSkuKey(item.locationId, item.skuId);
    const ids = snapshot.itemIdsByLocationSku.get(key) ?? new Set<string>();
    ids.add(item.id);
    snapshot.itemIdsByLocationSku.set(key, ids);
  }

  const candidateLines = previewLines.map((line) => ({
    lineId: line.id,
    salesChannelAccountId: line.salesChannelAccountId,
    currency: line.currency,
    quantity: line.quantity.toString(),
    candidatePhysicalLocations:
      line.listingType === "ITEM_UNIT" && line.itemUnitId
        ? snapshot.exactItemLocationById.has(line.itemUnitId)
          ? [
              {
                locationId: snapshot.exactItemLocationById.get(line.itemUnitId)!,
                availableQuantity: "1",
                fulfillmentMarkets: [destinationMarket],
              },
            ]
          : []
        : [...locationById.keys()].flatMap((locationId) => {
            if (!line.skuId) return [];
            const key = locationSkuKey(locationId, line.skuId);
            const lotQuantity = snapshot.lotQuantityByLocationSku.get(key) ?? new Decimal(0);
            const itemCount = snapshot.itemIdsByLocationSku.get(key)?.size ?? 0;
            const total = lotQuantity.plus(itemCount);
            return total.gt(0) &&
              canAllocateGenericQuantityAtLocation(snapshot, locationId, line.skuId, line.quantity)
              ? [
                  {
                    locationId,
                    availableQuantity: total.toString(),
                    fulfillmentMarkets: [destinationMarket],
                  },
                ]
              : [];
          }),
  }));
  const physicalEligibility = resolveBundleFulfillmentEligibility({
    destinationMarket,
    lines: candidateLines,
  });
  const commonLocationIds = physicalEligibility.commonLocationIds.filter((locationId) =>
    canAllocateBundleAtLocation(previewLines, snapshot, locationId)
  );
  const mappedReasons: BundleFulfillmentPreviewReason[] = physicalEligibility.reasons.map(
    (reason) => ({
      code: reason.code,
      message: reason.message,
      listingIds: reason.lineIds,
    })
  );
  if (physicalEligibility.commonLocationIds.length > 0 && commonLocationIds.length === 0) {
    mappedReasons.push({
      code: BUNDLE_FULFILLMENT_PREVIEW_REASON_CODES.COMBINED_STOCK_INSUFFICIENT,
      message: "各商品单独可发，但共同仓库存不足以同时满足本次全部打包数量。",
      listingIds: previewLines.map((line) => line.id),
    });
  }

  const commonLocations = commonLocationIds.flatMap((locationId) => {
    const location = locationById.get(locationId);
    if (!location) return [];
    const operatorOrganizationId =
      location.operatorOrganizationId ?? location.store.organizationId ?? null;
    return operatorOrganizationId
      ? [
          {
            id: location.id,
            code: location.code,
            name: location.name,
            region: location.region,
            operatorOrganizationId,
          },
        ]
      : [];
  });

  return {
    eligible: mappedReasons.length === 0 && commonLocationIds.length > 0,
    commonLocationIds,
    commonLocations,
    reasons: mappedReasons,
  };
}
