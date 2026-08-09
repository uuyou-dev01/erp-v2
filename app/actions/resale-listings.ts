"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { calculateAgreement, parseAgreementRule } from "@/lib/application/trading-agreement";
import { requireUserContext } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";

type StringableDecimal = { toString(): string };

export type SerializedResaleListing = {
  id: string;
  storeId: string;
  supplyOfferId: string;
  supplyOfferItemId: string | null;
  supplyOfferChannelId: string | null;
  salesChannelAccountId: string | null;
  sellerOrganizationId: string | null;
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
  commissionType: string;
  commissionFixedAmount: string | null;
  dropshipFee: string | null;
  dropshipFeeCurrency: string | null;
  agreementTermsSnapshot: string | null;
  agreementRuleSnapshot: unknown;
  agreementVersion: number | null;
  agreementAcceptedAt: Date | null;
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
    commissionType: string;
    commissionFixedAmount: string | null;
    dropshipFee: string | null;
    dropshipFeeCurrency: string | null;
    agreementTerms: string | null;
    agreementRule: unknown;
    agreementVersion: number;
    agreementStatus: string;
    fulfillmentMode: string;
    ownerPartner: { id: string; name: string } | null;
    items: Array<{
      id: string;
      title: string;
      variantCode: string | null;
      quantityAvailable: string;
      quantityReserved: string;
      unitPrice: string | null;
      currency: string | null;
    }>;
  };
};

type RawResaleListing = Omit<
  SerializedResaleListing,
  | "targetPrice"
  | "quantityPlanned"
  | "quantitySold"
  | "supplyUnitPrice"
  | "commissionRate"
  | "commissionFixedAmount"
  | "dropshipFee"
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
  commissionFixedAmount: StringableDecimal | null;
  dropshipFee: StringableDecimal | null;
  platformFeeRate: StringableDecimal | null;
  estimatedPlatformFee: StringableDecimal | null;
  estimatedCommission: StringableDecimal | null;
  estimatedGrossProfit: StringableDecimal | null;
  supplyOffer: Omit<
    SerializedResaleListing["supplyOffer"],
    "availableQty" | "unitPrice" | "commissionRate" | "commissionFixedAmount" | "dropshipFee" | "items"
  > & {
    availableQty: StringableDecimal;
    unitPrice: StringableDecimal | null;
    commissionRate: StringableDecimal | null;
    commissionFixedAmount: StringableDecimal | null;
    dropshipFee: StringableDecimal | null;
    items: Array<{
      id: string;
      title: string;
      variantCode: string | null;
      quantityAvailable: StringableDecimal;
      quantityReserved: StringableDecimal;
      unitPrice: StringableDecimal | null;
      currency: string | null;
    }>;
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

async function calculateEstimates(input: {
  targetPrice: Decimal;
  saleCurrency: string;
  quantityPlanned: Decimal;
  supplyUnitPrice: Decimal | null;
  supplyCurrency: string | null;
  platformFeeRate: Decimal | null;
  dropshipFee: Decimal | null;
  dropshipFeeCurrency: string | null;
  agreementRule: Parameters<typeof calculateAgreement>[0]["rule"];
}) {
  const calculated = await calculateAgreement({
    rule: input.agreementRule,
    quantity: input.quantityPlanned,
    saleUnitPrice: input.targetPrice,
    saleCurrency: input.saleCurrency,
    supplyUnitPrice: input.supplyUnitPrice,
    supplyCurrency: input.supplyCurrency,
    platformFeeRate: input.platformFeeRate,
    fulfillmentFeePerUnit: input.dropshipFee,
    fulfillmentFeeCurrency: input.dropshipFeeCurrency,
  });

  if (!calculated.automatic) {
    return { estimatedPlatformFee: null, estimatedCommission: null, estimatedGrossProfit: null };
  }

  if (
    input.agreementRule.kind === "PROFIT_PERCENT" &&
    (input.agreementRule.profitDeductions ?? []).includes("SHIPPING_FEE")
  ) {
    // 本单实际运费只有成交发货时才产生。售前阶段不能用 0 代替并展示一个
    // 看似精确的分成数字；发货后会用实际费用自动生成结算。
    return {
      estimatedPlatformFee: calculated.platformFee,
      estimatedCommission: null,
      estimatedGrossProfit: null,
    };
  }

  const estimatedGrossProfit =
    calculated.distributableProfit ??
    calculated.saleAmount
      .minus(calculated.supplyCost)
      .minus(calculated.platformFee)
      .minus(calculated.fulfillmentFee);

  return {
    estimatedPlatformFee: calculated.platformFee,
    estimatedCommission:
      calculated.resellerCommission && calculated.resellerCommission.gt(0)
        ? calculated.resellerCommission
        : null,
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
      items: true,
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
    commissionFixedAmount: listing.commissionFixedAmount?.toString() ?? null,
    dropshipFee: listing.dropshipFee?.toString() ?? null,
    platformFeeRate: listing.platformFeeRate?.toString() ?? null,
    estimatedPlatformFee: listing.estimatedPlatformFee?.toString() ?? null,
    estimatedCommission: listing.estimatedCommission?.toString() ?? null,
    estimatedGrossProfit: listing.estimatedGrossProfit?.toString() ?? null,
    supplyOffer: {
      ...listing.supplyOffer,
      availableQty: listing.supplyOffer.availableQty?.toString() ?? "0",
      unitPrice: listing.supplyOffer.unitPrice?.toString() ?? null,
      commissionRate: listing.supplyOffer.commissionRate?.toString() ?? null,
      commissionFixedAmount: listing.supplyOffer.commissionFixedAmount?.toString() ?? null,
      dropshipFee: listing.supplyOffer.dropshipFee?.toString() ?? null,
      items: listing.supplyOffer.items.map((item) => ({
        ...item,
        quantityAvailable: item.quantityAvailable.toString(),
        quantityReserved: item.quantityReserved.toString(),
        unitPrice: item.unitPrice?.toString() ?? null,
      })),
    },
  };
}

function visibleSupplyOfferWhere(activeStoreId: string, organizationId: string, offerId: string) {
  return {
    id: offerId,
    status: "PUBLISHED",
    OR: [
      { storeId: activeStoreId },
      { visibility: "PUBLIC" },
      {
        visibility: "PARTNER_ONLY",
        visibilityRules: {
          some: {
            OR: [
              { viewerStoreId: activeStoreId },
              { viewerOrganizationId: organizationId },
              { partner: { organizationId } },
            ],
          },
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
  supplyOfferItemId?: string;
  platformId: string;
  title: string;
  externalListingNo?: string;
  targetPrice: string;
  currency?: string;
  quantityPlanned?: string;
  supplyUnitPrice?: string;
  supplyCurrency?: string;
  commissionRate?: string;
  commissionType?: string;
  commissionFixedAmount?: string;
  dropshipFee?: string;
  platformFeeRate?: string;
  fulfillmentMode?: string;
  notes?: string;
}) {
  try {
    const context = await requireUserContext(data.storeId ? { storeId: data.storeId } : undefined);
    const [offer, platform] = await Promise.all([
      prisma.supplyOffer.findFirst({
        where: visibleSupplyOfferWhere(context.activeStoreId, context.organizationId, data.supplyOfferId),
        include: { salesChannels: { where: { status: "ACTIVE" } }, items: true },
      }),
      prisma.platform.findFirst({
        where: { id: data.platformId, storeId: context.activeStoreId },
        include: { salesChannelAccount: true },
      }),
    ]);

    if (!offer) throw new Error("货盘不存在、未发布或当前店铺不可见");
    if (!platform) throw new Error("销售平台不存在或无权访问");
    const offerItem = data.supplyOfferItemId
      ? offer.items.find((item) => item.id === data.supplyOfferItemId)
      : offer.items.length === 1
        ? offer.items[0]
        : null;
    if (!offerItem) throw new Error("请选择当前货盘中要代卖的具体商品");
    if (offer.agreementStatus !== "CONFIRMED" || !offer.agreementRule || !offer.agreementTerms?.trim()) {
      throw new Error("货盘合作约定尚未由货主确认，暂不能创建代卖上架");
    }

    const title = data.title.trim();
    if (!title) throw new Error("代卖标题不能为空");
    const targetPrice = parseDecimal(data.targetPrice, "代卖售价", { required: true, min: 0 })!;
    const quantityPlanned = parseDecimal(data.quantityPlanned || "1", "计划代卖数量", { required: true, min: 0 })!;
    const supplyUnitPrice = parseDecimal(
      offerItem.unitPrice?.toString() ?? offer.unitPrice?.toString(),
      "供货单价",
      { min: 0 },
    );
    const platformFeeRate = parseRate(data.platformFeeRate ?? platform.defaultFeeRate?.toString(), "平台费率");
    const commissionRate = offer.commissionRate;
    const commissionType = offer.commissionType;
    const commissionFixedAmount = offer.commissionFixedAmount;
    const dropshipFee = parseDecimal(offer.dropshipFee?.toString(), "代发服务费", { min: 0 });
    const saleCurrency = data.currency || platform.defaultCurrency || offer.currency || "CNY";
    const supplyCurrency = offerItem.currency || offer.currency || null;
    const dropshipFeeCurrency = offer.dropshipFeeCurrency || offer.settlementCurrency || offer.currency;
    const agreementRule = parseAgreementRule(offer.agreementRule);
    const salesChannelAccountId = platform.salesChannelAccount?.id ?? null;
    const offerChannel = offer.salesChannels.find((channel) =>
      (salesChannelAccountId && channel.salesChannelAccountId === salesChannelAccountId) ||
      (!salesChannelAccountId && channel.storeId === context.activeStoreId),
    );
    if (offer.salesChannels.length > 0 && !offerChannel && offer.organizationId !== context.organizationId) {
      throw new Error("当前销售账号未被这个货盘授权");
    }
    const estimates = await calculateEstimates({
      targetPrice,
      saleCurrency,
      quantityPlanned,
      supplyUnitPrice,
      supplyCurrency,
      platformFeeRate,
      dropshipFee,
      dropshipFeeCurrency,
      agreementRule,
    });

    const listing = await prisma.resaleListing.create({
      data: {
        storeId: context.activeStoreId,
        sellerOrganizationId: context.organizationId,
        salesChannelAccountId,
        supplyOfferChannelId: offerChannel?.id ?? null,
        supplyOfferId: offer.id,
        supplyOfferItemId: offerItem.id,
        platformId: platform.id,
        title,
        externalListingNo: data.externalListingNo || null,
        targetPrice,
        currency: saleCurrency,
        quantityPlanned,
        supplyUnitPrice,
        supplyCurrency,
        commissionRate,
        commissionType,
        commissionFixedAmount,
        dropshipFee,
        dropshipFeeCurrency,
        agreementTermsSnapshot: offer.agreementTerms,
        agreementRuleSnapshot: offer.agreementRule,
        agreementVersion: offer.agreementVersion,
        agreementAcceptedAt: new Date(),
        platformFeeRate,
        estimatedPlatformFee: estimates.estimatedPlatformFee,
        estimatedCommission: estimates.estimatedCommission,
        estimatedGrossProfit: estimates.estimatedGrossProfit,
        fulfillmentMode: offer.fulfillmentMode,
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
    supplyOfferItemId?: string;
    platformId: string;
    title: string;
    externalListingNo?: string;
    targetPrice: string;
    currency?: string;
    quantityPlanned?: string;
    supplyUnitPrice?: string;
    supplyCurrency?: string;
    commissionRate?: string;
    commissionType?: string;
    commissionFixedAmount?: string;
    dropshipFee?: string;
    platformFeeRate?: string;
    fulfillmentMode?: string;
    notes?: string;
  },
) {
  try {
    const existing = await prisma.resaleListing.findUnique({
      where: { id },
      include: { supplyOffer: { include: { items: true } } },
    });
    if (!existing) throw new Error("代卖上架不存在");
    const context = await requireUserContext({ storeId: data.storeId ?? existing.storeId });
    if (existing.storeId !== context.activeStoreId) throw new Error("只能编辑本店代卖上架");
    if (existing.status === "DELISTED") throw new Error("已下架代卖不能继续编辑");
    const offerItemId = data.supplyOfferItemId ?? existing.supplyOfferItemId;
    const offerItem = offerItemId
      ? existing.supplyOffer.items.find((item) => item.id === offerItemId)
      : existing.supplyOffer.items.length === 1
        ? existing.supplyOffer.items[0]
        : null;
    if (!offerItem) throw new Error("请选择当前货盘中要代卖的具体商品");
    if (existing.quantitySold.gt(0) && offerItem.id !== existing.supplyOfferItemId) {
      throw new Error("已有成交记录的代卖不能更换货盘商品");
    }

    const platform = await prisma.platform.findFirst({
      where: { id: data.platformId, storeId: context.activeStoreId },
      include: { salesChannelAccount: true },
    });
    if (!platform) throw new Error("销售平台不存在或无权访问");
    const offerChannels = await prisma.supplyOfferChannel.findMany({
      where: { offerId: existing.supplyOfferId, status: "ACTIVE" },
    });
    const salesChannelAccountId = platform.salesChannelAccount?.id ?? null;
    const offerChannel = offerChannels.find((channel) =>
      (salesChannelAccountId && channel.salesChannelAccountId === salesChannelAccountId) ||
      (!salesChannelAccountId && channel.storeId === context.activeStoreId),
    );
    if (offerChannels.length > 0 && !offerChannel && existing.supplyOffer.organizationId !== context.organizationId) {
      throw new Error("当前销售账号未被这个货盘授权");
    }

    const targetPrice = parseDecimal(data.targetPrice, "代卖售价", { required: true, min: 0 })!;
    const quantityPlanned = parseDecimal(data.quantityPlanned || existing.quantityPlanned.toString(), "计划代卖数量", {
      required: true,
      min: 0,
    })!;
    if (quantityPlanned.lt(existing.quantitySold)) {
      throw new Error("计划数量不能小于已售数量");
    }
    const supplyUnitPrice = parseDecimal(
      existing.supplyUnitPrice?.toString() ?? offerItem.unitPrice?.toString(),
      "供货单价",
      { min: 0 },
    );
    const platformFeeRate = parseRate(data.platformFeeRate ?? platform.defaultFeeRate?.toString(), "平台费率");
    const commissionRate = existing.commissionRate;
    const commissionType = existing.commissionType;
    const commissionFixedAmount = existing.commissionFixedAmount;
    const dropshipFee = parseDecimal(
      existing.dropshipFee?.toString() ?? existing.supplyOffer.dropshipFee?.toString(),
      "代发服务费",
      { min: 0 },
    );
    const saleCurrency = data.currency || platform.defaultCurrency || existing.currency;
    const supplyCurrency = existing.supplyCurrency || offerItem.currency;
    const dropshipFeeCurrency =
      existing.dropshipFeeCurrency ||
      existing.supplyOffer.dropshipFeeCurrency ||
      existing.supplyOffer.settlementCurrency ||
      existing.currency;
    const agreementRule = parseAgreementRule(existing.agreementRuleSnapshot);
    const estimates = await calculateEstimates({
      targetPrice,
      saleCurrency,
      quantityPlanned,
      supplyUnitPrice,
      supplyCurrency,
      platformFeeRate,
      dropshipFee,
      dropshipFeeCurrency,
      agreementRule,
    });

    const listing = await prisma.resaleListing.update({
      where: { id },
      data: {
        platformId: platform.id,
        sellerOrganizationId: context.organizationId,
        salesChannelAccountId,
        supplyOfferChannelId: offerChannel?.id ?? null,
        supplyOfferItemId: offerItem.id,
        title: data.title.trim(),
        externalListingNo: data.externalListingNo || null,
        targetPrice,
        currency: saleCurrency,
        quantityPlanned,
        supplyUnitPrice,
        supplyCurrency,
        commissionRate,
        commissionType,
        commissionFixedAmount,
        dropshipFee,
        dropshipFeeCurrency,
        platformFeeRate,
        estimatedPlatformFee: estimates.estimatedPlatformFee,
        estimatedCommission: estimates.estimatedCommission,
        estimatedGrossProfit: estimates.estimatedGrossProfit,
        fulfillmentMode: existing.fulfillmentMode,
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
    const existing = await prisma.resaleListing.findUnique({
      where: { id },
      include: { supplyOffer: { select: { items: { select: { id: true } } } } },
    });
    if (!existing) throw new Error("代卖上架不存在");
    const context = await requireUserContext({ storeId: existing.storeId });
    if (existing.storeId !== context.activeStoreId) throw new Error("只能操作本店代卖上架");
    if (existing.status === "DELISTED" && nextStatus !== "DRAFT") {
      throw new Error("已下架代卖不能恢复，请重新创建");
    }
    if (nextStatus === "ACTIVE" && existing.quantityPlanned.lte(existing.quantitySold)) {
      throw new Error("计划数量已售完，不能启用");
    }
    if (
      nextStatus === "ACTIVE" &&
      (!existing.supplyOfferItemId || !existing.supplyOffer.items.some((item) => item.id === existing.supplyOfferItemId))
    ) {
      throw new Error("启用前必须选择明确的货盘商品");
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
