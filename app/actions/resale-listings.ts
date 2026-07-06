"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { requireUserContext } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";

type StringableDecimal = { toString(): string };

export type SerializedResaleListing = {
  id: string;
  storeId: string;
  supplyOfferId: string;
  platformId: string;
  listingId: string | null;
  title: string;
  externalListingNo: string | null;
  targetPrice: string;
  currency: string;
  quantityPlanned: string;
  quantitySold: string;
  supplyUnitPrice: string | null;
  supplyCurrency: string | null;
  commissionRate: string | null;
  platformFeeRate: string | null;
  estimatedPlatformFee: string | null;
  estimatedCommission: string | null;
  estimatedGrossProfit: string | null;
  fulfillmentMode: string;
  status: string;
  listedAt: Date | null;
  pausedAt: Date | null;
  delistedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  platform: {
    id: string;
    name: string;
    code: string;
    defaultCurrency: string | null;
  };
  supplyOffer: {
    id: string;
    title: string;
    status: string;
    visibility: string;
    availableQty: string;
    currency: string | null;
    unitPrice: string | null;
    commissionRate: string | null;
    fulfillmentMode: string;
    ownerPartner: { id: string; name: string } | null;
  };
};

type RawResaleListing = Omit<
  SerializedResaleListing,
  | "targetPrice"
  | "quantityPlanned"
  | "quantitySold"
  | "supplyUnitPrice"
  | "commissionRate"
  | "platformFeeRate"
  | "estimatedPlatformFee"
  | "estimatedCommission"
  | "estimatedGrossProfit"
  | "supplyOffer"
> & {
  targetPrice: StringableDecimal;
  quantityPlanned: StringableDecimal;
  quantitySold: StringableDecimal;
  supplyUnitPrice: StringableDecimal | null;
  commissionRate: StringableDecimal | null;
  platformFeeRate: StringableDecimal | null;
  estimatedPlatformFee: StringableDecimal | null;
  estimatedCommission: StringableDecimal | null;
  estimatedGrossProfit: StringableDecimal | null;
  supplyOffer: Omit<
    SerializedResaleListing["supplyOffer"],
    "availableQty" | "unitPrice" | "commissionRate"
  > & {
    availableQty: StringableDecimal;
    unitPrice: StringableDecimal | null;
    commissionRate: StringableDecimal | null;
  };
};

function parseDecimal(value: string | undefined, label: string, options: { required?: boolean; min?: Decimal.Value } = {}) {
  if (!value || value.trim() === "") {
    if (options.required) throw new Error(`${label}不能为空`);
    return null;
  }
  const decimal = new Decimal(value);
  if (!decimal.isFinite()) throw new Error(`${label}必须是有效数字`);
  if (options.min !== undefined && decimal.lt(options.min)) throw new Error(`${label}不能小于 ${options.min}`);
  return decimal;
}

function parseRate(value: string | undefined, label: string) {
  const decimal = parseDecimal(value, label);
  if (!decimal) return null;
  if (decimal.lt(0) || decimal.gt(1)) throw new Error(`${label}必须是 0 到 1 之间的数字`);
  return decimal;
}

function calculateEstimates(input: {
  targetPrice: Decimal;
  quantityPlanned: Decimal;
  supplyUnitPrice: Decimal | null;
  platformFeeRate: Decimal | null;
  commissionRate: Decimal | null;
}) {
  const salesAmount = input.targetPrice.mul(input.quantityPlanned);
  const supplyCost = input.supplyUnitPrice ? input.supplyUnitPrice.mul(input.quantityPlanned) : new Decimal(0);
  const estimatedPlatformFee = input.platformFeeRate ? salesAmount.mul(input.platformFeeRate) : null;
  const commissionBasis = salesAmount.minus(supplyCost);
  const estimatedCommission = input.commissionRate ? commissionBasis.mul(input.commissionRate) : null;
  const estimatedGrossProfit = salesAmount
    .minus(supplyCost)
    .minus(estimatedPlatformFee ?? 0)
    .minus(estimatedCommission ?? 0);

  return {
    estimatedPlatformFee,
    estimatedCommission,
    estimatedGrossProfit,
  };
}

function revalidateResaleSurfaces(id?: string, offerId?: string) {
  revalidatePath("/resale");
  revalidatePath("/marketplace");
  if (id) {
    revalidatePath(`/resale/${id}`);
    revalidatePath(`/resale/${id}/edit`);
  }
  if (offerId) revalidatePath(`/marketplace/${offerId}`);
}

const resaleInclude = {
  platform: true,
  supplyOffer: {
    include: {
      ownerPartner: true,
    },
  },
} as const;

function serializeResaleListing(listing: RawResaleListing): SerializedResaleListing {
  return {
    ...listing,
    targetPrice: listing.targetPrice.toString(),
    quantityPlanned: listing.quantityPlanned.toString(),
    quantitySold: listing.quantitySold.toString(),
    supplyUnitPrice: listing.supplyUnitPrice?.toString() ?? null,
    commissionRate: listing.commissionRate?.toString() ?? null,
    platformFeeRate: listing.platformFeeRate?.toString() ?? null,
    estimatedPlatformFee: listing.estimatedPlatformFee?.toString() ?? null,
    estimatedCommission: listing.estimatedCommission?.toString() ?? null,
    estimatedGrossProfit: listing.estimatedGrossProfit?.toString() ?? null,
    supplyOffer: {
      ...listing.supplyOffer,
      availableQty: listing.supplyOffer.availableQty?.toString() ?? "0",
      unitPrice: listing.supplyOffer.unitPrice?.toString() ?? null,
      commissionRate: listing.supplyOffer.commissionRate?.toString() ?? null,
    },
  };
}

function visibleSupplyOfferWhere(activeStoreId: string, offerId: string) {
  return {
    id: offerId,
    status: "PUBLISHED",
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

export async function getResaleListings(storeId?: string) {
  const context = await requireUserContext(storeId ? { storeId } : undefined);
  const listings = await prisma.resaleListing.findMany({
    where: { storeId: context.activeStoreId },
    include: resaleInclude,
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
  return listings.map(serializeResaleListing);
}

export async function getResaleListingById(id: string, storeId?: string) {
  const context = await requireUserContext(storeId ? { storeId } : undefined);
  const listing = await prisma.resaleListing.findFirst({
    where: { id, storeId: context.activeStoreId },
    include: resaleInclude,
  });
  return listing ? serializeResaleListing(listing) : null;
}

export async function createResaleListingAction(data: {
  storeId?: string;
  supplyOfferId: string;
  platformId: string;
  title: string;
  externalListingNo?: string;
  targetPrice: string;
  currency?: string;
  quantityPlanned?: string;
  supplyUnitPrice?: string;
  supplyCurrency?: string;
  commissionRate?: string;
  platformFeeRate?: string;
  fulfillmentMode?: string;
  notes?: string;
}) {
  try {
    const context = await requireUserContext(data.storeId ? { storeId: data.storeId } : undefined);
    const [offer, platform] = await Promise.all([
      prisma.supplyOffer.findFirst({
        where: visibleSupplyOfferWhere(context.activeStoreId, data.supplyOfferId),
      }),
      prisma.platform.findFirst({
        where: { id: data.platformId, storeId: context.activeStoreId },
      }),
    ]);

    if (!offer) throw new Error("货盘不存在、未发布或当前店铺不可见");
    if (!platform) throw new Error("销售平台不存在或无权访问");

    const title = data.title.trim();
    if (!title) throw new Error("代卖标题不能为空");
    const targetPrice = parseDecimal(data.targetPrice, "代卖售价", { required: true, min: 0 })!;
    const quantityPlanned = parseDecimal(data.quantityPlanned || "1", "计划代卖数量", { required: true, min: 0 })!;
    const supplyUnitPrice = parseDecimal(data.supplyUnitPrice ?? offer.unitPrice?.toString(), "供货单价", { min: 0 });
    const platformFeeRate = parseRate(data.platformFeeRate ?? platform.defaultFeeRate?.toString(), "平台费率");
    const commissionRate = parseRate(data.commissionRate ?? offer.commissionRate?.toString(), "佣金比例");
    const estimates = calculateEstimates({
      targetPrice,
      quantityPlanned,
      supplyUnitPrice,
      platformFeeRate,
      commissionRate,
    });

    const listing = await prisma.resaleListing.create({
      data: {
        storeId: context.activeStoreId,
        supplyOfferId: offer.id,
        platformId: platform.id,
        title,
        externalListingNo: data.externalListingNo || null,
        targetPrice,
        currency: data.currency || platform.defaultCurrency || offer.currency || "CNY",
        quantityPlanned,
        supplyUnitPrice,
        supplyCurrency: data.supplyCurrency || offer.currency || null,
        commissionRate,
        platformFeeRate,
        estimatedPlatformFee: estimates.estimatedPlatformFee,
        estimatedCommission: estimates.estimatedCommission,
        estimatedGrossProfit: estimates.estimatedGrossProfit,
        fulfillmentMode: data.fulfillmentMode || offer.fulfillmentMode,
        notes: data.notes || null,
        createdById: context.userId,
        updatedById: context.userId,
      },
    });

    revalidateResaleSurfaces(listing.id, offer.id);
    return actionSuccess({ id: listing.id });
  } catch (error) {
    return toActionFailure(error, "创建代卖上架失败，请重试");
  }
}

export async function updateResaleListingAction(
  id: string,
  data: {
    storeId?: string;
    platformId: string;
    title: string;
    externalListingNo?: string;
    targetPrice: string;
    currency?: string;
    quantityPlanned?: string;
    supplyUnitPrice?: string;
    supplyCurrency?: string;
    commissionRate?: string;
    platformFeeRate?: string;
    fulfillmentMode?: string;
    notes?: string;
  },
) {
  try {
    const existing = await prisma.resaleListing.findUnique({
      where: { id },
      include: { supplyOffer: true },
    });
    if (!existing) throw new Error("代卖上架不存在");
    const context = await requireUserContext({ storeId: data.storeId ?? existing.storeId });
    if (existing.storeId !== context.activeStoreId) throw new Error("只能编辑本店代卖上架");
    if (existing.status === "DELISTED") throw new Error("已下架代卖不能继续编辑");

    const platform = await prisma.platform.findFirst({
      where: { id: data.platformId, storeId: context.activeStoreId },
    });
    if (!platform) throw new Error("销售平台不存在或无权访问");

    const targetPrice = parseDecimal(data.targetPrice, "代卖售价", { required: true, min: 0 })!;
    const quantityPlanned = parseDecimal(data.quantityPlanned || existing.quantityPlanned.toString(), "计划代卖数量", {
      required: true,
      min: 0,
    })!;
    if (quantityPlanned.lt(existing.quantitySold)) {
      throw new Error("计划数量不能小于已售数量");
    }
    const supplyUnitPrice = parseDecimal(data.supplyUnitPrice ?? existing.supplyUnitPrice?.toString(), "供货单价", { min: 0 });
    const platformFeeRate = parseRate(data.platformFeeRate ?? platform.defaultFeeRate?.toString(), "平台费率");
    const commissionRate = parseRate(data.commissionRate ?? existing.supplyOffer.commissionRate?.toString(), "佣金比例");
    const estimates = calculateEstimates({
      targetPrice,
      quantityPlanned,
      supplyUnitPrice,
      platformFeeRate,
      commissionRate,
    });

    const listing = await prisma.resaleListing.update({
      where: { id },
      data: {
        platformId: platform.id,
        title: data.title.trim(),
        externalListingNo: data.externalListingNo || null,
        targetPrice,
        currency: data.currency || platform.defaultCurrency || existing.currency,
        quantityPlanned,
        supplyUnitPrice,
        supplyCurrency: data.supplyCurrency || existing.supplyCurrency,
        commissionRate,
        platformFeeRate,
        estimatedPlatformFee: estimates.estimatedPlatformFee,
        estimatedCommission: estimates.estimatedCommission,
        estimatedGrossProfit: estimates.estimatedGrossProfit,
        fulfillmentMode: data.fulfillmentMode || existing.fulfillmentMode,
        notes: data.notes || null,
        updatedById: context.userId,
      },
    });

    revalidateResaleSurfaces(listing.id, existing.supplyOfferId);
    return actionSuccess({ id: listing.id });
  } catch (error) {
    return toActionFailure(error, "保存代卖上架失败，请重试");
  }
}

export async function changeResaleListingStatusAction(
  id: string,
  nextStatus: "ACTIVE" | "PAUSED" | "DELISTED" | "DRAFT",
) {
  try {
    const existing = await prisma.resaleListing.findUnique({ where: { id } });
    if (!existing) throw new Error("代卖上架不存在");
    const context = await requireUserContext({ storeId: existing.storeId });
    if (existing.storeId !== context.activeStoreId) throw new Error("只能操作本店代卖上架");
    if (existing.status === "DELISTED" && nextStatus !== "DRAFT") {
      throw new Error("已下架代卖不能恢复，请重新创建");
    }
    if (nextStatus === "ACTIVE" && existing.quantityPlanned.lte(existing.quantitySold)) {
      throw new Error("计划数量已售完，不能启用");
    }

    const listing = await prisma.resaleListing.update({
      where: { id },
      data: {
        status: nextStatus,
        listedAt: nextStatus === "ACTIVE" ? existing.listedAt ?? new Date() : existing.listedAt,
        pausedAt: nextStatus === "PAUSED" ? new Date() : null,
        delistedAt: nextStatus === "DELISTED" ? new Date() : existing.delistedAt,
        updatedById: context.userId,
      },
    });

    revalidateResaleSurfaces(listing.id, listing.supplyOfferId);
    return actionSuccess({ id: listing.id, status: listing.status });
  } catch (error) {
    return toActionFailure(error, "更新代卖状态失败，请重试");
  }
}

export async function deleteDraftResaleListingAction(id: string) {
  try {
    const existing = await prisma.resaleListing.findUnique({ where: { id } });
    if (!existing) throw new Error("代卖上架不存在");
    await requireUserContext({ storeId: existing.storeId });
    if (existing.status !== "DRAFT") throw new Error("只有草稿代卖可以删除");

    await prisma.resaleListing.delete({ where: { id } });
    revalidateResaleSurfaces(id, existing.supplyOfferId);
    return actionSuccess({ id });
  } catch (error) {
    return toActionFailure(error, "删除代卖草稿失败，请重试");
  }
}
