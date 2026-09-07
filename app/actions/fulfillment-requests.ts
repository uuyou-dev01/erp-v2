"use server";

import Decimal from "decimal.js";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { requireUserContext } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";
import { ensureSystemChargeCategories } from "@/lib/application/multi-party-foundation";
import { createSettlementFromFulfillment } from "@/app/actions/settlements";
import { RESERVING_ALLOCATION_STATUSES } from "@/lib/application/order-allocation";
import {
  getEffectiveSellableQuantity,
  resolveFifoShipFromLocation,
} from "@/lib/application/inventory";
import type { SellableMarketCode } from "@/lib/application/sellable-market";
import { hasLocationCapability } from "@/lib/auth/scope-access";
import { canShipOrders } from "@/lib/auth/permissions";
import { notifyOrganizationAdministrators } from "@/lib/application/collaboration-notifications";
import { recordWork } from "@/lib/application/work-records";

type StringableDecimal = { toString(): string };

export type SerializedFulfillmentRequest = {
  id: string;
  storeId: string;
  requesterOrganizationId: string | null;
  providerOrganizationId: string | null;
  inventoryPoolId: string | null;
  fulfillmentLocationId: string | null;
  assignedToId: string | null;
  isCollaboration: boolean;
  supplyOfferId: string;
  resaleListingId: string | null;
  reservationId: string | null;
  customerOrderId: string | null;
  requestNo: string;
  quantity: string;
  status: string;
  recipientName: string;
  recipientPhone: string | null;
  shippingAddress: string;
  shippingCountry: string | null;
  carrier: string | null;
  trackingNo: string | null;
  shippingProof: Prisma.JsonValue | null;
  shippingFee: string | null;
  shippingCurrency: string | null;
  requestedAt: Date;
  acceptedAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  supplyOffer: {
    id: string;
    title: string;
    availableQty: StringableDecimal;
    reservedQty: StringableDecimal;
    organization: { id: string; name: string } | null;
    ownerPartner: { id: string; name: string } | null;
  };
  resaleListing: {
    id: string;
    title: string;
    platform: { id: string; name: string; code: string };
  } | null;
};

type RawFulfillmentRequest = Omit<
  SerializedFulfillmentRequest,
  "quantity" | "shippingFee" | "isCollaboration"
> & {
  quantity: StringableDecimal;
  shippingFee: StringableDecimal | null;
};

function parseDecimal(
  value: string | undefined,
  label: string,
  options: { required?: boolean; min?: Decimal.Value } = {}
) {
  if (!value || value.trim() === "") {
    if (options.required) throw new Error(`${label}不能为空`);
    return null;
  }
  const decimal = new Decimal(value);
  if (!decimal.isFinite()) throw new Error(`${label}必须是有效数字`);
  if (options.min !== undefined && decimal.lte(options.min))
    throw new Error(`${label}必须大于 ${options.min}`);
  return decimal;
}

function revalidateFulfillmentSurfaces(id?: string, resaleListingId?: string, offerId?: string) {
  revalidatePath("/fulfillment/requests");
  revalidatePath("/workbench");
  if (id) revalidatePath(`/fulfillment/requests/${id}`);
  if (resaleListingId) revalidatePath(`/resale/${resaleListingId}`);
  if (offerId) revalidatePath(`/marketplace/${offerId}`);
}

const fulfillmentInclude = {
  supplyOffer: {
    include: {
      organization: {
        select: { id: true, name: true },
      },
      ownerPartner: true,
    },
  },
  resaleListing: {
    include: {
      platform: true,
    },
  },
} as const;

function serializeFulfillmentRequest(
  request: RawFulfillmentRequest,
  canViewRecipient = true
): SerializedFulfillmentRequest {
  return {
    ...request,
    isCollaboration: Boolean(
      request.requesterOrganizationId &&
      request.providerOrganizationId &&
      request.requesterOrganizationId !== request.providerOrganizationId
    ),
    recipientName: canViewRecipient ? request.recipientName : "已隐藏",
    recipientPhone: canViewRecipient ? request.recipientPhone : null,
    shippingAddress: canViewRecipient ? request.shippingAddress : "接受并指派任务后可见",
    quantity: request.quantity.toString(),
    shippingFee: request.shippingFee?.toString() ?? null,
  };
}

function nextRequestNo() {
  return `FF-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function nextResaleOrderNo() {
  return `RS-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

const FULFILLMENT_TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ["ACCEPTED", "REJECTED", "CANCELLED", "EXCEPTION"],
  ACCEPTED: ["SHIPPED", "CANCELLED", "EXCEPTION"],
  SHIPPED: ["DELIVERED", "EXCEPTION"],
  EXCEPTION: ["ACCEPTED", "CANCELLED"],
};

async function allocateFulfillmentInventory(
  tx: Prisma.TransactionClient,
  request: {
    id: string;
    storeId: string;
    inventoryPoolId: string | null;
    fulfillmentLocationId: string | null;
    supplyOfferId: string;
    reservationId: string | null;
    quantity: { toString(): string };
  }
) {
  const allocations = await tx.fulfillmentInventoryAllocation.findMany({
    where: { fulfillmentRequestId: request.id, status: "ALLOCATED" },
  });
  let allocated = allocations.reduce((sum, item) => sum.plus(item.quantity), new Decimal(0));
  const required = new Decimal(request.quantity.toString());

  if (allocated.lt(required)) {
    const offer = await tx.supplyOffer.findUnique({
      where: { id: request.supplyOfferId },
      include: { items: true },
    });
    if (!offer) throw new Error("供货报价不存在");
    const reservation = request.reservationId
      ? await tx.supplyReservation.findUnique({
          where: { id: request.reservationId },
          select: { supplyOfferItemId: true },
        })
      : null;
    const selectedItems = reservation?.supplyOfferItemId
      ? offer.items.filter((item) => item.id === reservation.supplyOfferItemId)
      : offer.items;
    if (reservation?.supplyOfferItemId && selectedItems.length !== 1) {
      throw new Error("订单关联的货盘商品明细不存在");
    }
    const hasInventorySource = Boolean(
      offer.sourceSkuId ||
      offer.sourceItemUnitId ||
      selectedItems.some((item) => item.skuId || item.itemUnitId)
    );
    // Manual/external supply has no physical inventory in this ERP. It is
    // reservable at offer level, while real SKU/ItemUnit supply must allocate
    // concrete stock immediately so all accounts share one truth.
    if (!hasInventorySource) return;
    const itemUnitIds = [
      offer.sourceItemUnitId,
      ...selectedItems.map((item) => item.itemUnitId),
    ].filter((id): id is string => Boolean(id));
    const requiresExactItemUnit = itemUnitIds.length > 0;
    const explicitItemUnits =
      itemUnitIds.length > 0
        ? await tx.itemUnit.findMany({
            where: { id: { in: [...new Set(itemUnitIds)] } },
            select: { skuId: true },
          })
        : [];
    const skuIds = [
      offer.sourceSkuId,
      ...selectedItems.map((item) => item.skuId),
      ...explicitItemUnits.map((item) => item.skuId),
    ].filter((id): id is string => Boolean(id));
    const uniqueSkuIds = [...new Set(skuIds)].sort();
    for (const skuId of uniqueSkuIds) {
      await tx.$queryRaw`SELECT "id" FROM "skus" WHERE "id" = ${skuId} FOR UPDATE`;
    }
    const effectiveQuantities = await Promise.all(
      uniqueSkuIds.map((skuId) =>
        getEffectiveSellableQuantity(tx, offer.storeId, skuId, undefined, request.inventoryPoolId)
      )
    );
    const effectiveTotal = effectiveQuantities.reduce(
      (sum, quantity) => sum.plus(quantity),
      new Decimal(0)
    );
    if (required.minus(allocated).gt(effectiveTotal)) {
      throw new Error("真实可售库存不足（部分库存可能已被其他渠道的保证配额保护）");
    }
    for (const itemUnitId of [...new Set(itemUnitIds)]) {
      if (allocated.gte(required)) break;
      const unit = await tx.itemUnit.findFirst({
        where: {
          id: itemUnitId,
          storeId: offer.storeId,
          status: "AVAILABLE",
          inventoryPoolId: request.inventoryPoolId || undefined,
          locationId: request.fulfillmentLocationId || undefined,
          location: { isSellableDefault: true },
          allocations: { none: { status: { in: [...RESERVING_ALLOCATION_STATUSES] } } },
        },
      });
      if (!unit) continue;
      await tx.$queryRaw`SELECT "id" FROM "item_units" WHERE "id" = ${unit.id} FOR UPDATE`;
      const exists = await tx.fulfillmentInventoryAllocation.findFirst({
        where: { itemUnitId: unit.id, status: "ALLOCATED" },
      });
      if (exists) continue;
      const quantity = Decimal.min(1, required.minus(allocated));
      const created = await tx.fulfillmentInventoryAllocation.create({
        data: { fulfillmentRequestId: request.id, itemUnitId: unit.id, quantity },
      });
      await tx.itemUnit.update({ where: { id: unit.id }, data: { status: "ALLOCATED" } });
      allocations.push(created);
      allocated = allocated.plus(quantity);
    }

    if (requiresExactItemUnit && allocated.lt(required)) {
      throw new Error("指定的单件库存当前不可用，不能替换为同 SKU 的其他库存");
    }

    if (allocated.lt(required) && skuIds.length > 0) {
      const lots = await tx.inventoryLot.findMany({
        where: {
          storeId: offer.storeId,
          skuId: { in: uniqueSkuIds },
          inventoryPoolId: request.inventoryPoolId || undefined,
          locationId: request.fulfillmentLocationId || undefined,
          status: "ACTIVE",
          location: { isSellableDefault: true },
        },
        orderBy: { receivedAt: "asc" },
      });
      for (const lot of lots) {
        if (allocated.gte(required)) break;
        await tx.$queryRaw`SELECT "id" FROM "inventory_lots" WHERE "id" = ${lot.id} FOR UPDATE`;
        const ledger = await tx.stockLedger.aggregate({
          where: { entityType: "LOT", entityId: lot.id, locationId: lot.locationId },
          _sum: { deltaQty: true },
        });
        const [alreadyAllocated, orderAllocated] = await Promise.all([
          tx.fulfillmentInventoryAllocation.aggregate({
            where: { lotId: lot.id, status: "ALLOCATED" },
            _sum: { quantity: true },
          }),
          tx.orderAllocation.aggregate({
            where: { lotId: lot.id, status: { in: [...RESERVING_ALLOCATION_STATUSES] } },
            _sum: { quantity: true },
          }),
        ]);
        const available = new Decimal(ledger._sum.deltaQty?.toString() ?? 0)
          .minus(alreadyAllocated._sum.quantity?.toString() ?? 0)
          .minus(orderAllocated._sum.quantity?.toString() ?? 0);
        if (available.lte(0)) continue;
        const quantity = Decimal.min(available, required.minus(allocated));
        const created = await tx.fulfillmentInventoryAllocation.create({
          data: { fulfillmentRequestId: request.id, lotId: lot.id, quantity },
        });
        allocations.push(created);
        allocated = allocated.plus(quantity);
      }
    }
  }

  if (!allocated.eq(required)) throw new Error("真实库存不足或供货报价未关联可出库库存");
}

async function shipFulfillmentInventory(
  tx: Prisma.TransactionClient,
  request: {
    id: string;
    supplyOfferId: string;
    quantity: { toString(): string };
  }
) {
  let allocations = await tx.fulfillmentInventoryAllocation.findMany({
    where: { fulfillmentRequestId: request.id, status: "ALLOCATED" },
  });
  const itemUnitIds = allocations.flatMap((allocation) =>
    allocation.itemUnitId ? [allocation.itemUnitId] : []
  );
  const lotIds = allocations.flatMap((allocation) => (allocation.lotId ? [allocation.lotId] : []));
  const [itemUnits, lots] = await Promise.all([
    tx.itemUnit.findMany({
      where: { id: { in: itemUnitIds } },
      select: { id: true, skuId: true },
    }),
    tx.inventoryLot.findMany({
      where: { id: { in: lotIds } },
      select: { id: true, skuId: true },
    }),
  ]);
  for (const skuId of [...new Set([...itemUnits, ...lots].map((item) => item.skuId))].sort()) {
    await tx.$queryRaw`SELECT "id" FROM "skus" WHERE "id" = ${skuId} FOR UPDATE`;
  }
  for (const lotId of lots.map((lot) => lot.id).sort()) {
    await tx.$queryRaw`SELECT "id" FROM "inventory_lots" WHERE "id" = ${lotId} FOR UPDATE`;
  }
  for (const itemUnitId of itemUnits.map((unit) => unit.id).sort()) {
    await tx.$queryRaw`SELECT "id" FROM "item_units" WHERE "id" = ${itemUnitId} FOR UPDATE`;
  }
  allocations = await tx.fulfillmentInventoryAllocation.findMany({
    where: { fulfillmentRequestId: request.id, status: "ALLOCATED" },
  });
  const required = new Decimal(request.quantity.toString());
  const offer = await tx.supplyOffer.findUnique({
    where: { id: request.supplyOfferId },
    include: { items: true },
  });
  if (!offer) throw new Error("供货报价不存在");
  const hasInventorySource = Boolean(
    offer.sourceSkuId ||
    offer.sourceItemUnitId ||
    offer.items.some((item) => item.skuId || item.itemUnitId)
  );
  if (!hasInventorySource) return;
  const allocated = allocations.reduce((sum, item) => sum.plus(item.quantity), new Decimal(0));
  if (!allocated.eq(required)) throw new Error("订单锁定库存不完整，不能发货");

  for (const allocation of allocations) {
    if (allocation.status !== "ALLOCATED") continue;
    if (allocation.itemUnitId) {
      const unit = await tx.itemUnit.findUniqueOrThrow({ where: { id: allocation.itemUnitId } });
      await tx.stockLedger.create({
        data: {
          storeId: unit.storeId,
          inventoryPoolId: unit.inventoryPoolId,
          entityType: "ITEM_UNIT",
          entityId: unit.id,
          locationId: unit.locationId,
          deltaQty: new Decimal(allocation.quantity.toString()).negated(),
          reason: "OUTBOUND_SALE",
          refType: "FULFILLMENT_REQUEST",
          refId: request.id,
        },
      });
      await tx.itemUnit.update({ where: { id: unit.id }, data: { status: "CONSUMED" } });
    } else if (allocation.lotId) {
      const lot = await tx.inventoryLot.findUniqueOrThrow({ where: { id: allocation.lotId } });
      await tx.stockLedger.create({
        data: {
          storeId: lot.storeId,
          inventoryPoolId: lot.inventoryPoolId,
          entityType: "LOT",
          entityId: lot.id,
          locationId: lot.locationId,
          deltaQty: new Decimal(allocation.quantity.toString()).negated(),
          reason: "OUTBOUND_SALE",
          refType: "FULFILLMENT_REQUEST",
          refId: request.id,
        },
      });
    }
    await tx.fulfillmentInventoryAllocation.update({
      where: { id: allocation.id },
      data: { status: "SHIPPED" },
    });
  }
}

async function allocateAndShipInventory(
  tx: Prisma.TransactionClient,
  request: {
    id: string;
    storeId: string;
    inventoryPoolId: string | null;
    fulfillmentLocationId: string | null;
    supplyOfferId: string;
    reservationId: string | null;
    quantity: { toString(): string };
  }
) {
  await allocateFulfillmentInventory(tx, request);
  await shipFulfillmentInventory(tx, request);
}

async function resolveOfferFulfillmentLocation(input: {
  storeId: string;
  providerOrganizationId: string;
  shipFromLocation: string | null;
  shippingCountry?: string | null;
  skuId?: string | null;
  itemUnitId?: string | null;
}) {
  const market = input.shippingCountry?.trim().toUpperCase() as SellableMarketCode | undefined;
  if (!market || !["CN", "JP", "US", "EU", "GLOBAL"].includes(market)) {
    throw new Error("请选择有效的收货国家，系统需要据此选择可发货库存节点");
  }
  const locationWhere: Prisma.LocationWhereInput = {
    AND: {
      OR: [{ operatorOrganizationId: input.providerOrganizationId }, { storeId: input.storeId }],
    },
    isSellableDefault: true,
    capabilities: { some: { code: "DIRECT_FULFILLMENT", enabled: true } },
    shippingLanesFrom: {
      some: {
        active: true,
        laneType: "CUSTOMER_DELIVERY",
        destinationCountry: { in: [market, "GLOBAL"] },
      },
    },
  };

  if (input.shipFromLocation) {
    const explicit = await prisma.location.findFirst({
      where: {
        ...locationWhere,
        OR: [
          { id: input.shipFromLocation },
          { name: input.shipFromLocation },
          { code: input.shipFromLocation },
        ],
      },
      select: { id: true },
    });
    if (!explicit) throw new Error("指定发货节点不能服务当前收货国家，或没有订单发货能力");
    return explicit;
  }

  if (input.itemUnitId) {
    const unit = await prisma.itemUnit.findFirst({
      where: {
        id: input.itemUnitId,
        storeId: input.storeId,
        status: "AVAILABLE",
        location: locationWhere,
        allocations: { none: { status: { in: [...RESERVING_ALLOCATION_STATUSES] } } },
      },
      select: { locationId: true },
    });
    if (!unit) throw new Error("指定的单件库存不在可服务当前收货国家的发货节点");
    return { id: unit.locationId };
  }

  if (input.skuId) {
    const locationId = await resolveFifoShipFromLocation(input.storeId, input.skuId, market);
    if (!locationId) throw new Error("没有可服务当前收货国家的可售库存节点");
    const location = await prisma.location.findFirst({
      where: { id: locationId, ...locationWhere },
      select: { id: true },
    });
    if (!location) throw new Error("可售库存所在节点没有当前收货国家的有效发货线路");
    return location;
  }

  return prisma.location.findFirst({
    where: {
      ...locationWhere,
    },
    select: { id: true },
  });
}

async function assertFulfillmentAgreement(input: {
  requesterOrganizationId: string;
  providerOrganizationId: string;
  inventoryPoolId: string | null;
  locationId: string | null;
}) {
  if (input.requesterOrganizationId === input.providerOrganizationId) return;
  const agreements = await prisma.serviceAgreement.findMany({
    where: {
      clientOrganizationId: input.requesterOrganizationId,
      providerOrganizationId: input.providerOrganizationId,
      status: "ACTIVE",
    },
    select: { inventoryPoolId: true, locationId: true, serviceTypes: true },
  });
  const allowed = agreements.some((agreement) => {
    const services = Array.isArray(agreement.serviceTypes)
      ? agreement.serviceTypes.map(String)
      : [];
    return (
      services.includes("FULFILLMENT") &&
      (!agreement.inventoryPoolId || agreement.inventoryPoolId === input.inventoryPoolId) &&
      (!agreement.locationId || agreement.locationId === input.locationId)
    );
  });
  if (!allowed) throw new Error("请求主体与服务主体之间没有覆盖该货盘/仓库的有效代发协议");
}

async function lockAndAssertOfferAvailability(
  tx: Prisma.TransactionClient,
  input: {
    offerId: string;
    offerItemId?: string | null;
    quantity: Decimal;
    channelId?: string | null;
  }
) {
  await tx.$queryRaw`SELECT "id" FROM "supply_offers" WHERE "id" = ${input.offerId} FOR UPDATE`;
  const offer = await tx.supplyOffer.findUnique({ where: { id: input.offerId } });
  if (!offer || offer.status !== "PUBLISHED") throw new Error("货盘当前不可接单");
  const offerItems = await tx.supplyOfferItem.findMany({
    where: { offerId: input.offerId },
  });
  const item = input.offerItemId
    ? offerItems.find((candidate) => candidate.id === input.offerItemId)
    : offerItems.length === 1
      ? offerItems[0]
      : null;
  if (!item) throw new Error("订单没有关联到明确的货盘商品");
  let channel = null;
  if (input.channelId) {
    channel = await tx.supplyOfferChannel.findFirst({
      where: { id: input.channelId, offerId: input.offerId, status: "ACTIVE" },
    });
    if (!channel) throw new Error("销售账号未被当前货盘授权");
    if (channel.expiresAt && channel.expiresAt <= new Date())
      throw new Error("销售账号的货盘授权已过期");
  }
  let physicalRemaining: Decimal | null = null;
  if (item.itemUnitId) {
    const exactUnit = await tx.itemUnit.findFirst({
      where: {
        id: item.itemUnitId,
        storeId: offer.storeId,
        status: "AVAILABLE",
        allocations: { none: { status: { in: [...RESERVING_ALLOCATION_STATUSES] } } },
      },
      select: { id: true },
    });
    physicalRemaining = exactUnit ? new Decimal(1) : new Decimal(0);
  } else if (item.skuId) {
    physicalRemaining = await getEffectiveSellableQuantity(
      tx,
      offer.storeId,
      item.skuId,
      undefined,
      offer.inventoryPoolId
    );
    if (channel?.inventoryMode === "GUARANTEED") {
      physicalRemaining = physicalRemaining.plus(
        Decimal.max(channel.quotaQty.minus(channel.quotaReservedQty), 0)
      );
    }
    physicalRemaining = Decimal.max(physicalRemaining.minus(offer.safetyStockQty), 0);
  }
  const itemRemaining = Decimal.min(
    item.quantityAvailable.minus(item.quantityReserved),
    physicalRemaining ?? item.quantityAvailable.minus(item.quantityReserved)
  );
  if (input.quantity.gt(itemRemaining)) {
    throw new Error(
      item.itemUnitId
        ? "指定的单件库存当前不可用，不能替换为同 SKU 的其他库存"
        : "该货盘商品的实时可售数量不足"
    );
  }
  const baseRemaining = Decimal.min(
    offer.availableQty.minus(offer.reservedQty),
    physicalRemaining ?? offer.availableQty.minus(offer.reservedQty)
  );
  if (channel?.inventoryMode === "GUARANTEED") {
    const channelRemaining = channel.quotaQty.minus(channel.quotaReservedQty);
    if (input.quantity.gt(channelRemaining) || input.quantity.gt(baseRemaining)) {
      throw new Error("该账号的保证配额或实时库存不足");
    }
    return { channel, item };
  }
  const guaranteed = await tx.supplyOfferChannel.findMany({
    where: {
      offerId: input.offerId,
      status: "ACTIVE",
      inventoryMode: "GUARANTEED",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { quotaQty: true, quotaReservedQty: true },
  });
  const protectedQty = guaranteed.reduce(
    (sum, channel) => sum.plus(Decimal.max(channel.quotaQty.minus(channel.quotaReservedQty), 0)),
    new Decimal(0)
  );
  if (input.quantity.gt(baseRemaining.minus(protectedQty)))
    throw new Error("共享货盘可接单库存不足");
  return { channel, item };
}

export async function getFulfillmentRequests(storeId?: string) {
  const context = await requireUserContext(storeId ? { storeId } : undefined);
  const requests = await prisma.fulfillmentRequest.findMany({
    where: {
      OR: [
        { storeId: context.activeStoreId },
        { requesterOrganizationId: context.organizationId },
        { providerOrganizationId: context.organizationId },
        { assignedToId: context.userId },
      ],
    },
    include: fulfillmentInclude,
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
  return requests.map((request) =>
    serializeFulfillmentRequest(
      request,
      request.requesterOrganizationId === context.organizationId ||
        request.storeId === context.activeStoreId ||
        request.assignedToId === context.userId
    )
  );
}

export async function getFulfillmentRequestById(id: string, storeId?: string) {
  const context = await requireUserContext(storeId ? { storeId } : undefined);
  const request = await prisma.fulfillmentRequest.findFirst({
    where: {
      id,
      OR: [
        { storeId: context.activeStoreId },
        { requesterOrganizationId: context.organizationId },
        { providerOrganizationId: context.organizationId },
        { assignedToId: context.userId },
      ],
    },
    include: fulfillmentInclude,
  });
  return request
    ? serializeFulfillmentRequest(
        request,
        request.requesterOrganizationId === context.organizationId ||
          request.storeId === context.activeStoreId ||
          request.assignedToId === context.userId
      )
    : null;
}

export async function createFulfillmentRequestAction(data: {
  storeId?: string;
  resaleListingId: string;
  customerOrderId?: string;
  quantity: string;
  recipientName: string;
  recipientPhone?: string;
  shippingAddress: string;
  shippingCountry?: string;
  note?: string;
  idempotencyKey?: string;
}) {
  try {
    const context = await requireUserContext(data.storeId ? { storeId: data.storeId } : undefined);
    const resaleListing = await prisma.resaleListing.findFirst({
      where: { id: data.resaleListingId, storeId: context.activeStoreId },
      include: { supplyOffer: { include: { store: true } }, supplyOfferItem: true },
    });
    if (!resaleListing) throw new Error("代卖上架不存在或无权访问");
    if (data.idempotencyKey) {
      const existing = await prisma.fulfillmentRequest.findFirst({
        where: {
          requesterOrganizationId: context.organizationId,
          idempotencyKey: data.idempotencyKey,
        },
        select: { id: true },
      });
      if (existing) return actionSuccess({ id: existing.id });
    }
    if (resaleListing.status !== "ACTIVE") throw new Error("只有代卖中的记录可以创建履约请求");

    const quantity = parseDecimal(data.quantity, "履约数量", { required: true, min: 0 })!;
    const remainingOfferQty = resaleListing.supplyOffer.availableQty.minus(
      resaleListing.supplyOffer.reservedQty
    );
    if (quantity.gt(remainingOfferQty)) throw new Error("货盘可供数量不足，不能创建履约请求");
    if (!resaleListing.supplyOfferItem) throw new Error("代卖记录没有关联明确的货盘商品");
    if (
      quantity.gt(
        resaleListing.supplyOfferItem.quantityAvailable.minus(
          resaleListing.supplyOfferItem.quantityReserved
        )
      )
    ) {
      throw new Error("该货盘商品可供数量不足，不能创建履约请求");
    }
    const remainingListingQty = resaleListing.quantityPlanned.minus(resaleListing.quantitySold);
    if (quantity.gt(remainingListingQty)) throw new Error("代卖计划数量不足，不能创建履约请求");
    const recipientName = data.recipientName.trim();
    if (!recipientName) throw new Error("收件人不能为空");
    const shippingAddress = data.shippingAddress.trim();
    if (!shippingAddress) throw new Error("收件地址不能为空");
    const providerOrganizationId =
      resaleListing.supplyOffer.providerOrganizationId ??
      resaleListing.supplyOffer.store.organizationId ??
      context.organizationId;
    const fulfillmentLocation = await resolveOfferFulfillmentLocation({
      storeId: resaleListing.supplyOffer.storeId,
      providerOrganizationId,
      shipFromLocation: resaleListing.supplyOffer.shipFromLocation,
      shippingCountry: data.shippingCountry,
      skuId: resaleListing.supplyOfferItem.skuId,
      itemUnitId: resaleListing.supplyOfferItem.itemUnitId,
    });
    await assertFulfillmentAgreement({
      requesterOrganizationId: context.organizationId,
      providerOrganizationId,
      inventoryPoolId: resaleListing.supplyOffer.inventoryPoolId,
      locationId: fulfillmentLocation?.id ?? null,
    });

    const request = await prisma.$transaction(async (tx) => {
      const { channel, item } = await lockAndAssertOfferAvailability(tx, {
        offerId: resaleListing.supplyOfferId,
        offerItemId: resaleListing.supplyOfferItemId,
        quantity,
        channelId: resaleListing.supplyOfferChannelId,
      });
      const reservation = await tx.supplyReservation.create({
        data: {
          storeId: context.activeStoreId,
          supplyOfferId: resaleListing.supplyOfferId,
          supplyOfferItemId: item.id,
          supplyOfferChannelId: channel?.id ?? resaleListing.supplyOfferChannelId,
          resaleListingId: resaleListing.id,
          quantity,
          createdById: context.userId,
          note: data.note || null,
        },
      });

      await tx.supplyOffer.update({
        where: { id: resaleListing.supplyOfferId },
        data: { reservedQty: { increment: quantity } },
      });
      await tx.supplyOfferItem.update({
        where: { id: item.id },
        data: { quantityReserved: { increment: quantity } },
      });

      await tx.resaleListing.update({
        where: { id: resaleListing.id },
        data: { quantitySold: { increment: quantity }, updatedById: context.userId },
      });

      if (channel?.inventoryMode === "GUARANTEED") {
        await tx.supplyOfferChannel.update({
          where: { id: channel.id },
          data: { quotaReservedQty: { increment: quantity } },
        });
      }

      const created = await tx.fulfillmentRequest.create({
        data: {
          storeId: context.activeStoreId,
          requesterOrganizationId: context.organizationId,
          providerOrganizationId,
          inventoryPoolId: resaleListing.supplyOffer.inventoryPoolId,
          fulfillmentLocationId: fulfillmentLocation?.id ?? null,
          idempotencyKey: data.idempotencyKey || null,
          supplyOfferId: resaleListing.supplyOfferId,
          resaleListingId: resaleListing.id,
          customerOrderId: data.customerOrderId || null,
          reservationId: reservation.id,
          requestNo: nextRequestNo(),
          quantity,
          recipientName,
          recipientPhone: data.recipientPhone || null,
          shippingAddress,
          shippingCountry: data.shippingCountry || null,
          shippingCurrency: resaleListing.currency,
          note: data.note || null,
          createdById: context.userId,
          updatedById: context.userId,
        },
      });
      await allocateFulfillmentInventory(tx, created);
      return created;
    });

    revalidateFulfillmentSurfaces(request.id, resaleListing.id, resaleListing.supplyOfferId);
    return actionSuccess({ id: request.id });
  } catch (error) {
    return toActionFailure(error, "创建履约请求失败，请重试");
  }
}

export async function createResaleOrderFulfillmentAction(data: {
  storeId?: string;
  resaleListingId: string;
  quantity: string;
  externalOrderNo?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress: string;
  shippingCountry?: string;
  orderDate?: Date;
  note?: string;
  idempotencyKey?: string;
}) {
  try {
    const context = await requireUserContext(data.storeId ? { storeId: data.storeId } : undefined);
    const resaleListing = await prisma.resaleListing.findFirst({
      where: { id: data.resaleListingId, storeId: context.activeStoreId },
      include: {
        supplyOffer: { include: { store: true } },
        supplyOfferItem: true,
        platform: true,
      },
    });
    if (!resaleListing) throw new Error("代卖上架不存在或无权访问");
    if (data.idempotencyKey) {
      const existing = await prisma.fulfillmentRequest.findFirst({
        where: {
          requesterOrganizationId: context.organizationId,
          idempotencyKey: data.idempotencyKey,
        },
        select: { id: true, customerOrderId: true },
      });
      if (existing?.customerOrderId) {
        return actionSuccess({
          orderId: existing.customerOrderId,
          fulfillmentRequestId: existing.id,
        });
      }
    }
    if (resaleListing.status !== "ACTIVE") throw new Error("只有代卖中的记录可以登记售出");

    const quantity = parseDecimal(data.quantity, "售出数量", { required: true, min: 0 })!;
    const remainingOfferQty = resaleListing.supplyOffer.availableQty.minus(
      resaleListing.supplyOffer.reservedQty
    );
    if (quantity.gt(remainingOfferQty)) throw new Error("货盘可供数量不足，不能登记售出");
    if (!resaleListing.supplyOfferItem) throw new Error("代卖记录没有关联明确的货盘商品");
    if (
      quantity.gt(
        resaleListing.supplyOfferItem.quantityAvailable.minus(
          resaleListing.supplyOfferItem.quantityReserved
        )
      )
    ) {
      throw new Error("该货盘商品可供数量不足，不能登记售出");
    }
    const remainingListingQty = resaleListing.quantityPlanned.minus(resaleListing.quantitySold);
    if (quantity.gt(remainingListingQty)) throw new Error("代卖计划数量不足，不能登记售出");

    const customerName = data.customerName.trim();
    if (!customerName) throw new Error("客户姓名不能为空");
    const shippingAddress = data.shippingAddress.trim();
    if (!shippingAddress) throw new Error("收件地址不能为空");

    const orderDate = data.orderDate ?? new Date();
    const providerOrganizationId =
      resaleListing.supplyOffer.providerOrganizationId ??
      resaleListing.supplyOffer.store.organizationId ??
      context.organizationId;
    const fulfillmentLocation = await resolveOfferFulfillmentLocation({
      storeId: resaleListing.supplyOffer.storeId,
      providerOrganizationId,
      shipFromLocation: resaleListing.supplyOffer.shipFromLocation,
      shippingCountry: data.shippingCountry,
      skuId: resaleListing.supplyOfferItem.skuId,
      itemUnitId: resaleListing.supplyOfferItem.itemUnitId,
    });
    await assertFulfillmentAgreement({
      requesterOrganizationId: context.organizationId,
      providerOrganizationId,
      inventoryPoolId: resaleListing.supplyOffer.inventoryPoolId,
      locationId: fulfillmentLocation?.id ?? null,
    });
    const saleAmount = new Decimal(resaleListing.targetPrice.toString()).mul(quantity);
    const platformFee = resaleListing.platformFeeRate
      ? saleAmount.mul(new Decimal(resaleListing.platformFeeRate.toString()))
      : new Decimal(0);
    const netRevenue = saleAmount.minus(platformFee);
    const orderNumber = nextResaleOrderNo();

    const result = await prisma.$transaction(async (tx) => {
      const { channel, item } = await lockAndAssertOfferAvailability(tx, {
        offerId: resaleListing.supplyOfferId,
        offerItemId: resaleListing.supplyOfferItemId,
        quantity,
        channelId: resaleListing.supplyOfferChannelId,
      });
      const order = await tx.customerOrder.create({
        data: {
          storeId: context.activeStoreId,
          resaleListingId: resaleListing.id,
          platformId: resaleListing.platformId,
          salesChannelAccountId: resaleListing.salesChannelAccountId,
          orderNumber,
          externalOrderNo: data.externalOrderNo || null,
          customerName,
          customerEmail: data.customerEmail || null,
          customerPhone: data.customerPhone || null,
          shippingAddress,
          shippingCountry: data.shippingCountry || null,
          orderDate,
          currency: resaleListing.currency,
          subtotal: saleAmount,
          totalPaid: saleAmount,
          platformFee,
          shippingFee: "0",
          netRevenue,
          orderStatus: "CONFIRMED",
          confirmedAt: orderDate,
        },
      });

      const reservation = await tx.supplyReservation.create({
        data: {
          storeId: context.activeStoreId,
          supplyOfferId: resaleListing.supplyOfferId,
          supplyOfferItemId: item.id,
          supplyOfferChannelId: channel?.id ?? resaleListing.supplyOfferChannelId,
          resaleListingId: resaleListing.id,
          quantity,
          createdById: context.userId,
          note: data.note || null,
        },
      });

      await tx.supplyOffer.update({
        where: { id: resaleListing.supplyOfferId },
        data: { reservedQty: { increment: quantity } },
      });
      await tx.supplyOfferItem.update({
        where: { id: item.id },
        data: { quantityReserved: { increment: quantity } },
      });

      await tx.resaleListing.update({
        where: { id: resaleListing.id },
        data: { quantitySold: { increment: quantity }, updatedById: context.userId },
      });

      if (channel?.inventoryMode === "GUARANTEED") {
        await tx.supplyOfferChannel.update({
          where: { id: channel.id },
          data: { quotaReservedQty: { increment: quantity } },
        });
      }

      const request = await tx.fulfillmentRequest.create({
        data: {
          storeId: context.activeStoreId,
          requesterOrganizationId: context.organizationId,
          providerOrganizationId,
          inventoryPoolId: resaleListing.supplyOffer.inventoryPoolId,
          fulfillmentLocationId: fulfillmentLocation?.id ?? null,
          idempotencyKey: data.idempotencyKey || null,
          supplyOfferId: resaleListing.supplyOfferId,
          resaleListingId: resaleListing.id,
          customerOrderId: order.id,
          reservationId: reservation.id,
          requestNo: nextRequestNo(),
          quantity,
          recipientName: customerName,
          recipientPhone: data.customerPhone || null,
          shippingAddress,
          shippingCountry: data.shippingCountry || null,
          shippingCurrency: resaleListing.currency,
          note: data.note || null,
          createdById: context.userId,
          updatedById: context.userId,
        },
      });

      await allocateFulfillmentInventory(tx, request);

      return { order, request };
    });

    revalidateFulfillmentSurfaces(result.request.id, resaleListing.id, resaleListing.supplyOfferId);
    if (result.request.providerOrganizationId) {
      await notifyOrganizationAdministrators({
        organizationId: result.request.providerOrganizationId,
        actorId: context.userId,
        refType: "FULFILLMENT_REQUEST",
        refId: result.request.id,
        type: "FULFILLMENT_REQUESTED",
        title: `收到新的履约请求 ${result.request.requestNo}`,
        body: `数量：${result.request.quantity.toString()}`,
        actionUrl: `/fulfillment/requests/${encodeURIComponent(result.request.id)}`,
        dedupeKey: `fulfillment:${result.request.id}:requested`,
        priority: "HIGH",
      });
    }
    revalidatePath("/sales");
    revalidatePath(`/sales/${result.order.id}`);
    return actionSuccess({ orderId: result.order.id, fulfillmentRequestId: result.request.id });
  } catch (error) {
    return toActionFailure(error, "登记代卖售出失败，请重试");
  }
}

export async function updateFulfillmentRequestStatusAction(
  id: string,
  nextStatus: "ACCEPTED" | "REJECTED" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "EXCEPTION",
  data: {
    carrier?: string;
    trackingNo?: string;
    shippingFee?: string;
    serviceFee?: string;
    shippingCurrency?: string;
    note?: string;
    shippingProofUrl?: string;
  } = {}
) {
  try {
    const existing = await prisma.fulfillmentRequest.findUnique({
      where: { id },
      include: {
        reservation: true,
        resaleListing: true,
        supplyOffer: true,
        inventoryAllocations: true,
      },
    });
    if (!existing) throw new Error("履约请求不存在");
    const context = await requireUserContext();
    const isRequester =
      existing.requesterOrganizationId === context.organizationId ||
      context.storeIds.includes(existing.storeId);
    const isProvider = existing.providerOrganizationId
      ? existing.providerOrganizationId === context.organizationId ||
        existing.assignedToId === context.userId
      : context.storeIds.includes(existing.storeId) || existing.assignedToId === context.userId;
    if (!isRequester && !isProvider) throw new Error("无权操作该履约请求");
    if (["ACCEPTED", "REJECTED", "SHIPPED", "DELIVERED"].includes(nextStatus) && !isProvider) {
      throw new Error("只有服务方可以接受、拒绝或完成履约");
    }
    if (["ACCEPTED", "SHIPPED", "DELIVERED"].includes(nextStatus) && !canShipOrders(context.role)) {
      throw new Error("当前角色没有履约发货权限");
    }
    if (
      ["SHIPPED", "DELIVERED"].includes(nextStatus) &&
      existing.assignedToId &&
      existing.assignedToId !== context.userId
    ) {
      throw new Error("只有被指派的执行人可以完成发货或签收");
    }
    if (
      ["ACCEPTED", "SHIPPED"].includes(nextStatus) &&
      existing.fulfillmentLocationId &&
      !(await hasLocationCapability(context.userId, existing.fulfillmentLocationId, "ship"))
    ) {
      throw new Error("当前账号没有该仓库的发货权限");
    }
    if (nextStatus === "CANCELLED" && !isRequester && !isProvider)
      throw new Error("无权取消履约请求");
    if (["DELIVERED", "CANCELLED", "REJECTED"].includes(existing.status)) {
      throw new Error("当前状态不能继续流转");
    }
    const isInternalLegacyDirectShip =
      existing.status === "REQUESTED" &&
      nextStatus === "SHIPPED" &&
      existing.requesterOrganizationId === existing.providerOrganizationId;
    if (
      !(FULFILLMENT_TRANSITIONS[existing.status] ?? []).includes(nextStatus) &&
      !isInternalLegacyDirectShip
    ) {
      throw new Error(`履约状态不能从 ${existing.status} 变更为 ${nextStatus}`);
    }
    if (nextStatus === "SHIPPED" && !data.trackingNo?.trim()) {
      throw new Error("标记发货需要填写物流单号");
    }

    const shippingFee = parseDecimal(data.shippingFee, "代垫运费", { min: 0 });
    const configuredServiceFee =
      existing.resaleListing?.dropshipFee ?? existing.supplyOffer.dropshipFee;
    const serviceFee =
      data.serviceFee !== undefined
        ? parseDecimal(data.serviceFee, "代发服务费", { min: 0 })
        : configuredServiceFee
          ? new Decimal(configuredServiceFee.toString()).mul(existing.quantity)
          : null;
    const shippingProofUrl = data.shippingProofUrl?.trim() || null;
    if (shippingProofUrl) {
      const parsed = new URL(shippingProofUrl);
      if (!["http:", "https:"].includes(parsed.protocol))
        throw new Error("发货凭证必须是 HTTP(S) 地址");
    }
    if (nextStatus === "SHIPPED" && (shippingFee?.gt(0) || serviceFee?.gt(0))) {
      await ensureSystemChargeCategories();
    }
    const request = await prisma.$transaction(async (tx) => {
      const claimed = await tx.fulfillmentRequest.updateMany({
        where: { id: existing.id, status: existing.status },
        data: { updatedAt: new Date() },
      });
      if (claimed.count !== 1) throw new Error("履约状态已被其他操作更新，请刷新后重试");
      if (
        (nextStatus === "REJECTED" || nextStatus === "CANCELLED") &&
        existing.reservation?.status === "ACTIVE"
      ) {
        await tx.supplyReservation.update({
          where: { id: existing.reservation.id },
          data: { status: "RELEASED", releasedAt: new Date() },
        });
        await tx.supplyOffer.update({
          where: { id: existing.supplyOfferId },
          data: { reservedQty: { decrement: existing.quantity } },
        });
        if (existing.reservation.supplyOfferItemId) {
          await tx.supplyOfferItem.update({
            where: { id: existing.reservation.supplyOfferItemId },
            data: { quantityReserved: { decrement: existing.quantity } },
          });
        }
        if (existing.reservation.supplyOfferChannelId) {
          const channel = await tx.supplyOfferChannel.findUnique({
            where: { id: existing.reservation.supplyOfferChannelId },
          });
          if (channel?.inventoryMode === "GUARANTEED") {
            await tx.supplyOfferChannel.update({
              where: { id: channel.id },
              data: { quotaReservedQty: { decrement: existing.quantity } },
            });
          }
        }
        if (existing.resaleListingId) {
          await tx.resaleListing.update({
            where: { id: existing.resaleListingId },
            data: { quantitySold: { decrement: existing.quantity } },
          });
        }
        await tx.fulfillmentInventoryAllocation.updateMany({
          where: { fulfillmentRequestId: existing.id, status: "ALLOCATED" },
          data: { status: "RELEASED" },
        });
        const allocatedItemUnitIds = existing.inventoryAllocations
          .filter((allocation) => allocation.status === "ALLOCATED" && allocation.itemUnitId)
          .map((allocation) => allocation.itemUnitId as string);
        if (allocatedItemUnitIds.length > 0) {
          await tx.itemUnit.updateMany({
            where: { id: { in: allocatedItemUnitIds }, status: "ALLOCATED" },
            data: { status: "AVAILABLE" },
          });
        }
      }

      if (nextStatus === "SHIPPED" && existing.reservation?.status === "ACTIVE") {
        await allocateAndShipInventory(tx, existing);
        await tx.supplyReservation.update({
          where: { id: existing.reservation.id },
          data: { status: "CONSUMED", consumedAt: new Date() },
        });
        const updatedOffer = await tx.supplyOffer.update({
          where: { id: existing.supplyOfferId },
          data: {
            reservedQty: { decrement: existing.quantity },
            availableQty: { decrement: existing.quantity },
            fulfilledQty: { increment: existing.quantity },
          },
        });
        if (existing.reservation.supplyOfferItemId) {
          const updatedItem = await tx.supplyOfferItem.update({
            where: { id: existing.reservation.supplyOfferItemId },
            data: {
              quantityReserved: { decrement: existing.quantity },
              quantityAvailable: { decrement: existing.quantity },
            },
          });
          if (updatedItem.quantityAvailable.minus(updatedItem.quantityReserved).lte(0)) {
            await tx.resaleListing.updateMany({
              where: {
                supplyOfferItemId: updatedItem.id,
                status: "ACTIVE",
              },
              data: { status: "SOLD_OUT", pausedAt: new Date() },
            });
          }
        }
        if (updatedOffer.availableQty.minus(updatedOffer.reservedQty).lte(0)) {
          await tx.supplyOffer.update({
            where: { id: existing.supplyOfferId },
            data: { status: "PAUSED", pausedAt: new Date() },
          });
          await tx.resaleListing.updateMany({
            where: { supplyOfferId: existing.supplyOfferId, status: "ACTIVE" },
            data: { status: "SOLD_OUT", pausedAt: new Date() },
          });
        }
        if (existing.reservation.supplyOfferChannelId) {
          const channel = await tx.supplyOfferChannel.findUnique({
            where: { id: existing.reservation.supplyOfferChannelId },
          });
          if (channel?.inventoryMode === "GUARANTEED") {
            await tx.supplyOfferChannel.update({
              where: { id: channel.id },
              data: {
                quotaQty: { decrement: existing.quantity },
                quotaReservedQty: { decrement: existing.quantity },
              },
            });
          }
        }
      }

      if (
        nextStatus === "SHIPPED" &&
        shippingFee?.gt(0) &&
        existing.requesterOrganizationId &&
        existing.providerOrganizationId &&
        existing.requesterOrganizationId !== existing.providerOrganizationId
      ) {
        const category = await tx.chargeCategory.findFirstOrThrow({
          where: { organizationId: null, code: "SHIPPING" },
        });
        const [payer, payee] = await Promise.all([
          tx.organization.findUniqueOrThrow({ where: { id: existing.requesterOrganizationId } }),
          tx.organization.findUniqueOrThrow({ where: { id: existing.providerOrganizationId } }),
        ]);
        const alreadyExists = await tx.chargeEvent.findFirst({
          where: {
            organizationId: existing.providerOrganizationId,
            idempotencyKey: `fulfillment-shipping:${existing.id}`,
          },
        });
        if (!alreadyExists) {
          await tx.chargeEvent.create({
            data: {
              organizationId: existing.providerOrganizationId,
              categoryId: category.id,
              sourceType: "FULFILLMENT_REQUEST",
              sourceId: existing.id,
              idempotencyKey: `fulfillment-shipping:${existing.id}`,
              amountKind: "ACTUAL",
              amount: shippingFee,
              currency: data.shippingCurrency || existing.shippingCurrency || "CNY",
              status: "SUBMITTED",
              description: `履约 ${existing.requestNo} 代垫运费`,
              evidence: {
                carrier: data.carrier || existing.carrier,
                trackingNo: data.trackingNo || existing.trackingNo,
              },
              createdById: context.userId,
              submittedById: context.userId,
              submittedAt: new Date(),
              parties: {
                create: [
                  {
                    role: "PAYER",
                    partyType: "ORGANIZATION",
                    partyId: payer.id,
                    organizationId: payer.id,
                    nameSnapshot: payer.name,
                  },
                  {
                    role: "PAYEE",
                    partyType: "ORGANIZATION",
                    partyId: payee.id,
                    organizationId: payee.id,
                    nameSnapshot: payee.name,
                  },
                ],
              },
              allocations: {
                create: {
                  targetType: "FULFILLMENT_REQUEST",
                  targetId: existing.id,
                  amount: shippingFee,
                },
              },
            },
          });
        }
      }

      if (
        nextStatus === "SHIPPED" &&
        serviceFee?.gt(0) &&
        existing.requesterOrganizationId &&
        existing.providerOrganizationId &&
        existing.requesterOrganizationId !== existing.providerOrganizationId
      ) {
        const category = await tx.chargeCategory.findFirstOrThrow({
          where: { organizationId: null, code: "FULFILLMENT" },
        });
        const beneficiaryUserId = existing.assignedToId ?? context.userId;
        const [payer, payee, beneficiary] = await Promise.all([
          tx.organization.findUniqueOrThrow({ where: { id: existing.requesterOrganizationId } }),
          tx.organization.findUniqueOrThrow({ where: { id: existing.providerOrganizationId } }),
          tx.user.findUniqueOrThrow({ where: { id: beneficiaryUserId } }),
        ]);
        const beneficiaryStore = beneficiary.storeId
          ? await tx.store.findUnique({ where: { id: beneficiary.storeId } })
          : null;
        const providerStore =
          beneficiaryStore?.organizationId === existing.providerOrganizationId
            ? beneficiaryStore
            : await tx.store.findFirst({
                where: { organizationId: existing.providerOrganizationId },
                orderBy: { createdAt: "asc" },
              });
        if (!providerStore) throw new Error("服务方经营主体还没有可用于记录收益的店铺");
        const currency = (
          data.shippingCurrency ||
          existing.shippingCurrency ||
          providerStore.currency
        ).toUpperCase();
        let chargeEvent = await tx.chargeEvent.findFirst({
          where: {
            organizationId: existing.providerOrganizationId,
            idempotencyKey: `fulfillment-service:${existing.id}`,
          },
        });
        if (!chargeEvent) {
          chargeEvent = await tx.chargeEvent.create({
            data: {
              organizationId: existing.providerOrganizationId,
              categoryId: category.id,
              sourceType: "FULFILLMENT_REQUEST",
              sourceId: existing.id,
              idempotencyKey: `fulfillment-service:${existing.id}`,
              amountKind: "ACTUAL",
              amount: serviceFee,
              currency,
              status: "SUBMITTED",
              description: `履约 ${existing.requestNo} 代发服务费`,
              evidence: {
                carrier: data.carrier || existing.carrier,
                trackingNo: data.trackingNo || existing.trackingNo,
                operatorUserId: beneficiaryUserId,
              },
              createdById: context.userId,
              submittedById: context.userId,
              submittedAt: new Date(),
              parties: {
                create: [
                  {
                    role: "PAYER",
                    partyType: "ORGANIZATION",
                    partyId: payer.id,
                    organizationId: payer.id,
                    nameSnapshot: payer.name,
                  },
                  {
                    role: "PAYEE",
                    partyType: "ORGANIZATION",
                    partyId: payee.id,
                    organizationId: payee.id,
                    nameSnapshot: payee.name,
                  },
                  {
                    role: "BENEFICIARY",
                    partyType: "USER",
                    partyId: beneficiary.id,
                    organizationId: payee.id,
                    nameSnapshot: beneficiary.name ?? beneficiary.email,
                  },
                ],
              },
              allocations: {
                create: {
                  targetType: "FULFILLMENT_REQUEST",
                  targetId: existing.id,
                  amount: serviceFee,
                },
              },
            },
          });
        }
        const wallet = await tx.walletAccount.upsert({
          where: {
            storeId_ownerType_ownerId_currency: {
              storeId: providerStore.id,
              ownerType: "USER",
              ownerId: beneficiaryUserId,
              currency,
            },
          },
          update: {},
          create: {
            storeId: providerStore.id,
            ownerType: "USER",
            ownerId: beneficiaryUserId,
            currency,
          },
        });
        await tx.earningEvent.upsert({
          where: {
            storeId_userId_sourceType_sourceId_earningType: {
              storeId: providerStore.id,
              userId: beneficiaryUserId,
              sourceType: "FULFILLMENT_REQUEST",
              sourceId: existing.id,
              earningType: "FULFILLMENT_SERVICE_FEE",
            },
          },
          update: {
            walletAccountId: wallet.id,
            earningAmount: serviceFee,
            currency,
            status: "PENDING",
            metadata: { chargeEventId: chargeEvent.id, requestNo: existing.requestNo },
            updatedById: context.userId,
          },
          create: {
            storeId: providerStore.id,
            walletAccountId: wallet.id,
            userId: beneficiaryUserId,
            sourceType: "FULFILLMENT_REQUEST",
            sourceId: existing.id,
            earningType: "FULFILLMENT_SERVICE_FEE",
            description: `代发 ${existing.requestNo}`,
            grossAmount: serviceFee,
            baseAmount: serviceFee,
            earningAmount: serviceFee,
            currency,
            status: "PENDING",
            occurredAt: new Date(),
            metadata: { chargeEventId: chargeEvent.id, requestNo: existing.requestNo },
            createdById: context.userId,
            updatedById: context.userId,
          },
        });
      }

      if (existing.customerOrderId && nextStatus === "SHIPPED") {
        await tx.customerOrder.update({
          where: { id: existing.customerOrderId },
          data: {
            orderStatus: "SHIPPED",
            shippedAt: new Date(),
            trackingNo: data.trackingNo || existing.trackingNo,
          },
        });
      }

      if (existing.customerOrderId && nextStatus === "DELIVERED") {
        await tx.customerOrder.update({
          where: { id: existing.customerOrderId },
          data: {
            orderStatus: "DELIVERED",
          },
        });
      }

      if (existing.customerOrderId && (nextStatus === "REJECTED" || nextStatus === "CANCELLED")) {
        await tx.customerOrder.update({
          where: { id: existing.customerOrderId },
          data: {
            orderStatus: "CANCELLED",
          },
        });
      }

      const changed = await tx.fulfillmentRequest.update({
        where: { id },
        data: {
          status: nextStatus,
          assignedToId: nextStatus === "ACCEPTED" ? context.userId : existing.assignedToId,
          acceptedAt: nextStatus === "ACCEPTED" ? new Date() : existing.acceptedAt,
          shippedAt: nextStatus === "SHIPPED" ? new Date() : existing.shippedAt,
          deliveredAt: nextStatus === "DELIVERED" ? new Date() : existing.deliveredAt,
          cancelledAt: nextStatus === "CANCELLED" ? new Date() : existing.cancelledAt,
          carrier: data.carrier || existing.carrier,
          trackingNo: data.trackingNo || existing.trackingNo,
          shippingProof: shippingProofUrl
            ? { url: shippingProofUrl, submittedById: context.userId }
            : (existing.shippingProof ?? undefined),
          shippingFee: shippingFee ?? existing.shippingFee,
          shippingCurrency: data.shippingCurrency || existing.shippingCurrency,
          note: data.note || existing.note,
          updatedById: context.userId,
        },
      });
      if (nextStatus === "SHIPPED") {
        await recordWork(tx, {
          organizationId: existing.providerOrganizationId ?? context.organizationId,
          storeId: context.activeStoreId,
          userId: existing.assignedToId ?? context.userId,
          code: "FULFILLMENT_SHIPMENT",
          name: "代发出库",
          quantity: existing.quantity,
          unit: "件",
          sourceType: "FULFILLMENT_REQUEST",
          sourceId: existing.id,
          relationshipType:
            existing.requesterOrganizationId &&
            existing.requesterOrganizationId !==
              (existing.providerOrganizationId ?? context.organizationId)
              ? "PARTNER_ORGANIZATION"
              : "MEMBER",
          locationId: existing.fulfillmentLocationId,
          executorOrganizationId: context.organizationId,
          dedupeKey: `FULFILLMENT_SHIPPED:${existing.id}`,
          metadata: {
            requestNo: existing.requestNo,
            trackingNo: data.trackingNo || existing.trackingNo,
          },
        });
      }
      await tx.activityLog.create({
        data: {
          organizationId: context.organizationId,
          storeId: existing.storeId,
          actorId: context.userId,
          action: `FULFILLMENT_${nextStatus}`,
          refType: "FULFILLMENT_REQUEST",
          refId: existing.id,
          before: { status: existing.status },
          after: {
            status: nextStatus,
            carrier: data.carrier || existing.carrier,
            trackingNo: data.trackingNo || existing.trackingNo,
            shippingFee: shippingFee?.toString() ?? null,
            serviceFee: serviceFee?.toString() ?? null,
          },
          message:
            nextStatus === "SHIPPED"
              ? `执行人完成代发 ${existing.requestNo}`
              : `履约 ${existing.requestNo} 更新为 ${nextStatus}`,
        },
      });
      return changed;
    });

    let settlement:
      | { status: "CREATED" | "EXISTING"; id: string; message: string }
      | { status: "MANUAL_REQUIRED" | "BLOCKED"; id: null; message: string }
      | null = null;
    if (nextStatus === "SHIPPED" && request.resaleListingId) {
      try {
        const generated = await createSettlementFromFulfillment({
          fulfillmentRequestId: request.id,
          actorUserId: context.userId,
        });
        settlement = {
          status: generated.created ? "CREATED" : "EXISTING",
          id: generated.id,
          message: generated.created ? "已按实际发货费用生成待确认结算" : "本单已有有效结算",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "自动生成结算失败";
        settlement = {
          status: message.includes("双方确认") ? "MANUAL_REQUIRED" : "BLOCKED",
          id: null,
          message,
        };
      }
    }

    const counterpartOrganizationId =
      context.organizationId === request.providerOrganizationId
        ? request.requesterOrganizationId
        : request.providerOrganizationId;
    if (counterpartOrganizationId) {
      await notifyOrganizationAdministrators({
        organizationId: counterpartOrganizationId,
        actorId: context.userId,
        refType: "FULFILLMENT_REQUEST",
        refId: request.id,
        type: "FULFILLMENT_STATUS_CHANGED",
        title: `履约 ${request.requestNo} 状态已更新`,
        body: `当前状态：${request.status}`,
        actionUrl: `/fulfillment/requests/${encodeURIComponent(request.id)}`,
        dedupeKey: `fulfillment:${request.id}:status:${request.status}`,
        priority: ["REJECTED", "CANCELLED", "EXCEPTION"].includes(request.status)
          ? "HIGH"
          : "NORMAL",
      });
    }

    revalidateFulfillmentSurfaces(
      request.id,
      request.resaleListingId ?? undefined,
      request.supplyOfferId
    );
    revalidatePath("/finance/wallet");
    revalidatePath("/finance/settlements");
    return actionSuccess({ id: request.id, status: request.status, settlement });
  } catch (error) {
    return toActionFailure(error, "更新履约状态失败，请重试");
  }
}
