import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { UserContext } from "@/lib/auth/user-context";
import { requireUserContext } from "@/lib/auth/user-context";
import { hasRoleAtLeast, ROLES } from "@/lib/auth/permissions";
import { getLocationIdsWithCapability, hasLocationCapability } from "@/lib/auth/scope-access";
import { itemConditionReadyForSale } from "@/lib/inventory/item-condition";

export const MAX_ITEM_UNIT_PHOTOS = 20;

export function itemUnitPhotoUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
        .map((entry) => entry.trim())
    ),
  ];
}

export function mergeItemUnitPhotoUrls(current: unknown, incoming: string[]) {
  const merged = [
    ...new Set([
      ...itemUnitPhotoUrls(current),
      ...incoming.map((entry) => entry.trim()).filter(Boolean),
    ]),
  ];
  if (merged.length > MAX_ITEM_UNIT_PHOTOS) {
    throw new Error(`每个单件最多保留 ${MAX_ITEM_UNIT_PHOTOS} 张照片`);
  }
  return merged;
}

function isStoreManager(context: UserContext, storeId: string) {
  return context.storeIds.includes(storeId) && hasRoleAtLeast(context.role, ROLES.MANAGER);
}

async function canCaptureAtLocation(context: UserContext, storeId: string, locationId: string) {
  if (isStoreManager(context, storeId)) return true;
  return (
    context.locationIds.includes(locationId) &&
    (await hasLocationCapability(context.userId, locationId, "inspect"))
  );
}

export async function getMobileItemUnitPhotoTarget(id: string, suppliedContext?: UserContext) {
  const context = suppliedContext ?? (await requireUserContext());
  const item = await prisma.itemUnit.findFirst({
    where: { id, storeId: context.activeStoreId },
    select: {
      id: true,
      storeId: true,
      locationId: true,
      unitCode: true,
      labelCode: true,
      conditionGrade: true,
      photos: true,
      updatedAt: true,
      sku: { select: { code: true, name: true } },
      location: { select: { code: true, name: true } },
    },
  });
  if (!item || !(await canCaptureAtLocation(context, item.storeId, item.locationId))) {
    return null;
  }
  return { ...item, photos: itemUnitPhotoUrls(item.photos) };
}

export async function listMobileItemUnitPhotoTargets(
  query?: string,
  suppliedContext?: UserContext
) {
  const context = suppliedContext ?? (await requireUserContext());
  const manager = isStoreManager(context, context.activeStoreId);
  const allowedLocationIds = manager
    ? undefined
    : await getLocationIdsWithCapability(context.userId, "inspect");
  if (!manager && (!allowedLocationIds || allowedLocationIds.length === 0)) return [];

  const normalizedQuery = query?.trim().slice(0, 80);
  const items = await prisma.itemUnit.findMany({
    where: {
      storeId: context.activeStoreId,
      ...(allowedLocationIds ? { locationId: { in: allowedLocationIds } } : {}),
      ...(normalizedQuery
        ? {
            OR: [
              { unitCode: { contains: normalizedQuery, mode: "insensitive" } },
              { labelCode: { contains: normalizedQuery, mode: "insensitive" } },
              { sku: { code: { contains: normalizedQuery, mode: "insensitive" } } },
              { sku: { name: { contains: normalizedQuery, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      unitCode: true,
      conditionGrade: true,
      photos: true,
      updatedAt: true,
      sku: { select: { code: true, name: true } },
      location: { select: { code: true, name: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  return items.map((item) => {
    const photos = itemUnitPhotoUrls(item.photos);
    return { ...item, photos, photoCount: photos.length, coverUrl: photos[0] ?? null };
  });
}

export async function attachMobileAssetsToItemUnit(input: {
  itemUnitId: string;
  assetIds: string[];
  context: UserContext;
}) {
  const assetIds = [...new Set(input.assetIds.map((id) => id.trim()).filter(Boolean))];
  if (assetIds.length === 0) throw new Error("请选择要保存的照片");
  if (assetIds.length > 8) throw new Error("单次最多上传 8 张照片");

  const target = await getMobileItemUnitPhotoTarget(input.itemUnitId, input.context);
  if (!target) throw new Error("单件不存在或当前账号没有拍照权限");

  const result = await prisma.$transaction(async (tx) => {
    const assets = await tx.mobileAsset.findMany({
      where: {
        id: { in: assetIds },
        organizationId: input.context.organizationId,
        storeId: input.context.activeStoreId,
        userId: input.context.userId,
        status: "READY",
        captureId: null,
        OR: [{ itemUnitId: null }, { itemUnitId: input.itemUnitId }],
      },
      select: { id: true, publicUrl: true, itemUnitId: true },
    });
    if (assets.length !== assetIds.length || assets.some((asset) => !asset.publicUrl)) {
      throw new Error("部分照片不存在、未上传完成或已用于其他业务");
    }

    const current = await tx.itemUnit.findUnique({
      where: { id: input.itemUnitId },
      select: {
        photos: true,
        conditionType: true,
        conditionGrade: true,
        functionStatus: true,
        notes: true,
        status: true,
      },
    });
    if (!current) throw new Error("单件不存在");
    const currentPhotos = itemUnitPhotoUrls(current.photos);
    const photos = mergeItemUnitPhotoUrls(
      current.photos,
      assets.map((asset) => asset.publicUrl as string)
    );

    await tx.itemUnit.update({
      where: { id: input.itemUnitId },
      data: {
        photos,
        status:
          current.status === "RETURN_CHECK" &&
          itemConditionReadyForSale({
            conditionType: current.conditionType,
            conditionGrade: current.conditionGrade,
            functionStatus: current.functionStatus,
            notes: current.notes,
            photoCount: photos.length,
          })
            ? "AVAILABLE"
            : current.status,
      },
    });
    await tx.mobileAsset.updateMany({
      where: { id: { in: assetIds }, itemUnitId: null },
      data: { itemUnitId: input.itemUnitId },
    });

    return { photos, addedCount: photos.length - currentPhotos.length };
  });

  revalidatePath(`/inventory/items/${input.itemUnitId}`);
  revalidatePath("/inventory/items");
  revalidatePath("/inventory/sellable");
  revalidatePath(`/m/items/${input.itemUnitId}/photos`);
  return result;
}
