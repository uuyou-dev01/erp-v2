"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";

export interface PlatformShippingRuleInput {
  name: string;
  carrier?: string;
  sizeClass?: string;
  maxWeightKg?: string;
  fee?: string;
  currency?: string;
  notes?: string;
}

export async function getPlatforms(storeId: string) {
  const platforms = await prisma.platform.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
  });

  return platforms.map((platform) => ({
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
  const platform = await prisma.platform.create({
    data: {
      storeId: data.storeId,
      code: data.code,
      name: data.name,
      country: data.country || null,
      defaultFeeRate: data.defaultFeeRate ? new Decimal(data.defaultFeeRate) : null,
      defaultShippingFee: data.defaultShippingFee ? new Decimal(data.defaultShippingFee) : null,
      shippingRules: normalizeShippingRules(data.shippingRules),
      defaultCurrency: data.defaultCurrency || null,
      notes: data.notes || null,
    },
  });

  revalidatePath("/listing/platforms");
  return { id: platform.id };
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
  const platform = await prisma.platform.update({
    where: { id },
    data: {
      code: data.code,
      name: data.name,
      country: data.country || null,
      defaultFeeRate: data.defaultFeeRate ? new Decimal(data.defaultFeeRate) : null,
      defaultShippingFee: data.defaultShippingFee ? new Decimal(data.defaultShippingFee) : null,
      shippingRules: normalizeShippingRules(data.shippingRules),
      defaultCurrency: data.defaultCurrency || null,
      notes: data.notes || null,
    },
  });

  revalidatePath("/listing/platforms");
  revalidatePath(`/listing/platforms/${id}`);
  return { id: platform.id };
}

export async function deletePlatform(id: string) {
  await prisma.platform.delete({
    where: { id },
  });

  revalidatePath("/listing/platforms");
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
