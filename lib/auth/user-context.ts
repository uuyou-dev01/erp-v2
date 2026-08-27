import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { readSessionToken } from "@/lib/auth/session-token";
import { isSecureCookieEnabled } from "@/lib/auth/cookie-security";

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

export const USER_CONTEXT_COOKIE = isSecureCookieEnabled() ? "__Host-erp_session" : "erp_session";
export const ACTIVE_STORE_COOKIE = "erp_active_store_id";
export const ACTIVE_ORGANIZATION_COOKIE = "erp_active_organization_id";
async function getCurrentSessionIdentity() {
  const cookieStore = await cookies();
  const session = readSessionToken(cookieStore.get(USER_CONTEXT_COOKIE)?.value);
  if (session) {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, sessionVersion: true, accountStatus: true },
    });
    if (
      !user ||
      user.accountStatus !== "ACTIVE" ||
      user.sessionVersion !== session.sessionVersion
    ) {
      throw new Error("登录状态已失效，请重新登录");
    }
    return { userId: user.id } as const;
  }
  const developmentEmail =
    process.env.NODE_ENV !== "production"
      ? process.env.ERP_DEV_USER_EMAIL ||
        (process.env.NODE_ENV === "test" ? "admin@example.com" : undefined)
      : undefined;
  if (!developmentEmail) {
    throw new Error("请先登录");
  }
  return { email: developmentEmail } as const;
}

export async function requireAuthenticatedUser() {
  const identity = await getCurrentSessionIdentity();
  const user = await prisma.user.findUnique({
    where: "userId" in identity ? { id: identity.userId } : { email: identity.email },
    select: { id: true, email: true, name: true },
  });
  if (!user) {
    throw new Error("当前用户不存在");
  }
  return user;
}

export async function getActiveOrganizationIdForUser(userId: string) {
  const [activeMemberships, cookieStore] = await Promise.all([
    prisma.membership.findMany({
      where: { userId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      select: { organizationId: true },
    }),
    cookies(),
  ]);
  const requestedOrganizationId = cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value;
  return (
    activeMemberships.find((item) => item.organizationId === requestedOrganizationId)
      ?.organizationId ??
    activeMemberships[0]?.organizationId ??
    null
  );
}

export async function requireUserContext(input?: { storeId?: string }): Promise<UserContext> {
  const identity = await getCurrentSessionIdentity();
  const user = await prisma.user.findUnique({
    where: "userId" in identity ? { id: identity.userId } : { email: identity.email },
    include: {
      memberships: { orderBy: { createdAt: "asc" } },
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
