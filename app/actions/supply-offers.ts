"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { assertOperationalSku } from "@/lib/application/sku-operability";
import { requireUserContext } from "@/lib/auth/user-context";
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
  ownerPartnerId: string | null;
  title: string;
  description: string | null;
  visibility: string;
  status: string;
  availableQty: string;
  reservedQty: string;
  unitPrice: string | null;
  currency: string | null;
  commissionRate: string | null;
  fulfillmentMode: string;
  shipFromLocation: string | null;
  etaDays: number | null;
  minOrderQty: string | null;
  maxOrderQty: string | null;
  createdAt: Date;
  updatedAt: Date;
  ownerPartner: { id: string; name: string } | null;
  items: SerializedSupplyOfferItem[];
  visibilityRules: Array<{
    id: string;
    scope: string;
    partnerId: string | null;
    viewerStoreId: string | null;
    partner: { id: string; name: string } | null;
    viewerStore: { id: string; name: string; code: string } | null;
  }>;
};

export type SupplyOfferVisibilityStoreOption = {
  id: string;
  name: string;
  code: string;
};

type RawSupplyOfferItem = {
  id: string;
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
  | "reservedQty"
  | "unitPrice"
  | "commissionRate"
  | "minOrderQty"
  | "maxOrderQty"
  | "items"
> & {
  availableQty: StringableDecimal;
  reservedQty: StringableDecimal;
  unitPrice: StringableDecimal | null;
  commissionRate: StringableDecimal | null;
  minOrderQty: StringableDecimal | null;
  maxOrderQty: StringableDecimal | null;
  items: RawSupplyOfferItem[];
};

function parseDecimal(value: string | undefined, label: string, options: { required?: boolean; min?: Decimal.Value } = {}) {
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
      quantityAvailable: parseDecimal(item.quantityAvailable, "可供数量", { required: true, min: 0 })!,
      unitPrice: parseDecimal(item.unitPrice, "供货单价", { min: 0 }),
    }))
    .filter((item) => item.title);

  if (clean.length === 0) throw new Error("至少需要添加一条货盘明细");
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
  const skuIds = [
    input.sourceSkuId,
    ...input.items.map((item) => item.skuId),
  ].filter((skuId): skuId is string => Boolean(skuId));

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

const offerInclude = {
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
} as const;

function serializeOffer(offer: RawSupplyOffer): SerializedSupplyOffer {
  return {
    ...offer,
    availableQty: offer.availableQty?.toString() ?? "0",
    reservedQty: offer.reservedQty?.toString() ?? "0",
    unitPrice: offer.unitPrice?.toString() ?? null,
    commissionRate: offer.commissionRate?.toString() ?? null,
    minOrderQty: offer.minOrderQty?.toString() ?? null,
    maxOrderQty: offer.maxOrderQty?.toString() ?? null,
    items: offer.items.map((item) => ({
      ...item,
      quantityAvailable: item.quantityAvailable?.toString() ?? "0",
      quantityReserved: item.quantityReserved?.toString() ?? "0",
      unitPrice: item.unitPrice?.toString() ?? null,
    })),
  };
}

function visibleMarketplaceWhere(activeStoreId: string) {
  return {
    status: { in: ["PUBLISHED", "PAUSED"] },
    OR: [
      { storeId: activeStoreId },
      { visibility: "PUBLIC" },
      {
        visibility: "PARTNER_ONLY",
        visibilityRules: {
          some: { viewerStoreId: activeStoreId },
        },
      },
    ],
  };
}

export async function getMarketplaceOffers(storeId?: string) {
  const context = await requireUserContext(storeId ? { storeId } : undefined);
  const offers = await prisma.supplyOffer.findMany({
    where: visibleMarketplaceWhere(context.activeStoreId),
    include: offerInclude,
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  return offers.map(serializeOffer);
}

export async function getSupplyOfferVisibilityStoreOptions(storeId?: string): Promise<SupplyOfferVisibilityStoreOption[]> {
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

export async function getMySupplyOffers(storeId?: string) {
  const context = await requireUserContext(storeId ? { storeId } : undefined);
  const offers = await prisma.supplyOffer.findMany({
    where: { storeId: context.activeStoreId },
    include: offerInclude,
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  return offers.map(serializeOffer);
}

export async function getSupplyOfferById(id: string, storeId?: string) {
  const context = await requireUserContext(storeId ? { storeId } : undefined);
  const offer = await prisma.supplyOffer.findFirst({
    where: {
      id,
      OR: [
        { storeId: context.activeStoreId },
        visibleMarketplaceWhere(context.activeStoreId),
      ],
    },
    include: offerInclude,
  });

  return offer ? serializeOffer(offer) : null;
}

export async function createSupplyOfferAction(data: {
  storeId?: string;
  title: string;
  description?: string;
  ownerPartnerId?: string;
  visibility?: string;
  sourceType?: string;
  sourceSkuId?: string;
  sourceItemUnitId?: string;
  unitPrice?: string;
  currency?: string;
  commissionRate?: string;
  fulfillmentMode?: string;
  shipFromLocation?: string;
  etaDays?: string;
  minOrderQty?: string;
  maxOrderQty?: string;
  viewerStoreIds?: string[];
  items: SupplyOfferItemInput[];
}) {
  try {
    const context = await requireUserContext(data.storeId ? { storeId: data.storeId } : undefined);
    const title = data.title.trim();
    if (!title) throw new Error("货盘标题不能为空");
    const items = normalizeOfferItems(data.items);
    await assertSupplyOfferOperationalSkus({
      storeId: context.activeStoreId,
      sourceSkuId: data.sourceSkuId,
      items,
    });
    const viewerStoreIds = normalizeViewerStoreIds(data.viewerStoreIds, context.storeIds);

    const offer = await prisma.supplyOffer.create({
      data: {
        storeId: context.activeStoreId,
        title,
        description: data.description || null,
        ownerPartnerId: data.ownerPartnerId || null,
        visibility: data.visibility || "PRIVATE",
        sourceType: data.sourceType || "MANUAL",
        sourceSkuId: data.sourceSkuId || null,
        sourceItemUnitId: data.sourceItemUnitId || null,
        availableQty: sumAvailableQty(items),
        unitPrice: parseDecimal(data.unitPrice, "供货单价", { min: 0 }),
        currency: data.currency || items[0]?.currency || null,
        commissionRate: parseOptionalRate(data.commissionRate, "默认佣金比例"),
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
          create: viewerStoreIds.map((viewerStoreId) => ({
            scope: "STORE",
            viewerStoreId,
          })),
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
    unitPrice?: string;
    currency?: string;
    commissionRate?: string;
    fulfillmentMode?: string;
    shipFromLocation?: string;
    etaDays?: string;
    minOrderQty?: string;
    maxOrderQty?: string;
    viewerStoreIds?: string[];
    items: SupplyOfferItemInput[];
  }
) {
  try {
    const existing = await prisma.supplyOffer.findUnique({ where: { id }, include: { items: true } });
    if (!existing) throw new Error("货盘不存在");
    const context = await requireUserContext({ storeId: data.storeId ?? existing.storeId });
    if (existing.storeId !== context.activeStoreId) throw new Error("只能编辑自己发布的货盘");
    if (existing.status === "DELISTED") throw new Error("已下架货盘不能继续编辑");

    const title = data.title.trim();
    if (!title) throw new Error("货盘标题不能为空");
    const items = normalizeOfferItems(data.items);
    await assertSupplyOfferOperationalSkus({
      storeId: context.activeStoreId,
      items,
    });
    const viewerStoreIds = normalizeViewerStoreIds(data.viewerStoreIds, context.storeIds);

    const offer = await prisma.$transaction(async (tx) => {
      await tx.supplyOfferItem.deleteMany({ where: { offerId: id } });
      await tx.offerVisibility.deleteMany({ where: { offerId: id } });
      return tx.supplyOffer.update({
        where: { id },
        data: {
          title,
          description: data.description || null,
          ownerPartnerId: data.ownerPartnerId || null,
          visibility: data.visibility || "PRIVATE",
          availableQty: sumAvailableQty(items),
          unitPrice: parseDecimal(data.unitPrice, "供货单价", { min: 0 }),
          currency: data.currency || items[0]?.currency || null,
          commissionRate: parseOptionalRate(data.commissionRate, "默认佣金比例"),
          fulfillmentMode: data.fulfillmentMode || "SUPPLIER_SHIPS",
          shipFromLocation: data.shipFromLocation || null,
          etaDays: data.etaDays ? Number(data.etaDays) : null,
          minOrderQty: parseDecimal(data.minOrderQty, "最小起订量", { min: 0 }),
          maxOrderQty: parseDecimal(data.maxOrderQty, "最大可下单量", { min: 0 }),
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
            create: viewerStoreIds.map((viewerStoreId) => ({
              scope: "STORE",
              viewerStoreId,
            })),
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

export async function changeSupplyOfferStatusAction(id: string, nextStatus: "PUBLISHED" | "PAUSED" | "DELISTED" | "DRAFT") {
  try {
    const existing = await prisma.supplyOffer.findUnique({ where: { id } });
    if (!existing) throw new Error("货盘不存在");
    const context = await requireUserContext({ storeId: existing.storeId });
    if (existing.storeId !== context.activeStoreId) throw new Error("只能操作自己发布的货盘");
    if (existing.status === "DELISTED" && nextStatus !== "DRAFT") {
      throw new Error("已下架货盘不能恢复，请复制后重新发布");
    }
    if (nextStatus === "PUBLISHED" && existing.availableQty.lte(existing.reservedQty)) {
      throw new Error("可供数量不足，不能发布");
    }

    const offer = await prisma.supplyOffer.update({
      where: { id },
      data: {
        status: nextStatus,
        publishedAt: nextStatus === "PUBLISHED" ? existing.publishedAt ?? new Date() : existing.publishedAt,
        pausedAt: nextStatus === "PAUSED" ? new Date() : null,
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
