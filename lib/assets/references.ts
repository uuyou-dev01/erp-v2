import { prisma } from "@/lib/prisma";

export type AssetReferenceContext = {
  organizationId: string;
  storeId: string;
  userId: string;
};

type PrivateAssetReference = {
  organizationId: string;
  storeId: string;
  userId: string;
  refType: string | null;
  refId: string | null;
};

function appOrigin() {
  const value = process.env.APP_BASE_URL?.trim();
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function assetIdFromPath(pathname: string) {
  return (
    pathname.match(/^\/api\/assets\/([^/]+)\/content\/?$/)?.[1] ??
    pathname.match(/^\/api\/v1\/mobile\/assets\/([^/]+)\/content\/?$/)?.[1] ??
    null
  );
}

function assetIdFromIdentifier(identifier: string) {
  const value = identifier.trim();
  if (!value) return null;
  if (!value.includes("/") && !value.includes(":")) return value;
  if (value.startsWith("/")) return assetIdFromPath(value.split(/[?#]/, 1)[0]);
  try {
    const parsed = new URL(value);
    if (!appOrigin() || parsed.origin !== appOrigin()) return null;
    return assetIdFromPath(parsed.pathname);
  } catch {
    return null;
  }
}

/**
 * Converts private asset IDs or this deployment's own asset URLs into durable
 * object references. Assets remain bound to the uploader and cannot be moved
 * from one business object to another by passing a different URL later.
 */
export async function bindAssetReferences(
  identifiers: readonly string[] | undefined,
  context: AssetReferenceContext,
  refType: string,
  refId: string
) {
  const ids = [
    ...new Set(
      (identifiers ?? []).map(assetIdFromIdentifier).filter((id): id is string => Boolean(id))
    ),
  ];
  if (!ids.length) return [];
  if (!refType.trim() || !refId.trim()) throw new Error("资产缺少业务归属");

  await prisma.mobileAsset.updateMany({
    where: {
      id: { in: ids },
      organizationId: context.organizationId,
      storeId: context.storeId,
      userId: context.userId,
      status: "READY",
      visibility: "ORGANIZATION_PRIVATE",
      purpose: { in: ["BUSINESS_EVIDENCE", "MOBILE_EVIDENCE"] },
      OR: [
        { refType: null, refId: null },
        { refType, refId },
      ],
    },
    data: { refType, refId },
  });

  // A business object can contain evidence uploaded by more than one actor.
  // For example, an order owner may provide a pickup QR code before the
  // warehouse fulfiller adds a dispatch photo. Assets already bound to this
  // exact object are safe to reuse; unbound assets still require uploader
  // ownership in the update above and assets from other objects never match.
  const boundCount = await prisma.mobileAsset.count({
    where: {
      id: { in: ids },
      organizationId: context.organizationId,
      storeId: context.storeId,
      status: "READY",
      visibility: "ORGANIZATION_PRIVATE",
      purpose: { in: ["BUSINESS_EVIDENCE", "MOBILE_EVIDENCE"] },
      refType,
      refId,
    },
  });
  if (boundCount !== ids.length) {
    throw new Error("部分凭证不存在、未上传完成、无权使用或已归属其他业务");
  }
  return ids;
}

async function referencedStoreId(refType: string, refId: string) {
  if (refType === "CUSTOMER_ORDER") {
    return (
      await prisma.customerOrder.findUnique({ where: { id: refId }, select: { storeId: true } })
    )?.storeId;
  }
  if (refType === "PURCHASE_ORDER") {
    return (
      await prisma.purchaseOrder.findUnique({ where: { id: refId }, select: { storeId: true } })
    )?.storeId;
  }
  if (refType === "INBOUND_SHIPMENT") {
    return (
      await prisma.inboundShipment.findUnique({ where: { id: refId }, select: { storeId: true } })
    )?.storeId;
  }
  if (refType === "ITEM_UNIT") {
    return (await prisma.itemUnit.findUnique({ where: { id: refId }, select: { storeId: true } }))
      ?.storeId;
  }
  if (refType === "INVENTORY_LOT") {
    return (
      await prisma.inventoryLot.findUnique({ where: { id: refId }, select: { storeId: true } })
    )?.storeId;
  }
  if (refType === "WITHDRAWAL_REQUEST") {
    return (
      await prisma.withdrawalRequest.findUnique({ where: { id: refId }, select: { storeId: true } })
    )?.storeId;
  }
  if (refType === "PAYOUT_RECORD") {
    return (
      await prisma.payoutRecord.findUnique({ where: { id: refId }, select: { storeId: true } })
    )?.storeId;
  }
  if (refType === "FULFILLMENT_REQUEST") {
    return (
      await prisma.fulfillmentRequest.findUnique({
        where: { id: refId },
        select: { storeId: true },
      })
    )?.storeId;
  }
  if (refType === "PRODUCT_INTELLIGENCE_CAPTURE") {
    return (
      await prisma.productIntelligenceCapture.findUnique({
        where: { id: refId },
        select: { storeId: true },
      })
    )?.storeId;
  }
  if (refType === "AFTER_SALES_CASE") {
    return (
      await prisma.afterSalesCase.findUnique({
        where: { id: refId },
        select: { customerOrder: { select: { storeId: true } } },
      })
    )?.customerOrder.storeId;
  }
  return null;
}

/** Object-level read authorization for a bound private asset. */
export async function canReadPrivateAssetReference(
  userId: string,
  activeOrganizationId: string | null,
  asset: PrivateAssetReference
) {
  const membership = await prisma.membership.findFirst({
    where: {
      organizationId: asset.organizationId,
      userId,
    },
    select: { id: true, role: true, status: true },
  });
  if (membership && membership.status !== "ACTIVE") return false;
  const memberIsInActiveOrganization = Boolean(
    membership && activeOrganizationId === asset.organizationId
  );
  if (membership && !memberIsInActiveOrganization) return false;
  if (memberIsInActiveOrganization && ["OWNER", "ADMIN"].includes(membership!.role)) return true;
  if (!asset.refType || !asset.refId) {
    return asset.userId === userId && (!membership || memberIsInActiveOrganization);
  }

  const [storeId, assignedTask] = await Promise.all([
    referencedStoreId(asset.refType, asset.refId),
    prisma.task.findFirst({
      where: {
        organizationId: asset.organizationId,
        storeId: asset.storeId,
        refType: asset.refType,
        refId: asset.refId,
        status: { in: ["ASSIGNED", "IN_PROGRESS", "OVERDUE", "DONE"] },
        OR: [
          { assignedToId: userId },
          { delegatedToId: userId },
          { completedById: userId },
          { createdById: userId },
        ],
      },
      select: {
        assignedToId: true,
        delegatedToId: true,
        completedById: true,
        createdById: true,
        fulfillmentLocationId: true,
      },
    }),
  ]);
  if (!storeId || storeId !== asset.storeId) return false;
  const storeAccess = await prisma.storeAccess.findFirst({
    where: { storeId, userId },
    select: { id: true },
  });
  if (storeAccess && memberIsInActiveOrganization) return true;
  if (
    !assignedTask?.fulfillmentLocationId ||
    (assignedTask.assignedToId !== userId &&
      assignedTask.delegatedToId !== userId &&
      assignedTask.completedById !== userId)
  ) {
    return false;
  }
  return Boolean(
    await prisma.locationFulfiller.findFirst({
      where: {
        organizationId: asset.organizationId,
        locationId: assignedTask.fulfillmentLocationId,
        userId,
        status: "ACTIVE",
      },
      select: { id: true },
    })
  );
}
