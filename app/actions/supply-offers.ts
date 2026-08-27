"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { getEffectiveSellableQuantity, getStoreStockBreakdown } from "@/lib/application/inventory";
import { assertOperationalSku } from "@/lib/application/sku-operability";
import { buildAgreementRule, toAgreementJson } from "@/lib/application/trading-agreement";
import { requireUserContext } from "@/lib/auth/user-context";
import { organizationPairKey } from "@/lib/application/organization-connections";
import { prisma } from "@/lib/prisma";

export type SupplyOfferItemInput = {
  id?: string;
  skuId?: string;
  itemUnitId?: string;
  title: string;
  variantCode?: string;
  quantityAvailable: string;
  unitPrice?: string;
  currency?: string;
  notes?: string;
};

type StringableDecimal = { toString(): string };

export type SerializedSupplyOfferItem = {
  id: string;
  skuId: string | null;
  itemUnitId: string | null;
  title: string;
  variantCode: string | null;
  quantityAvailable: string;
  quantityReserved: string;
  unitPrice: string | null;
  currency: string | null;
  notes: string | null;
  sku?: unknown;
  itemUnit?: unknown;
};

export type SerializedSupplyOffer = {
  id: string;
  storeId: string;
  organizationId: string | null;
  inventoryPoolId: string | null;
  providerOrganizationId: string | null;
  ownerPartnerId: string | null;
  title: string;
  description: string | null;
  visibility: string;
  status: string;
  inventoryPolicy: string;
  publishedQty: string;
  availableQty: string;
  reservedQty: string;
  fulfilledQty: string;
  safetyStockQty: string;
  unitPrice: string | null;
  currency: string | null;
  settlementCurrency: string | null;
  commissionType: string;
  commissionRate: string | null;
  commissionFixedAmount: string | null;
  dropshipFee: string | null;
  dropshipFeeCurrency: string | null;
  agreementTerms: string | null;
  agreementRule: unknown;
  agreementVersion: number;
  agreementStatus: string;
  agreementConfirmedAt: Date | null;
  fulfillmentMode: string;
  shipFromLocation: string | null;
  etaDays: number | null;
  minOrderQty: string | null;
  maxOrderQty: string | null;
  createdAt: Date;
  updatedAt: Date;
  ownerPartner: { id: string; name: string } | null;
  organization: { id: string; name: string; code: string } | null;
  inventoryPool: { id: string; name: string; code: string } | null;
  providerOrganization: { id: string; name: string; code: string } | null;
  items: SerializedSupplyOfferItem[];
  salesChannels: SerializedSupplyOfferChannel[];
  visibilityRules: Array<{
    id: string;
    scope: string;
    partnerId: string | null;
    viewerStoreId: string | null;
    viewerOrganizationId: string | null;
    partner: { id: string; name: string } | null;
    viewerStore: { id: string; name: string; code: string } | null;
  }>;
};

export type SerializedSupplyOfferChannel = {
  id: string;
  sellerOrganizationId: string | null;
  storeId: string | null;
  salesChannelAccountId: string | null;
  partnerId: string | null;
  channelType: string;
  inventoryMode: string;
  quotaQty: string;
  quotaReservedQty: string;
  status: string;
  expiresAt: Date | null;
  store: { id: string; name: string; code: string } | null;
  salesChannelAccount: { id: string; name: string; code: string; platformCode: string } | null;
  partner: { id: string; name: string; type: string } | null;
};

export type SupplyOfferInventoryOption = {
  key: string;
  sourceType: "SKU" | "ITEM_UNIT";
  skuId: string;
  itemUnitId?: string;
  title: string;
  skuCode: string;
  imageUrl: string | null;
  conditionGrade: string | null;
  sellableQty: string;
  inventoryPoolId: string | null;
  locationLabel: string;
  unitCost: string | null;
  costCurrency: string | null;
};

export type SupplyOfferFormContext = {
  organization: { id: string; name: string; code: string };
  inventoryPools: Array<{ id: string; name: string; code: string; baseCurrency: string }>;
  salesChannels: Array<{ id: string; name: string; code: string; platformCode: string }>;
  fulfillmentProviders: Array<{ id: string; name: string; code: string }>;
  inventoryOptions: SupplyOfferInventoryOption[];
};

export type SupplyOfferVisibilityStoreOption = {
  id: string;
  name: string;
  code: string;
};

type RawSupplyOfferItem = {
  id: string;
  skuId: string | null;
  itemUnitId: string | null;
  title: string;
  variantCode: string | null;
  quantityAvailable: StringableDecimal;
  quantityReserved: StringableDecimal;
  unitPrice: StringableDecimal | null;
  currency: string | null;
  notes: string | null;
  sku?: unknown;
  itemUnit?: unknown;
};

type RawSupplyOffer = Omit<
  SerializedSupplyOffer,
  | "availableQty"
  | "publishedQty"
  | "reservedQty"
  | "fulfilledQty"
  | "safetyStockQty"
  | "unitPrice"
  | "commissionRate"
  | "commissionFixedAmount"
  | "dropshipFee"
  | "minOrderQty"
  | "maxOrderQty"
  | "items"
  | "salesChannels"
> & {
  publishedQty: StringableDecimal;
  availableQty: StringableDecimal;
  reservedQty: StringableDecimal;
  fulfilledQty: StringableDecimal;
  safetyStockQty: StringableDecimal;
  unitPrice: StringableDecimal | null;
  commissionRate: StringableDecimal | null;
  commissionFixedAmount: StringableDecimal | null;
  dropshipFee: StringableDecimal | null;
  minOrderQty: StringableDecimal | null;
  maxOrderQty: StringableDecimal | null;
  items: RawSupplyOfferItem[];
  salesChannels: Array<
    Omit<SerializedSupplyOfferChannel, "quotaQty" | "quotaReservedQty"> & {
      quotaQty: StringableDecimal;
      quotaReservedQty: StringableDecimal;
    }
  >;
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
  if (options.min !== undefined && decimal.lt(options.min)) {
    throw new Error(`${label}不能小于 ${options.min}`);
  }
  return decimal;
}

function parseOptionalRate(value: string | undefined, label: string) {
  const rate = parseDecimal(value, label);
  if (!rate) return null;
  if (rate.lt(0) || rate.gt(1)) throw new Error(`${label}必须是 0 到 1 之间的数字`);
  return rate;
}

function normalizeOfferItems(items: SupplyOfferItemInput[]) {
  const clean = items
    .map((item) => ({
      ...item,
      title: item.title.trim(),
      quantityAvailable: parseDecimal(item.quantityAvailable, "可供数量", {
        required: true,
        min: 0,
      })!,
      unitPrice: parseDecimal(item.unitPrice, "供货单价", { min: 0 }),
    }))
    .filter((item) => item.title);

  if (clean.length === 0) throw new Error("至少需要添加一条货盘明细");
  if (clean.some((item) => item.quantityAvailable.lte(0)))
    throw new Error("货盘明细数量必须大于 0");
  return clean;
}

function sumAvailableQty(items: ReturnType<typeof normalizeOfferItems>) {
  return items.reduce((total, item) => total.plus(item.quantityAvailable ?? 0), new Decimal(0));
}

async function assertSupplyOfferOperationalSkus(input: {
  storeId: string;
  sourceSkuId?: string;
  items: ReturnType<typeof normalizeOfferItems>;
}) {
  const skuIds = [input.sourceSkuId, ...input.items.map((item) => item.skuId)].filter(
    (skuId): skuId is string => Boolean(skuId)
  );

  for (const skuId of [...new Set(skuIds)]) {
    await assertOperationalSku(prisma, {
      storeId: input.storeId,
      skuId,
      actionLabel: "发布货盘",
    });
  }
}

function revalidateOfferSurfaces(id?: string) {
  revalidatePath("/marketplace");
  revalidatePath("/marketplace/my-offers");
  revalidatePath("/inventory/sellable");
  if (id) {
    revalidatePath(`/marketplace/${id}`);
    revalidatePath(`/marketplace/my-offers/${id}`);
    revalidatePath(`/marketplace/my-offers/${id}/edit`);
  }
}

function normalizeViewerStoreIds(input: string[] | undefined, allowedStoreIds: string[]) {
  const allowed = new Set(allowedStoreIds);
  return [...new Set(input ?? [])].filter((id) => allowed.has(id));
}

function normalizeIds(input: Array<string | null | undefined> | undefined) {
  return [...new Set((input ?? []).filter((id): id is string => Boolean(id)))];
}

function normalizeCommissionType(value?: string) {
  const type = value || "MARGIN";
  if (!["MARGIN", "PERCENT", "FIXED", "HYBRID", "PROFIT_PERCENT", "MANUAL"].includes(type)) {
    throw new Error("佣金方式无效");
  }
  return type;
}

async function resolveOfferInventoryScope(input: {
  storeId: string;
  organizationId: string;
  activeInventoryPoolId: string | null;
  items: ReturnType<typeof normalizeOfferItems>;
  safetyStockQty: Decimal;
  requiresConfirmedCost?: boolean;
}) {
  const skuIds = normalizeIds(input.items.map((item) => item.skuId));
  const itemUnitIds = normalizeIds(input.items.map((item) => item.itemUnitId));
  if (skuIds.length === 0 && itemUnitIds.length === 0) {
    return {
      sourceType: "MANUAL",
      sourceSkuId: null,
      sourceItemUnitId: null,
      inventoryPoolId: input.activeInventoryPoolId,
    };
  }

  const [skus, itemUnits, stockBreakdown] = await Promise.all([
    prisma.sKU.findMany({
      where: { id: { in: skuIds } },
      select: { id: true, storeId: true, inventoryPoolId: true },
    }),
    prisma.itemUnit.findMany({
      where: { id: { in: itemUnitIds } },
      select: { id: true, skuId: true, storeId: true, inventoryPoolId: true, status: true, costStatus: true },
    }),
    getStoreStockBreakdown(input.storeId),
  ]);
  if (skus.length !== skuIds.length || skus.some((sku) => sku.storeId !== input.storeId)) {
    throw new Error("只能发布当前经营主体有权访问的商品");
  }
  if (
    itemUnits.length !== itemUnitIds.length ||
    itemUnits.some((item) => item.storeId !== input.storeId || item.status !== "AVAILABLE")
  ) {
    throw new Error("所选单件库存不存在、已占用或不可销售");
  }
  if (input.requiresConfirmedCost) {
    if (itemUnits.some((item) => item.costStatus !== "CONFIRMED")) {
      throw new Error("所选单件的采购成本仍待分摊，不能使用利润分成规则");
    }
    const pendingLots = await prisma.inventoryLot.count({
      where: {
        storeId: input.storeId,
        skuId: { in: skuIds },
        status: "ACTIVE",
        costStatus: { not: "CONFIRMED" },
      },
    });
    if (pendingLots > 0) {
      throw new Error("所选商品仍有成本待分摊的库存，不能使用利润分成规则");
    }
  }
  const selectedSkuIds = new Set(skuIds);
  if (itemUnits.some((item) => selectedSkuIds.has(item.skuId))) {
    throw new Error("同一商品不能同时按 SKU 和具体单件重复发布");
  }

  for (const item of input.items) {
    if (item.skuId) {
      const sellable = new Decimal(stockBreakdown.get(item.skuId)?.sellableQty ?? 0);
      if (item.quantityAvailable.gt(sellable)) {
        throw new Error(`${item.title} 发布数量超过当前可售库存 ${sellable.toString()}`);
      }
    }
    if (item.itemUnitId && !item.quantityAvailable.eq(1)) {
      throw new Error(`${item.title} 是单件库存，发布数量必须为 1`);
    }
  }

  const total = sumAvailableQty(input.items);
  const totalSellable = input.items.reduce((sum, item) => {
    if (item.itemUnitId) return sum.plus(1);
    return sum.plus(stockBreakdown.get(item.skuId ?? "")?.sellableQty ?? 0);
  }, new Decimal(0));
  if (total.plus(input.safetyStockQty).gt(totalSellable)) {
    throw new Error(`发布数量和安全库存合计不能超过当前可售库存 ${totalSellable.toString()}`);
  }

  const poolIds = normalizeIds([
    ...skus.map((sku) => sku.inventoryPoolId ?? undefined),
    ...itemUnits.map((item) => item.inventoryPoolId ?? undefined),
  ]);
  if (poolIds.length > 1) throw new Error("一个货盘暂不能跨多个库存池，仓库可以不同");
  const inventoryPoolId = poolIds[0] ?? input.activeInventoryPoolId;
  if (inventoryPoolId) {
    const pool = await prisma.inventoryPool.findFirst({
      where: { id: inventoryPoolId, organizationId: input.organizationId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!pool) throw new Error("所选库存不属于当前经营主体");
  }
  return {
    sourceType:
      itemUnitIds.length === 1 && skuIds.length === 0
        ? "ITEM_UNIT"
        : skuIds.length === 1 && itemUnitIds.length === 0
          ? "SKU"
          : "MULTI",
    sourceSkuId: skuIds.length === 1 && itemUnitIds.length === 0 ? skuIds[0] : null,
    sourceItemUnitId: itemUnitIds.length === 1 && skuIds.length === 0 ? itemUnitIds[0] : null,
    inventoryPoolId,
  };
}

type SupplyOfferChannelCreateInput = {
  sellerOrganizationId?: string;
  storeId?: string;
  salesChannelAccountId?: string;
  partnerId?: string;
  channelType: string;
  inventoryMode: string;
  createdById: string;
};

async function resolveOfferChannelCreates(input: {
  organizationId: string;
  storeId: string;
  userId: string;
  allowedChannelIds: string[];
  salesChannelAccountIds?: string[];
  resellerPartnerIds?: string[];
}): Promise<SupplyOfferChannelCreateInput[]> {
  const requestedChannelIds = normalizeIds(input.salesChannelAccountIds);
  if (requestedChannelIds.some((id) => !input.allowedChannelIds.includes(id))) {
    throw new Error("包含无权使用的销售账号");
  }
  const channels = await prisma.salesChannelAccount.findMany({
    where: {
      id: { in: requestedChannelIds },
      organizationId: input.organizationId,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (channels.length !== requestedChannelIds.length) throw new Error("销售账号不存在或已停用");

  const requestedPartnerIds = normalizeIds(input.resellerPartnerIds);
  const partners = await prisma.partner.findMany({
    where: { id: { in: requestedPartnerIds }, storeId: input.storeId, status: "ACTIVE" },
    select: { id: true, organizationId: true },
  });
  if (partners.length !== requestedPartnerIds.length) throw new Error("代卖方不存在或已停用");

  return [
    ...channels.map((channel) => ({
      sellerOrganizationId: input.organizationId,
      storeId: input.storeId,
      salesChannelAccountId: channel.id,
      channelType: "INTERNAL_ACCOUNT",
      inventoryMode: "SHARED",
      createdById: input.userId,
    })),
    ...partners.map((partner) => ({
      partnerId: partner.id,
      sellerOrganizationId: partner.organizationId ?? undefined,
      channelType: "RESELLER",
      inventoryMode: "SHARED",
      createdById: input.userId,
    })),
  ];
}

const offerInclude = {
  organization: {
    select: { id: true, name: true, code: true },
  },
  inventoryPool: {
    select: { id: true, name: true, code: true },
  },
  providerOrganization: {
    select: { id: true, name: true, code: true },
  },
  ownerPartner: true,
  sourceSku: true,
  sourceItemUnit: {
    include: { sku: true },
  },
  items: {
    include: {
      sku: true,
      itemUnit: {
        include: { sku: true },
      },
    },
    orderBy: { createdAt: "asc" as const },
  },
  visibilityRules: {
    include: {
      partner: true,
      viewerStore: true,
    },
  },
  salesChannels: {
    include: {
      store: { select: { id: true, name: true, code: true } },
      salesChannelAccount: { select: { id: true, name: true, code: true, platformCode: true } },
      partner: { select: { id: true, name: true, type: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

function serializeOffer(offer: RawSupplyOffer): SerializedSupplyOffer {
  return {
    ...offer,
    publishedQty: offer.publishedQty?.toString() ?? "0",
    availableQty: offer.availableQty?.toString() ?? "0",
    reservedQty: offer.reservedQty?.toString() ?? "0",
    fulfilledQty: offer.fulfilledQty?.toString() ?? "0",
    safetyStockQty: offer.safetyStockQty?.toString() ?? "0",
    unitPrice: offer.unitPrice?.toString() ?? null,
    commissionRate: offer.commissionRate?.toString() ?? null,
    commissionFixedAmount: offer.commissionFixedAmount?.toString() ?? null,
    dropshipFee: offer.dropshipFee?.toString() ?? null,
    minOrderQty: offer.minOrderQty?.toString() ?? null,
    maxOrderQty: offer.maxOrderQty?.toString() ?? null,
    items: offer.items.map((item) => ({
      ...item,
      quantityAvailable: item.quantityAvailable?.toString() ?? "0",
      quantityReserved: item.quantityReserved?.toString() ?? "0",
      unitPrice: item.unitPrice?.toString() ?? null,
    })),
    salesChannels: offer.salesChannels.map((channel) => ({
      ...channel,
      quotaQty: channel.quotaQty.toString(),
      quotaReservedQty: channel.quotaReservedQty.toString(),
    })),
  };
}

async function withEffectiveAvailability(offer: RawSupplyOffer): Promise<RawSupplyOffer> {
  const stock = await getStoreStockBreakdown(offer.storeId);
  const exactItemIds = offer.items
    .map((item) => item.itemUnitId)
    .filter((id): id is string => Boolean(id));
  const exactItems = exactItemIds.length
    ? await prisma.itemUnit.findMany({
        where: { id: { in: exactItemIds } },
        select: {
          id: true,
          status: true,
          allocations: {
            where: { status: "ALLOCATED" },
            select: { id: true },
          },
        },
      })
    : [];
  const exactById = new Map(exactItems.map((item) => [item.id, item]));
  const items = offer.items.map((item) => {
    let liveUnreserved: Decimal | null = null;
    if (item.itemUnitId) {
      const unit = exactById.get(item.itemUnitId);
      liveUnreserved =
        unit?.status === "AVAILABLE" && unit.allocations.length === 0
          ? new Decimal(1)
          : new Decimal(0);
    } else if (item.skuId) {
      liveUnreserved = new Decimal(stock.get(item.skuId)?.sellableQty ?? 0);
    }
    if (liveUnreserved == null) return item;
    const liveIncludingThisOfferReservations = liveUnreserved.plus(item.quantityReserved.toString());
    return {
      ...item,
      quantityAvailable: Decimal.min(item.quantityAvailable.toString(), liveIncludingThisOfferReservations),
    };
  });
  const liveTotal = items.reduce(
    (sum, item) => sum.plus(item.quantityAvailable.toString()),
    new Decimal(0),
  );
  return {
    ...offer,
    items,
    availableQty: Decimal.max(
      offer.reservedQty.toString(),
      Decimal.min(
        offer.availableQty.toString(),
        liveTotal.minus(offer.safetyStockQty.toString()),
      ),
    ),
  };
}

function visibleMarketplaceWhere(activeStoreId: string, organizationId?: string) {
  return {
    status: { in: ["PUBLISHED", "PAUSED"] },
    OR: [
      { storeId: activeStoreId },
      { visibility: "PUBLIC" },
      {
        visibility: "PARTNER_ONLY",
        visibilityRules: {
          some: {
            OR: [
              { viewerStoreId: activeStoreId },
              ...(organizationId
                ? [
                    {
                      viewerOrganizationId: organizationId,
                      organizationConnection: { status: "ACTIVE" },
                    },
                  ]
                : []),
              ...(organizationId
                ? [
                    {
                      partner: { organizationId },
                      organizationConnection: { status: "ACTIVE" },
                    },
                  ]
                : []),
            ],
          },
        },
      },
    ],
  };
}

async function resolveConnectedVisiblePartners(input: {
  partnerIds: string[];
  storeId: string;
  organizationId: string;
}) {
  const partners = await prisma.partner.findMany({
    where: { id: { in: input.partnerIds }, storeId: input.storeId, status: "ACTIVE" },
    select: { id: true, organizationId: true },
  });
  if (partners.length !== input.partnerIds.length) throw new Error("包含无效的可见合作方");
  if (partners.some((partner) => !partner.organizationId)) {
    throw new Error("可见合作方必须先连接到对方企业");
  }

  const pairKeys = partners.map((partner) =>
    organizationPairKey(input.organizationId, partner.organizationId!)
  );
  const connections = await prisma.organizationConnection.findMany({
    where: { pairKey: { in: pairKeys }, status: "ACTIVE" },
    select: { id: true, pairKey: true },
  });
  const connectionByPairKey = new Map(
    connections.map((connection) => [connection.pairKey, connection.id])
  );

  return partners.map((partner) => {
    const connectionId = connectionByPairKey.get(
      organizationPairKey(input.organizationId, partner.organizationId!)
    );
    if (!connectionId) throw new Error("可见合作方的企业连接已失效");
    return {
      ...partner,
      organizationId: partner.organizationId!,
      organizationConnectionId: connectionId,
    };
  });
}

export async function getMarketplaceOffers(storeId?: string) {
  const context = await requireUserContext(storeId ? { storeId } : undefined);
  const offers = await prisma.supplyOffer.findMany({
    where: visibleMarketplaceWhere(context.activeStoreId, context.organizationId),
    include: offerInclude,
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  return Promise.all(offers.map(async (offer) => serializeOffer(await withEffectiveAvailability(offer))));
}

export async function getSupplyOfferVisibilityStoreOptions(
  storeId?: string
): Promise<SupplyOfferVisibilityStoreOption[]> {
  const context = await requireUserContext(storeId ? { storeId } : undefined);
  return prisma.store.findMany({
    where: {
      id: { in: context.storeIds.filter((id) => id !== context.activeStoreId) },
    },
    select: {
      id: true,
      name: true,
      code: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function getSupplyOfferFormContext(storeId?: string): Promise<SupplyOfferFormContext> {
  const context = await requireUserContext(storeId ? { storeId } : undefined);
  const stockBreakdownPromise = getStoreStockBreakdown(context.activeStoreId);
  const [
    organization,
    inventoryPools,
    salesChannels,
    agreements,
    skus,
    itemUnits,
    inventoryLots,
    lotAggregates,
    stockBreakdown,
  ] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: context.organizationId },
      select: { id: true, name: true, code: true },
    }),
    prisma.inventoryPool.findMany({
      where: {
        organizationId: context.organizationId,
        status: "ACTIVE",
        OR: [{ id: { in: context.inventoryPoolIds } }, { legacyStoreId: context.activeStoreId }],
      },
      select: { id: true, name: true, code: true, baseCurrency: true },
      orderBy: { name: "asc" },
    }),
    prisma.salesChannelAccount.findMany({
      where: {
        organizationId: context.organizationId,
        status: "ACTIVE",
        id: { in: context.salesChannelAccountIds },
      },
      select: { id: true, name: true, code: true, platformCode: true },
      orderBy: { name: "asc" },
    }),
    prisma.serviceAgreement.findMany({
      where: {
        clientOrganizationId: context.organizationId,
        status: "ACTIVE",
      },
      select: {
        providerOrganization: { select: { id: true, name: true, code: true } },
        serviceTypes: true,
      },
    }),
    prisma.sKU.findMany({
      where: { storeId: context.activeStoreId },
      select: { id: true, code: true, name: true, imageUrl: true, inventoryPoolId: true },
      orderBy: { name: "asc" },
    }),
    prisma.itemUnit.findMany({
      where: {
        storeId: context.activeStoreId,
        status: "AVAILABLE",
        location: { isSellableDefault: true },
      },
      select: {
        id: true,
        skuId: true,
        inventoryPoolId: true,
        unitCost: true,
        costCurrency: true,
        conditionGrade: true,
        sku: { select: { code: true, name: true, imageUrl: true } },
        location: { select: { code: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.inventoryLot.findMany({
      where: {
        storeId: context.activeStoreId,
        status: "ACTIVE",
        location: { isSellableDefault: true },
      },
      select: {
        id: true,
        skuId: true,
        unitCost: true,
        costCurrency: true,
      },
    }),
    prisma.stockLedger.groupBy({
      by: ["entityId"],
      where: { storeId: context.activeStoreId, entityType: "LOT" },
      _sum: { deltaQty: true },
    }),
    stockBreakdownPromise,
  ]);

  const allocatedItemUnitIds = new Set(
    (
      await prisma.fulfillmentInventoryAllocation.findMany({
        where: {
          itemUnitId: { in: itemUnits.map((item) => item.id) },
          status: "ALLOCATED",
        },
        select: { itemUnitId: true },
      })
    )
      .map((item) => item.itemUnitId)
      .filter((id): id is string => Boolean(id))
  );

  const lotQuantityById = new Map(
    lotAggregates.map((aggregate) => [
      aggregate.entityId,
      new Decimal(aggregate._sum.deltaQty?.toString() ?? "0"),
    ])
  );
  const skuCostTotals = new Map<
    string,
    { currency: string; totalCost: Decimal; quantity: Decimal; mixedCurrency: boolean }
  >();
  const addSkuCost = (skuId: string, currency: string, unitCost: Decimal, quantity: Decimal) => {
    if (quantity.lte(0)) return;
    const current = skuCostTotals.get(skuId);
    if (!current) {
      skuCostTotals.set(skuId, {
        currency,
        totalCost: unitCost.times(quantity),
        quantity,
        mixedCurrency: false,
      });
      return;
    }
    if (current.currency !== currency) {
      current.mixedCurrency = true;
      return;
    }
    current.totalCost = current.totalCost.plus(unitCost.times(quantity));
    current.quantity = current.quantity.plus(quantity);
  };

  for (const lot of inventoryLots) {
    addSkuCost(
      lot.skuId,
      lot.costCurrency,
      new Decimal(lot.unitCost.toString()),
      lotQuantityById.get(lot.id) ?? new Decimal(0)
    );
  }
  for (const item of itemUnits) {
    if (allocatedItemUnitIds.has(item.id)) continue;
    addSkuCost(
      item.skuId,
      item.costCurrency,
      new Decimal(item.unitCost.toString()),
      new Decimal(1)
    );
  }

  const skuCostReference = (skuId: string) => {
    const cost = skuCostTotals.get(skuId);
    if (!cost || cost.mixedCurrency || cost.quantity.lte(0)) {
      return { unitCost: null, costCurrency: null };
    }
    return {
      unitCost: cost.totalCost.div(cost.quantity).toDecimalPlaces(2).toFixed(2),
      costCurrency: cost.currency,
    };
  };

  const skuOptions: SupplyOfferInventoryOption[] = skus.flatMap((sku) => {
    const stock = stockBreakdown.get(sku.id);
    if (!stock || stock.sellableQty <= 0) return [];
    const costReference = skuCostReference(sku.id);
    return [
      {
        key: `SKU:${sku.id}`,
        sourceType: "SKU" as const,
        skuId: sku.id,
        title: sku.name,
        skuCode: sku.code,
        imageUrl: sku.imageUrl,
        conditionGrade: null,
        sellableQty: stock.sellableQty.toString(),
        inventoryPoolId: sku.inventoryPoolId,
        locationLabel: stock.sellableLocations
          .map((location) => `${location.name} ${location.qty}`)
          .join(" / "),
        ...costReference,
      },
    ];
  });
  const itemUnitOptions: SupplyOfferInventoryOption[] = itemUnits
    .filter((item) => !allocatedItemUnitIds.has(item.id))
    .map((item) => ({
      key: `ITEM_UNIT:${item.id}`,
      sourceType: "ITEM_UNIT" as const,
      skuId: item.skuId,
      itemUnitId: item.id,
      title: item.sku.name,
      skuCode: item.sku.code,
      imageUrl: item.sku.imageUrl,
      conditionGrade: item.conditionGrade,
      sellableQty: "1",
      inventoryPoolId: item.inventoryPoolId,
      locationLabel: `${item.location.code} · ${item.location.name}`,
      unitCost: new Decimal(item.unitCost.toString()).toDecimalPlaces(2).toFixed(2),
      costCurrency: item.costCurrency,
    }));

  const providerMap = new Map<string, { id: string; name: string; code: string }>();
  providerMap.set(organization.id, organization);
  for (const agreement of agreements) {
    const services = Array.isArray(agreement.serviceTypes)
      ? agreement.serviceTypes.map(String)
      : [];
    if (services.includes("FULFILLMENT")) {
      providerMap.set(agreement.providerOrganization.id, agreement.providerOrganization);
    }
  }

  return {
    organization,
    inventoryPools,
    salesChannels,
    fulfillmentProviders: [...providerMap.values()],
    inventoryOptions: [...skuOptions, ...itemUnitOptions],
  };
}

export async function getMySupplyOffers(storeId?: string) {
  const context = await requireUserContext(storeId ? { storeId } : undefined);
  const offers = await prisma.supplyOffer.findMany({
    where: {
      OR: [
        { organizationId: context.organizationId },
        { organizationId: null, storeId: { in: context.storeIds } },
      ],
    },
    include: offerInclude,
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  return Promise.all(offers.map(async (offer) => serializeOffer(await withEffectiveAvailability(offer))));
}

export async function getSupplyOfferById(id: string, storeId?: string) {
  const context = await requireUserContext(storeId ? { storeId } : undefined);
  const offer = await prisma.supplyOffer.findFirst({
    where: {
      id,
      OR: [
        { organizationId: context.organizationId },
        { organizationId: null, storeId: { in: context.storeIds } },
        visibleMarketplaceWhere(context.activeStoreId, context.organizationId),
      ],
    },
    include: offerInclude,
  });

  return offer ? serializeOffer(await withEffectiveAvailability(offer)) : null;
}

export async function createSupplyOfferAction(data: {
  storeId?: string;
  title: string;
  description?: string;
  ownerPartnerId?: string;
  visibility?: string;
  inventoryPolicy?: string;
  safetyStockQty?: string;
  unitPrice?: string;
  currency?: string;
  settlementCurrency?: string;
  commissionType?: string;
  commissionRate?: string;
  commissionFixedAmount?: string;
  profitDeductions?: string[];
  dropshipFee?: string;
  dropshipFeeCurrency?: string;
  agreementTerms?: string;
  fulfillmentMode?: string;
  providerOrganizationId?: string;
  shipFromLocation?: string;
  etaDays?: string;
  minOrderQty?: string;
  maxOrderQty?: string;
  viewerStoreIds?: string[];
  viewerPartnerIds?: string[];
  salesChannelAccountIds?: string[];
  resellerPartnerIds?: string[];
  items: SupplyOfferItemInput[];
}) {
  try {
    const context = await requireUserContext(data.storeId ? { storeId: data.storeId } : undefined);
    const title = data.title.trim();
    if (!title) throw new Error("货盘标题不能为空");
    const items = normalizeOfferItems(data.items);
    const safetyStockQty = parseDecimal(data.safetyStockQty || "0", "安全库存", {
      required: true,
      min: 0,
    })!;
    const commissionType = normalizeCommissionType(
      data.commissionType || (data.commissionRate ? "PERCENT" : "MARGIN")
    );
    const commissionRate = parseOptionalRate(data.commissionRate, "默认佣金比例");
    const commissionFixedAmount = parseDecimal(data.commissionFixedAmount, "固定佣金", { min: 0 });
    if (["PERCENT", "HYBRID"].includes(commissionType) && !commissionRate) {
      throw new Error("当前佣金方式需要填写佣金比例");
    }
    if (["FIXED", "HYBRID"].includes(commissionType) && !commissionFixedAmount) {
      throw new Error("当前佣金方式需要填写固定佣金");
    }
    const agreementRule = buildAgreementRule({
      kind:
        commissionType === "PERCENT"
          ? "SALE_PERCENT"
          : commissionType === "FIXED"
            ? "FIXED_PER_UNIT"
            : commissionType === "HYBRID"
              ? "SALE_PERCENT_PLUS_FIXED"
              : commissionType,
      rate: data.commissionRate,
      fixedAmount: data.commissionFixedAmount,
      fixedCurrency: data.settlementCurrency || data.currency,
      profitDeductions: data.profitDeductions,
    });
    await assertSupplyOfferOperationalSkus({
      storeId: context.activeStoreId,
      items,
    });
    const inventoryScope = await resolveOfferInventoryScope({
      storeId: context.activeStoreId,
      organizationId: context.organizationId,
      activeInventoryPoolId: context.activeInventoryPoolId,
      items,
      safetyStockQty,
      requiresConfirmedCost: commissionType === "PROFIT_PERCENT",
    });
    const viewerStoreIds = normalizeViewerStoreIds(data.viewerStoreIds, context.storeIds);
    const viewerPartnerIds = normalizeIds(data.viewerPartnerIds);
    const visiblePartners = await resolveConnectedVisiblePartners({
      partnerIds: viewerPartnerIds,
      storeId: context.activeStoreId,
      organizationId: context.organizationId,
    });
    const channelCreates = await resolveOfferChannelCreates({
      organizationId: context.organizationId,
      storeId: context.activeStoreId,
      userId: context.userId,
      allowedChannelIds: context.salesChannelAccountIds,
      salesChannelAccountIds: data.salesChannelAccountIds,
      resellerPartnerIds: data.resellerPartnerIds,
    });
    const providerOrganizationId = data.providerOrganizationId || context.organizationId;
    if (providerOrganizationId !== context.organizationId) {
      const agreement = await prisma.serviceAgreement.findFirst({
        where: {
          clientOrganizationId: context.organizationId,
          providerOrganizationId,
          status: "ACTIVE",
        },
        select: { serviceTypes: true },
      });
      const services = Array.isArray(agreement?.serviceTypes)
        ? agreement.serviceTypes.map(String)
        : [];
      if (!services.includes("FULFILLMENT"))
        throw new Error("所选代发主体与当前经营主体没有有效代发协议");
    }
    const totalQty = sumAvailableQty(items);

    const offer = await prisma.supplyOffer.create({
      data: {
        storeId: context.activeStoreId,
        organizationId: context.organizationId,
        inventoryPoolId: inventoryScope.inventoryPoolId,
        providerOrganizationId,
        title,
        description: data.description || null,
        ownerPartnerId: data.ownerPartnerId || null,
        visibility: data.visibility || "PRIVATE",
        sourceType: inventoryScope.sourceType,
        sourceSkuId: inventoryScope.sourceSkuId,
        sourceItemUnitId: inventoryScope.sourceItemUnitId,
        inventoryPolicy: "SHARED_POOL",
        publishedQty: totalQty,
        availableQty: totalQty,
        safetyStockQty,
        unitPrice: parseDecimal(data.unitPrice, "供货单价", { min: 0 }),
        currency: data.currency || items[0]?.currency || null,
        settlementCurrency: data.settlementCurrency || data.currency || items[0]?.currency || null,
        commissionType,
        commissionRate,
        commissionFixedAmount,
        dropshipFee: parseDecimal(data.dropshipFee, "代发服务费", { min: 0 }),
        dropshipFeeCurrency:
          data.dropshipFeeCurrency || data.settlementCurrency || data.currency || items[0]?.currency || null,
        agreementTerms: data.agreementTerms?.trim() || null,
        agreementRule: toAgreementJson(agreementRule),
        agreementVersion: 1,
        agreementStatus: "DRAFT",
        fulfillmentMode: data.fulfillmentMode || "SUPPLIER_SHIPS",
        shipFromLocation: data.shipFromLocation || null,
        etaDays: data.etaDays ? Number(data.etaDays) : null,
        minOrderQty: parseDecimal(data.minOrderQty, "最小起订量", { min: 0 }),
        maxOrderQty: parseDecimal(data.maxOrderQty, "最大可下单量", { min: 0 }),
        createdById: context.userId,
        updatedById: context.userId,
        items: {
          create: items.map((item) => ({
            skuId: item.skuId || null,
            itemUnitId: item.itemUnitId || null,
            title: item.title,
            variantCode: item.variantCode || null,
            quantityAvailable: item.quantityAvailable,
            unitPrice: item.unitPrice,
            currency: item.currency || data.currency || null,
            notes: item.notes || null,
          })),
        },
        visibilityRules: {
          create: [
            ...viewerStoreIds.map((viewerStoreId) => ({ scope: "STORE", viewerStoreId })),
            ...visiblePartners.map((partner) => ({
              scope: "PARTNER",
              partnerId: partner.id,
              viewerOrganizationId: partner.organizationId,
              organizationConnectionId: partner.organizationConnectionId,
            })),
          ],
        },
        salesChannels: {
          create: channelCreates,
        },
      },
    });

    revalidateOfferSurfaces(offer.id);
    return actionSuccess({ id: offer.id });
  } catch (error) {
    return toActionFailure(error, "创建货盘失败，请重试");
  }
}

export async function updateSupplyOfferAction(
  id: string,
  data: {
    storeId?: string;
    title: string;
    description?: string;
    ownerPartnerId?: string;
    visibility?: string;
    inventoryPolicy?: string;
    safetyStockQty?: string;
    unitPrice?: string;
    currency?: string;
    settlementCurrency?: string;
    commissionType?: string;
    commissionRate?: string;
    commissionFixedAmount?: string;
    profitDeductions?: string[];
    dropshipFee?: string;
    dropshipFeeCurrency?: string;
    agreementTerms?: string;
    fulfillmentMode?: string;
    providerOrganizationId?: string;
    shipFromLocation?: string;
    etaDays?: string;
    minOrderQty?: string;
    maxOrderQty?: string;
    viewerStoreIds?: string[];
    viewerPartnerIds?: string[];
    salesChannelAccountIds?: string[];
    resellerPartnerIds?: string[];
    items: SupplyOfferItemInput[];
  }
) {
  try {
    const existing = await prisma.supplyOffer.findUnique({
      where: { id },
      include: { items: true, _count: { select: { resaleListings: true } } },
    });
    if (!existing) throw new Error("货盘不存在");
    const context = await requireUserContext({ storeId: data.storeId ?? existing.storeId });
    if ((existing.organizationId ?? context.organizationId) !== context.organizationId)
      throw new Error("只能编辑当前经营主体的货盘");
    if (existing.status === "DELISTED") throw new Error("已下架货盘不能继续编辑");
    const title = data.title.trim();
    if (!title) throw new Error("货盘标题不能为空");
    const items = normalizeOfferItems(data.items);
    if (existing.reservedQty.gt(0) || existing.fulfilledQty.gt(0)) {
      throw new Error("货盘已有订单或履约历史，不能再改商品与交易规则；请暂停后新建货盘");
    }
    const preserveItemRows = existing._count.resaleListings > 0;
    if (preserveItemRows) {
      const existingById = new Map(existing.items.map((item) => [item.id, item]));
      const keepsSameSources =
        items.length === existing.items.length &&
        items.every((item) => {
          const previous = item.id ? existingById.get(item.id) : null;
          return (
            previous &&
            previous.skuId === (item.skuId || null) &&
            previous.itemUnitId === (item.itemUnitId || null)
          );
        });
      if (!keepsSameSources) {
        throw new Error("货盘已有代卖记录，不能增删或更换商品明细；请暂停后新建货盘");
      }
    }
    const safetyStockQty = parseDecimal(
      data.safetyStockQty || existing.safetyStockQty.toString(),
      "安全库存",
      { required: true, min: 0 }
    )!;
    const commissionType = normalizeCommissionType(data.commissionType || existing.commissionType);
    const commissionRate = parseOptionalRate(data.commissionRate, "默认佣金比例");
    const commissionFixedAmount = parseDecimal(data.commissionFixedAmount, "固定佣金", { min: 0 });
    if (["PERCENT", "HYBRID"].includes(commissionType) && !commissionRate) {
      throw new Error("当前佣金方式需要填写佣金比例");
    }
    if (["FIXED", "HYBRID"].includes(commissionType) && !commissionFixedAmount) {
      throw new Error("当前佣金方式需要填写固定佣金");
    }
    const agreementRule = buildAgreementRule({
      kind:
        commissionType === "PERCENT"
          ? "SALE_PERCENT"
          : commissionType === "FIXED"
            ? "FIXED_PER_UNIT"
            : commissionType === "HYBRID"
              ? "SALE_PERCENT_PLUS_FIXED"
              : commissionType,
      rate: data.commissionRate,
      fixedAmount: data.commissionFixedAmount,
      fixedCurrency:
        data.settlementCurrency || data.currency || existing.settlementCurrency || existing.currency,
      profitDeductions: data.profitDeductions,
    });
    const agreementTerms = data.agreementTerms?.trim() || null;
    const agreementChanged =
      agreementTerms !== existing.agreementTerms ||
      JSON.stringify(agreementRule) !== JSON.stringify(existing.agreementRule);
    await assertSupplyOfferOperationalSkus({
      storeId: context.activeStoreId,
      items,
    });
    const inventoryScope = await resolveOfferInventoryScope({
      storeId: context.activeStoreId,
      organizationId: context.organizationId,
      activeInventoryPoolId: context.activeInventoryPoolId,
      items,
      safetyStockQty,
      requiresConfirmedCost: commissionType === "PROFIT_PERCENT",
    });
    const totalQty = sumAvailableQty(items);
    if (totalQty.lt(existing.reservedQty)) throw new Error("发布数量不能小于当前订单已预留数量");
    const viewerStoreIds = normalizeViewerStoreIds(data.viewerStoreIds, context.storeIds);
    const viewerPartnerIds = normalizeIds(data.viewerPartnerIds);
    const visiblePartners = await resolveConnectedVisiblePartners({
      partnerIds: viewerPartnerIds,
      storeId: context.activeStoreId,
      organizationId: context.organizationId,
    });
    const channelCreates = await resolveOfferChannelCreates({
      organizationId: context.organizationId,
      storeId: context.activeStoreId,
      userId: context.userId,
      allowedChannelIds: context.salesChannelAccountIds,
      salesChannelAccountIds: data.salesChannelAccountIds,
      resellerPartnerIds: data.resellerPartnerIds,
    });
    const providerOrganizationId =
      data.providerOrganizationId || existing.providerOrganizationId || context.organizationId;
    if (providerOrganizationId !== context.organizationId) {
      const agreement = await prisma.serviceAgreement.findFirst({
        where: {
          clientOrganizationId: context.organizationId,
          providerOrganizationId,
          status: "ACTIVE",
        },
        select: { serviceTypes: true },
      });
      const services = Array.isArray(agreement?.serviceTypes)
        ? agreement.serviceTypes.map(String)
        : [];
      if (!services.includes("FULFILLMENT"))
        throw new Error("所选代发主体与当前经营主体没有有效代发协议");
    }

    const offer = await prisma.$transaction(async (tx) => {
      if (!preserveItemRows) {
        await tx.supplyOfferItem.deleteMany({ where: { offerId: id } });
      }
      await tx.offerVisibility.deleteMany({ where: { offerId: id } });
      await tx.supplyOfferChannel.updateMany({
        where: { offerId: id },
        data: { status: "REVOKED" },
      });
      for (const channel of channelCreates) {
        if (channel.salesChannelAccountId) {
          await tx.supplyOfferChannel.upsert({
            where: {
              offerId_salesChannelAccountId: {
                offerId: id,
                salesChannelAccountId: channel.salesChannelAccountId,
              },
            },
            update: { ...channel, status: "ACTIVE" },
            create: { ...channel, offerId: id },
          });
        } else if (channel.partnerId) {
          const existingChannel = await tx.supplyOfferChannel.findFirst({
            where: { offerId: id, partnerId: channel.partnerId },
          });
          if (existingChannel) {
            await tx.supplyOfferChannel.update({
              where: { id: existingChannel.id },
              data: { ...channel, status: "ACTIVE" },
            });
          } else {
            await tx.supplyOfferChannel.create({ data: { ...channel, offerId: id } });
          }
        }
      }
      return tx.supplyOffer.update({
        where: { id },
        data: {
          title,
          description: data.description || null,
          organizationId: context.organizationId,
          inventoryPoolId: inventoryScope.inventoryPoolId,
          providerOrganizationId,
          ownerPartnerId: data.ownerPartnerId || null,
          visibility: data.visibility || "PRIVATE",
          sourceType: inventoryScope.sourceType,
          sourceSkuId: inventoryScope.sourceSkuId,
          sourceItemUnitId: inventoryScope.sourceItemUnitId,
          inventoryPolicy: "SHARED_POOL",
          publishedQty: totalQty.plus(existing.fulfilledQty),
          availableQty: totalQty,
          safetyStockQty,
          unitPrice: parseDecimal(data.unitPrice, "供货单价", { min: 0 }),
          currency: data.currency || items[0]?.currency || null,
          settlementCurrency:
            data.settlementCurrency || data.currency || items[0]?.currency || null,
          commissionType,
          commissionRate,
          commissionFixedAmount,
          dropshipFee: parseDecimal(data.dropshipFee, "代发服务费", { min: 0 }),
          dropshipFeeCurrency:
            data.dropshipFeeCurrency ||
            data.settlementCurrency ||
            data.currency ||
            existing.dropshipFeeCurrency ||
            null,
          agreementTerms,
          agreementRule: toAgreementJson(agreementRule),
          agreementVersion: agreementChanged ? { increment: 1 } : existing.agreementVersion,
          agreementStatus: agreementChanged ? "DRAFT" : existing.agreementStatus,
          agreementConfirmedAt: agreementChanged ? null : existing.agreementConfirmedAt,
          status: agreementChanged && existing.status === "PUBLISHED" ? "DRAFT" : existing.status,
          fulfillmentMode: data.fulfillmentMode || "SUPPLIER_SHIPS",
          shipFromLocation: data.shipFromLocation || null,
          etaDays: data.etaDays ? Number(data.etaDays) : null,
          minOrderQty: parseDecimal(data.minOrderQty, "最小起订量", { min: 0 }),
          maxOrderQty: parseDecimal(data.maxOrderQty, "最大可下单量", { min: 0 }),
          updatedById: context.userId,
          items: preserveItemRows
            ? {
                update: items.map((item) => ({
                  where: { id: item.id! },
                  data: {
                    title: item.title,
                    variantCode: item.variantCode || null,
                    quantityAvailable: item.quantityAvailable,
                    unitPrice: item.unitPrice,
                    currency: item.currency || data.currency || null,
                    notes: item.notes || null,
                  },
                })),
              }
            : {
                create: items.map((item) => ({
                  skuId: item.skuId || null,
                  itemUnitId: item.itemUnitId || null,
                  title: item.title,
                  variantCode: item.variantCode || null,
                  quantityAvailable: item.quantityAvailable,
                  unitPrice: item.unitPrice,
                  currency: item.currency || data.currency || null,
                  notes: item.notes || null,
                })),
              },
          visibilityRules: {
            create: [
              ...viewerStoreIds.map((viewerStoreId) => ({ scope: "STORE", viewerStoreId })),
              ...visiblePartners.map((partner) => ({
                scope: "PARTNER",
                partnerId: partner.id,
                viewerOrganizationId: partner.organizationId,
                organizationConnectionId: partner.organizationConnectionId,
              })),
            ],
          },
        },
      });
    });

    revalidateOfferSurfaces(offer.id);
    return actionSuccess({ id: offer.id });
  } catch (error) {
    return toActionFailure(error, "保存货盘失败，请重试");
  }
}

export async function changeSupplyOfferStatusAction(
  id: string,
  nextStatus: "PUBLISHED" | "PAUSED" | "DELISTED" | "DRAFT"
) {
  try {
    const existing = await prisma.supplyOffer.findUnique({
      where: { id },
      include: {
        items: { include: { sku: { select: { imageUrl: true } } } },
      },
    });
    if (!existing) throw new Error("货盘不存在");
    const context = await requireUserContext({ storeId: existing.storeId });
    if ((existing.organizationId ?? context.organizationId) !== context.organizationId)
      throw new Error("只能操作当前经营主体的货盘");
    if (existing.status === "DELISTED" && nextStatus !== "DRAFT") {
      throw new Error("已下架货盘不能恢复，请复制后重新发布");
    }
    if (nextStatus === "PUBLISHED" && existing.availableQty.lte(existing.reservedQty)) {
      throw new Error("可供数量不足，不能发布");
    }
    if (nextStatus === "PUBLISHED") {
      if (existing.organizationId && existing.organizationId !== context.organizationId) {
        throw new Error("货盘不属于当前经营主体");
      }
      const normalizedItems = normalizeOfferItems(
        existing.items.map((item) => ({
          id: item.id,
          skuId: item.skuId ?? undefined,
          itemUnitId: item.itemUnitId ?? undefined,
          title: item.title,
          variantCode: item.variantCode ?? undefined,
          quantityAvailable: item.quantityAvailable.toString(),
          unitPrice: item.unitPrice?.toString(),
          currency: item.currency ?? undefined,
          notes: item.notes ?? undefined,
        }))
      );
      await resolveOfferInventoryScope({
        storeId: context.activeStoreId,
        organizationId: context.organizationId,
        activeInventoryPoolId: context.activeInventoryPoolId,
        items: normalizedItems,
        safetyStockQty: existing.safetyStockQty,
      });
      if (existing.sourceType === "MANUAL" && !existing.ownerPartnerId) {
        throw new Error("外部供给发布前必须指定供给方");
      }
      if (!existing.agreementTerms?.trim()) {
        throw new Error("发布前请写清双方合作约定；系统试算模板不能替代双方约定");
      }
      if (!existing.agreementRule) {
        throw new Error("发布前请选择系统试算建议，无法自动计算时请选择“成交后双方确认”");
      }
      if (existing.visibility === "PUBLIC") {
        if (!existing.unitPrice) throw new Error("公开货盘必须填写供货价");
        if (!existing.items.some((item) => item.sku?.imageUrl))
          throw new Error("公开货盘至少需要一个有图片的商品");
      }
    }

    const offer = await prisma.supplyOffer.update({
      where: { id },
      data: {
        status: nextStatus,
        publishedAt:
          nextStatus === "PUBLISHED" ? (existing.publishedAt ?? new Date()) : existing.publishedAt,
        pausedAt: nextStatus === "PAUSED" ? new Date() : null,
        agreementStatus: nextStatus === "PUBLISHED" ? "CONFIRMED" : existing.agreementStatus,
        agreementConfirmedAt:
          nextStatus === "PUBLISHED" ? new Date() : existing.agreementConfirmedAt,
        updatedById: context.userId,
      },
    });

    revalidateOfferSurfaces(offer.id);
    return actionSuccess({ id: offer.id, status: offer.status });
  } catch (error) {
    return toActionFailure(error, "更新货盘状态失败，请重试");
  }
}

export async function deleteDraftSupplyOfferAction(id: string) {
  try {
    const existing = await prisma.supplyOffer.findUnique({ where: { id } });
    if (!existing) throw new Error("货盘不存在");
    await requireUserContext({ storeId: existing.storeId });
    if (existing.status !== "DRAFT") throw new Error("只有草稿货盘可以删除");

    await prisma.supplyOffer.delete({ where: { id } });
    revalidateOfferSurfaces(id);
    return actionSuccess({ id });
  } catch (error) {
    return toActionFailure(error, "删除草稿失败，请重试");
  }
}

export async function updateSupplyOfferChannelPolicyAction(data: {
  channelId: string;
  inventoryMode: "SHARED" | "GUARANTEED";
  quotaQty?: string;
  expiresAt?: string;
  status?: "ACTIVE" | "PAUSED" | "REVOKED";
}) {
  try {
    const channel = await prisma.supplyOfferChannel.findUnique({
      where: { id: data.channelId },
      include: { offer: { include: { items: true } } },
    });
    if (!channel) throw new Error("销售渠道授权不存在");
    const context = await requireUserContext();
    if ((channel.offer.organizationId ?? context.organizationId) !== context.organizationId) {
      throw new Error("只能管理当前经营主体的货盘渠道");
    }
    const quotaQty =
      data.inventoryMode === "GUARANTEED"
        ? parseDecimal(data.quotaQty, "保证配额", { required: true, min: 0 })!
        : new Decimal(0);
    if (data.inventoryMode === "GUARANTEED" && quotaQty.lte(0))
      throw new Error("保证配额必须大于 0");
    if (quotaQty.lt(channel.quotaReservedQty))
      throw new Error("保证配额不能小于该渠道当前订单占用");
    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new Error("配额到期时间无效");
    const nextStatus = data.status ?? channel.status;
    if (data.inventoryMode === "GUARANTEED") {
      const skuIds = [
        ...new Set(channel.offer.items.map((item) => item.skuId).filter(Boolean)),
      ] as string[];
      const hasSpecificItem = channel.offer.items.some((item) => item.itemUnitId);
      if (skuIds.length !== 1 || hasSpecificItem || channel.offer.items.length !== 1) {
        throw new Error("保证配额目前仅支持单一 SKU 的批量货盘；混合货盘和指定单品请使用共享库存");
      }
      await prisma.$transaction(async (tx) => {
        const now = new Date();
        await tx.$queryRaw`SELECT "id" FROM "skus" WHERE "id" = ${skuIds[0]} FOR UPDATE`;
        const otherChannels = await tx.supplyOfferChannel.findMany({
          where: {
            offerId: channel.offerId,
            id: { not: channel.id },
            status: "ACTIVE",
            inventoryMode: "GUARANTEED",
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          select: { quotaQty: true },
        });
        const totalGuaranteed = otherChannels.reduce(
          (sum, item) => sum.plus(item.quotaQty),
          quotaQty
        );
        if (totalGuaranteed.gt(channel.offer.availableQty)) {
          throw new Error(
            `保证配额合计不能超过货盘剩余数量 ${channel.offer.availableQty.toString()}`
          );
        }

        const currentProtected =
          channel.inventoryMode === "GUARANTEED" &&
          channel.status === "ACTIVE" &&
          (!channel.expiresAt || channel.expiresAt > now)
            ? Decimal.max(channel.quotaQty.minus(channel.quotaReservedQty), 0)
            : new Decimal(0);
        const nextProtected =
          nextStatus === "ACTIVE" && (!expiresAt || expiresAt > now)
            ? Decimal.max(quotaQty.minus(channel.quotaReservedQty), 0)
            : new Decimal(0);
        const unprotectedSellable = await getEffectiveSellableQuantity(
          tx,
          channel.offer.storeId,
          skuIds[0],
          undefined,
          channel.offer.inventoryPoolId
        );
        if (nextProtected.gt(unprotectedSellable.plus(currentProtected))) {
          throw new Error("真实可售库存不足，无法为该渠道划出这笔保证配额");
        }

        await tx.supplyOfferChannel.update({
          where: { id: channel.id },
          data: {
            inventoryMode: data.inventoryMode,
            quotaQty,
            expiresAt,
            status: nextStatus,
          },
        });
      });
    } else {
      await prisma.supplyOfferChannel.update({
        where: { id: channel.id },
        data: {
          inventoryMode: data.inventoryMode,
          quotaQty,
          expiresAt,
          status: nextStatus,
        },
      });
    }
    revalidateOfferSurfaces(channel.offerId);
    return actionSuccess({ id: channel.id });
  } catch (error) {
    return toActionFailure(error, "更新渠道库存策略失败");
  }
}
