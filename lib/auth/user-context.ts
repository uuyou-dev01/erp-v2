import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

export interface UserContext {
  userId: string;
  organizationId: string;
  role: string;
  activeStoreId: string;
  storeIds: string[];
}

export const USER_CONTEXT_COOKIE = "erp_current_user_email";
const DEFAULT_USER_EMAIL = "admin@example.com";

async function getCurrentUserEmail() {
  const cookieStore = await cookies();
  return (
    cookieStore.get(USER_CONTEXT_COOKIE)?.value ||
    process.env.ERP_DEV_USER_EMAIL ||
    DEFAULT_USER_EMAIL
  );
}

export async function requireUserContext(input?: {
  storeId?: string;
}): Promise<UserContext> {
  const email = await getCurrentUserEmail();
  const user = await prisma.user.findUnique({
    where: { email },
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
