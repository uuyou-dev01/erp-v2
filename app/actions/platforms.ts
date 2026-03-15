"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getPlatforms(storeId: string) {
  return await prisma.platform.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPlatformById(id: string) {
  return await prisma.platform.findUnique({
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
}

export async function createPlatform(data: {
  storeId: string;
  code: string;
  name: string;
}) {
  const platform = await prisma.platform.create({
    data,
  });

  revalidatePath("/listing/platforms");
  return platform;
}

export async function updatePlatform(
  id: string,
  data: {
    code: string;
    name: string;
  }
) {
  const platform = await prisma.platform.update({
    where: { id },
    data,
  });

  revalidatePath("/listing/platforms");
  revalidatePath(`/listing/platforms/${id}`);
  return platform;
}

export async function deletePlatform(id: string) {
  await prisma.platform.delete({
    where: { id },
  });

  revalidatePath("/listing/platforms");
}
