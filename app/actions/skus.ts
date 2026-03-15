"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export interface CreateSKUInput {
  storeId: string;
  code: string;
  name: string;
  category?: string;
  brand?: string;
  attributes?: Record<string, unknown>;
  description?: string;
  imageUrl?: string;
}

export interface UpdateSKUInput extends CreateSKUInput {
  id: string;
}

export async function getSKUs(storeId: string) {
  return await prisma.sKU.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getSKUById(id: string) {
  return await prisma.sKU.findUnique({
    where: { id },
    include: {
      inventoryLots: {
        include: {
          location: true,
        },
      },
      itemUnits: {
        include: {
          location: true,
        },
      },
    },
  });
}

export async function createSKU(data: CreateSKUInput) {
  const sku = await prisma.sKU.create({
    data: {
      storeId: data.storeId,
      code: data.code,
      name: data.name,
      category: data.category,
      brand: data.brand,
      attributes: data.attributes ? (data.attributes as never) : {},
      description: data.description,
      imageUrl: data.imageUrl,
    },
  });

  revalidatePath("/inventory/skus");
  return sku;
}

export async function updateSKU(data: UpdateSKUInput) {
  const sku = await prisma.sKU.update({
    where: { id: data.id },
    data: {
      code: data.code,
      name: data.name,
      category: data.category,
      brand: data.brand,
      attributes: data.attributes ? (data.attributes as never) : {},
      description: data.description,
      imageUrl: data.imageUrl,
    },
  });

  revalidatePath("/inventory/skus");
  revalidatePath(`/inventory/skus/${data.id}`);
  return sku;
}

export async function deleteSKU(id: string) {
  await prisma.sKU.delete({
    where: { id },
  });

  revalidatePath("/inventory/skus");
}
