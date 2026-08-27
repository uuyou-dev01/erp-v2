import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { readSessionToken } from "@/lib/auth/session-token";

export interface UserContext {
  userId: string;
  organizationId: string;
  organizationIds: string[];
  role: string;
  activeStoreId: string;
  storeIds: string[];
  inventoryPoolIds: string[];
  salesChannelAccountIds: string[];
  locationIds: string[];
  activeInventoryPoolId: string | null;
}

export const USER_CONTEXT_COOKIE = "erp_current_user_email";
export const ACTIVE_STORE_COOKIE = "erp_active_store_id";
export const ACTIVE_ORGANIZATION_COOKIE = "erp_active_organization_id";
async function getCurrentUserEmail() {
  const cookieStore = await cookies();
  const session = readSessionToken(cookieStore.get(USER_CONTEXT_COOKIE)?.value);
  const email =
    session?.email ||
    process.env.ERP_DEV_USER_EMAIL ||
    (process.env.NODE_ENV === "test" ? "admin@example.com" : undefined);
  if (!email) {
    throw new Error("请先登录");
  }
  return email;
}

export async function requireAuthenticatedUser() {
  const email = await getCurrentUserEmail();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true },
  });
  if (!user) {
    throw new Error("当前用户不存在");
  }
  return user;
}

export async function requireUserContext(input?: { storeId?: string }): Promise<UserContext> {
  const email = await getCurrentUserEmail();
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      memberships: true,
      storeAccesses: { include: { store: true } },
      inventoryPoolAccesses: { include: { inventoryPool: true } },
      channelAccesses: { include: { salesChannelAccount: true } },
      locationAccesses: { include: { location: true } },
    },
  });

  if (!user) {
    throw new Error("当前用户不存在，请先运行种子数据");
  }

  const activeMemberships = user.memberships.filter((item) => item.status === "ACTIVE");
  const cookieStore = await cookies();
  const requestedOrganizationId = cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value;
  const membership =
    activeMemberships.find((item) => item.organizationId === requestedOrganizationId) ??
    activeMemberships[0];
  if (!membership) {
    throw new Error("当前用户没有有效主体成员身份");
  }

  const organizationIds = activeMemberships.map((item) => item.organizationId);
  const storeIds = user.storeAccesses
    .filter((access) => access.store.organizationId === membership.organizationId)
    .map((access) => access.storeId);
  const cookieStoreId = cookieStore.get(ACTIVE_STORE_COOKIE)?.value;
  const activeStoreId =
    input?.storeId ??
    (cookieStoreId && storeIds.includes(cookieStoreId) ? cookieStoreId : undefined) ??
    storeIds[0] ??
    user.storeId;

  if (!activeStoreId || !storeIds.includes(activeStoreId)) {
    throw new Error("无权访问该店铺");
  }

  // Explicit object-level grants may intentionally cross organization boundaries
  // (for example a warehouse operator handling a client's inventory pool).
  const inventoryPoolIds = user.inventoryPoolAccesses.map((access) => access.inventoryPoolId);
  const salesChannelAccountIds = user.channelAccesses.map((access) => access.salesChannelAccountId);
  const locationIds = user.locationAccesses.map((access) => access.locationId);
  const activePool = await prisma.inventoryPool.findFirst({
    where: {
      organizationId: membership.organizationId,
      OR: [{ id: { in: inventoryPoolIds } }, { legacyStoreId: activeStoreId }],
    },
    select: { id: true },
  });

  return {
    userId: user.id,
    organizationId: membership.organizationId,
    organizationIds,
    role: membership.role,
    activeStoreId,
    storeIds,
    inventoryPoolIds,
    salesChannelAccountIds,
    locationIds,
    activeInventoryPoolId: activePool?.id ?? null,
  };
}
