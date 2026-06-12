import { prisma } from "@/lib/prisma";

export interface UserContext {
  userId: string;
  organizationId: string;
  role: string;
  activeStoreId: string;
  storeIds: string[];
}

const DEV_USER_EMAIL = "admin@example.com";

export async function requireUserContext(input?: {
  storeId?: string;
}): Promise<UserContext> {
  const user = await prisma.user.findUnique({
    where: { email: DEV_USER_EMAIL },
    include: {
      memberships: true,
      storeAccesses: true,
    },
  });

  if (!user) {
    throw new Error("当前用户不存在，请先运行种子数据");
  }

  const membership = user.memberships.find((item) => item.status === "ACTIVE");
  if (!membership) {
    throw new Error("当前用户没有有效主体成员身份");
  }

  const storeIds = user.storeAccesses.map((access) => access.storeId);
  const activeStoreId = input?.storeId ?? storeIds[0] ?? user.storeId;

  if (!storeIds.includes(activeStoreId)) {
    throw new Error("无权访问该店铺");
  }

  return {
    userId: user.id,
    organizationId: membership.organizationId,
    role: membership.role,
    activeStoreId,
    storeIds,
  };
}
