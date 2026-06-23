"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { requireUserContext } from "@/lib/auth/user-context";
import { CORE_SELLING_PLATFORM_CODES, sortCoreSellingPlatforms } from "@/lib/core-platforms";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";

export interface PlatformShippingRuleInput {
  name: string;
  carrier?: string;
  sizeClass?: string;
  maxWeightKg?: string;
  fee?: string;
  currency?: string;
  notes?: string;
}

function parseOptionalPlatformDecimal(
  value: string | undefined,
  fieldLabel: string,
  options: { nonNegative?: boolean; max?: Decimal.Value } = {},
) {
  if (value == null || value.trim() === "") return null;

  let decimal: Decimal;
  try {
    decimal = new Decimal(value);
  } catch {
    throw new Error(`${fieldLabel}必须是有效数字`);
  }

  if (!decimal.isFinite()) {
    throw new Error(`${fieldLabel}必须是有效数字`);
  }
  if (options.nonNegative && decimal.lt(0)) {
    throw new Error(`${fieldLabel}不能为负数`);
  }
  if (options.max !== undefined && decimal.gt(options.max)) {
    throw new Error(`${fieldLabel}不能大于 ${options.max}`);
  }

  return decimal;
}

function parsePlatformFeeDefaults(data: {
  defaultFeeRate?: string;
  defaultShippingFee?: string;
}) {
  return {
    defaultFeeRate: parseOptionalPlatformDecimal(data.defaultFeeRate, "默认平台费率", {
      nonNegative: true,
      max: 1,
    }),
    defaultShippingFee: parseOptionalPlatformDecimal(data.defaultShippingFee, "默认运费", {
      nonNegative: true,
    }),
  };
}

export async function getPlatforms(storeId: string) {
  const context = await requireUserContext({ storeId });
  const platforms = await prisma.platform.findMany({
    where: {
      storeId: context.activeStoreId,
      code: { in: [...CORE_SELLING_PLATFORM_CODES] },
    },
  });

  return sortCoreSellingPlatforms(platforms).map((platform) => ({
    ...platform,
    defaultFeeRate: platform.defaultFeeRate?.toString() ?? null,
    defaultShippingFee: platform.defaultShippingFee?.toString() ?? null,
  }));
}

export async function getPlatformById(id: string) {
  const platform = await prisma.platform.findUnique({
    where: { id },
    include: {
      listings: {
        include: {
          sku: true,
          itemUnit: {
            include: {
              sku: true,
            },
          },
        },
      },
    },
  });

  if (!platform) return null;
  await requireUserContext({ storeId: platform.storeId });

  return {
    ...platform,
    defaultFeeRate: platform.defaultFeeRate?.toString() ?? null,
    defaultShippingFee: platform.defaultShippingFee?.toString() ?? null,
    listings: platform.listings.map((listing) => ({
      ...listing,
      listedPrice: listing.listedPrice?.toString() ?? null,
      feeRateOverride: listing.feeRateOverride?.toString() ?? null,
      shippingFeeOverride: listing.shippingFeeOverride?.toString() ?? null,
      estimatedNet: listing.estimatedNet?.toString() ?? null,
    })),
  };
}

export async function createPlatform(data: {
  storeId: string;
  code: string;
  name: string;
  country?: string;
  defaultFeeRate?: string;
  defaultShippingFee?: string;
  shippingRules?: PlatformShippingRuleInput[];
  defaultCurrency?: string;
  notes?: string;
}) {
  const context = await requireUserContext({ storeId: data.storeId });
  try {
    const feeDefaults = parsePlatformFeeDefaults(data);
    const platform = await prisma.platform.create({
      data: {
        storeId: context.activeStoreId,
        code: data.code,
        name: data.name,
        country: data.country || null,
        defaultFeeRate: feeDefaults.defaultFeeRate,
        defaultShippingFee: feeDefaults.defaultShippingFee,
        shippingRules: normalizeShippingRules(data.shippingRules),
        defaultCurrency: data.defaultCurrency || null,
        notes: data.notes || null,
      },
    });

    revalidatePath("/listing/platforms");
    return { id: platform.id };
  } catch (error) {
    throw mapPlatformWriteError(error, data.code);
  }
}

export async function createPlatformAction(data: {
  storeId: string;
  code: string;
  name: string;
  country?: string;
  defaultFeeRate?: string;
  defaultShippingFee?: string;
  shippingRules?: PlatformShippingRuleInput[];
  defaultCurrency?: string;
  notes?: string;
}) {
  try {
    const platform = await createPlatform(data);
    return actionSuccess({ id: platform.id });
  } catch (error) {
    return toActionFailure(error, "创建平台失败，请重试");
  }
}

export async function updatePlatform(
  id: string,
  data: {
    code: string;
    name: string;
    country?: string;
    defaultFeeRate?: string;
    defaultShippingFee?: string;
    shippingRules?: PlatformShippingRuleInput[];
    defaultCurrency?: string;
    notes?: string;
  }
) {
  const existing = await prisma.platform.findUnique({
    where: { id },
    select: { storeId: true },
  });
  if (!existing) {
    throw new Error("平台不存在或无权修改");
  }
  await requireUserContext({ storeId: existing.storeId });

  try {
    const feeDefaults = parsePlatformFeeDefaults(data);
    const platform = await prisma.platform.update({
      where: { id },
      data: {
        code: data.code,
        name: data.name,
        country: data.country || null,
        defaultFeeRate: feeDefaults.defaultFeeRate,
        defaultShippingFee: feeDefaults.defaultShippingFee,
        shippingRules: normalizeShippingRules(data.shippingRules),
        defaultCurrency: data.defaultCurrency || null,
        notes: data.notes || null,
      },
    });

    revalidatePath("/listing/platforms");
    revalidatePath(`/listing/platforms/${id}`);
    return { id: platform.id };
  } catch (error) {
    throw mapPlatformWriteError(error, data.code);
  }
}

export async function updatePlatformAction(
  id: string,
  data: {
    code: string;
    name: string;
    country?: string;
    defaultFeeRate?: string;
    defaultShippingFee?: string;
    shippingRules?: PlatformShippingRuleInput[];
    defaultCurrency?: string;
    notes?: string;
  }
) {
  try {
    const platform = await updatePlatform(id, data);
    return actionSuccess({ id: platform.id });
  } catch (error) {
    return toActionFailure(error, "保存平台失败，请重试");
  }
}

export async function deletePlatform(id: string, storeId: string) {
  const context = await requireUserContext({ storeId });
  const platform = await prisma.platform.findFirst({
    where: { id, storeId: context.activeStoreId },
  });

  if (!platform) {
    throw new Error("平台不存在或无权删除");
  }

  const [listingCount, orderCount] = await Promise.all([
    prisma.listing.count({ where: { platformId: id, storeId: context.activeStoreId } }),
    prisma.customerOrder.count({ where: { platformId: id, storeId: context.activeStoreId } }),
  ]);

  if (listingCount > 0) {
    throw new Error(`该平台仍有 ${listingCount} 条上架记录，无法删除。请先下架或删除相关上架。`);
  }

  if (orderCount > 0) {
    throw new Error(`该平台仍有关联订单 ${orderCount} 笔，无法删除。`);
  }

  await prisma.platform.delete({
    where: { id },
  });

  revalidatePath("/listing/platforms");
}

export async function deletePlatformAction(id: string, storeId: string) {
  try {
    await deletePlatform(id, storeId);
    return actionSuccess({ id });
  } catch (error) {
    return toActionFailure(error, "删除平台失败，请重试");
  }
}

function mapPlatformWriteError(error: unknown, code: string): Error {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  ) {
    return new Error(`平台代码「${code}」已存在，请使用其他代码`);
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("保存平台失败，请重试");
}

function normalizeShippingRules(rules?: PlatformShippingRuleInput[]) {
  const normalized = (rules ?? [])
    .map((rule) => ({
      name: rule.name.trim(),
      carrier: rule.carrier?.trim() || null,
      sizeClass: rule.sizeClass?.trim() || null,
      maxWeightKg: rule.maxWeightKg?.trim() || null,
      fee: rule.fee?.trim() || null,
      currency: rule.currency?.trim() || null,
      notes: rule.notes?.trim() || null,
    }))
    .filter((rule) => rule.name || rule.carrier || rule.sizeClass || rule.fee);

  return normalized.length > 0 ? normalized : undefined;
}
