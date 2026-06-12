"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hasRoleAtLeast, ROLES } from "@/lib/auth/permissions";
import { requireUserContext } from "@/lib/auth/user-context";
import {
  normalizeStoreCode,
  normalizeStoreCurrency,
} from "@/lib/application/store-settings";

async function requireStoreAdmin() {
  const context = await requireUserContext();
  if (!hasRoleAtLeast(context.role, ROLES.ADMIN)) {
    throw new Error("只有管理员及以上角色可以管理店铺");
  }
  return context;
}

function cleanString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export async function getStoreSettingsData() {
  const context = await requireStoreAdmin();
  const stores = await prisma.store.findMany({
    where: { organizationId: context.organizationId },
    select: {
      id: true,
      name: true,
      code: true,
      currency: true,
      createdAt: true,
      storeAccesses: {
        select: { userId: true },
      },
      platforms: {
        select: { id: true },
      },
      locations: {
        select: { id: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return {
    currentStoreId: context.activeStoreId,
    stores: stores.map((store) => ({
      id: store.id,
      name: store.name,
      code: store.code,
      currency: store.currency,
      createdAt: store.createdAt.toISOString(),
      memberCount: store.storeAccesses.length,
      platformCount: store.platforms.length,
      locationCount: store.locations.length,
    })),
  };
}

export async function createManagedStore(formData: FormData) {
  const context = await requireStoreAdmin();
  const name = cleanString(formData.get("name"));
  const code = normalizeStoreCode(cleanString(formData.get("code")));
  const currency = normalizeStoreCurrency(cleanString(formData.get("currency")));

  if (!name) {
    throw new Error("请填写店铺名称");
  }

  try {
    const store = await prisma.store.create({
      data: {
        organizationId: context.organizationId,
        name,
        code,
        currency,
      },
    });

    await prisma.storeAccess.upsert({
      where: {
        storeId_userId: {
          storeId: store.id,
          userId: context.userId,
        },
      },
      update: { role: context.role },
      create: {
        storeId: store.id,
        userId: context.userId,
        role: context.role,
      },
    });

    revalidatePath("/settings/stores");
    revalidatePath("/settings/team");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      throw new Error(`店铺代码「${code}」已存在，请使用其他代码`);
    }
    throw error;
  }
}
