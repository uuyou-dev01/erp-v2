"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export type LocationType = "WAREHOUSE" | "FORWARDER" | "PERSON" | "TRANSIT";

export interface CreateLocationInput {
  storeId: string;
  code: string;
  name: string;
  type: LocationType;
  isSellableDefault?: boolean;
}

export interface UpdateLocationInput extends CreateLocationInput {
  id: string;
}

export async function getLocations(storeId: string) {
  return await prisma.location.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getLocationById(id: string) {
  return await prisma.location.findUnique({
    where: { id },
  });
}

export async function createLocation(data: CreateLocationInput) {
  const location = await prisma.location.create({
    data: {
      storeId: data.storeId,
      code: data.code,
      name: data.name,
      type: data.type,
      isSellableDefault: data.isSellableDefault ?? true,
    },
  });

  revalidatePath("/inventory/locations");
  return location;
}

export async function updateLocation(data: UpdateLocationInput) {
  const location = await prisma.location.update({
    where: { id: data.id },
    data: {
      code: data.code,
      name: data.name,
      type: data.type,
      isSellableDefault: data.isSellableDefault,
    },
  });

  revalidatePath("/inventory/locations");
  revalidatePath(`/inventory/locations/${data.id}`);
  return location;
}

export async function deleteLocation(id: string) {
  await prisma.location.delete({
    where: { id },
  });

  revalidatePath("/inventory/locations");
}
