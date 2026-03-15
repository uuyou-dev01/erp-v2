"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";

export async function getListings(storeId: string) {
  return await prisma.listing.findMany({
    where: { storeId },
    include: {
      platform: true,
      sku: true,
      itemUnit: {
        include: {
          sku: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getListingById(id: string) {
  return await prisma.listing.findUnique({
    where: { id },
    include: {
      platform: true,
      sku: true,
      itemUnit: {
        include: {
          sku: true,
          location: true,
        },
      },
    },
  });
}

export async function createListing(data: {
  storeId: string;
  platformId: string;
  listingType: "SKU" | "ITEM_UNIT";
  skuId?: string;
  itemUnitId?: string;
  listedPrice?: string;
  currency?: string;
}) {
  const listing = await prisma.listing.create({
    data: {
      storeId: data.storeId,
      platformId: data.platformId,
      listingType: data.listingType,
      skuId: data.skuId,
      itemUnitId: data.itemUnitId,
      listedPrice: data.listedPrice ? new Decimal(data.listedPrice) : null,
      currency: data.currency,
      status: "ACTIVE",
      listedAt: new Date(),
    },
  });

  revalidatePath("/listing");
  return listing;
}

export async function updateListing(
  id: string,
  data: {
    listedPrice?: string;
    currency?: string;
    status?: string;
  }
) {
  const updateData: Record<string, unknown> = {
    status: data.status,
    currency: data.currency,
  };

  if (data.listedPrice) {
    updateData.listedPrice = new Decimal(data.listedPrice);
  }

  if (data.status === "DELISTED") {
    updateData.delistedAt = new Date();
  }

  const listing = await prisma.listing.update({
    where: { id },
    data: updateData,
  });

  revalidatePath("/listing");
  revalidatePath(`/listing/${id}`);
  return listing;
}

export async function delistListing(id: string) {
  const listing = await prisma.listing.update({
    where: { id },
    data: {
      status: "DELISTED",
      delistedAt: new Date(),
    },
  });

  revalidatePath("/listing");
  revalidatePath(`/listing/${id}`);
  return listing;
}

export async function deleteListing(id: string) {
  await prisma.listing.delete({
    where: { id },
  });

  revalidatePath("/listing");
}
