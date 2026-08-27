"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { deactivateOrganizationMembershipAccess } from "@/lib/application/organization-membership-access";
import { isSecureCookieEnabled } from "@/lib/auth/cookie-security";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  ACTIVE_STORE_COOKIE,
  requireAuthenticatedUser,
  requireUserContext,
} from "@/lib/auth/user-context";

export async function leaveOrganizationAction(organizationId: string) {
  try {
    const user = await requireAuthenticatedUser();
    const membership = await prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.id } },
      select: { id: true, role: true, status: true },
    });
    if (!membership || membership.status !== "ACTIVE")
      throw new Error("当前账号不是该企业的有效成员");
    if (membership.role === "OWNER") throw new Error("企业所有者必须先转移所有权，不能直接退出");

    await prisma.$transaction(async (tx) => {
      await deactivateOrganizationMembershipAccess(tx, {
        organizationId,
        userId: user.id,
      });
    });

    const remaining = await prisma.membership.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      select: {
        role: true,
        organizationId: true,
        organization: {
          select: {
            stores: {
              where: { storeAccesses: { some: { userId: user.id } } },
              select: { id: true },
              orderBy: { createdAt: "asc" },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    const nextStoreId = remaining?.organization.stores[0]?.id ?? null;
    await prisma.user.update({
      where: { id: user.id },
      data: { storeId: nextStoreId, role: remaining?.role ?? "USER" },
    });

    const cookieStore = await cookies();
    if (cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value === organizationId) {
      if (remaining) {
        cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, remaining.organizationId, {
          httpOnly: true,
          sameSite: "lax",
          secure: isSecureCookieEnabled(),
          path: "/",
        });
        if (nextStoreId) {
          cookieStore.set(ACTIVE_STORE_COOKIE, nextStoreId, {
            httpOnly: true,
            sameSite: "lax",
            secure: isSecureCookieEnabled(),
            path: "/",
          });
        } else cookieStore.delete(ACTIVE_STORE_COOKIE);
      } else {
        cookieStore.delete(ACTIVE_ORGANIZATION_COOKIE);
        cookieStore.delete(ACTIVE_STORE_COOKIE);
      }
    }
    return actionSuccess({ destination: remaining ? "/workbench" : "/onboarding" });
  } catch (error) {
    return toActionFailure(error, "退出企业失败，请稍后重试");
  }
}

export async function transferOrganizationOwnershipAction(targetUserId: string) {
  try {
    const context = await requireUserContext();
    if (context.role !== "OWNER") throw new Error("只有当前企业所有者可以转移所有权");
    if (!targetUserId || targetUserId === context.userId) throw new Error("请选择其他企业成员");
    const target = await prisma.membership.findUnique({
      where: {
        organizationId_userId: { organizationId: context.organizationId, userId: targetUserId },
      },
      select: { id: true, status: true },
    });
    if (!target || target.status !== "ACTIVE") throw new Error("目标成员不存在或已停用");
    await prisma.$transaction([
      prisma.membership.update({
        where: {
          organizationId_userId: { organizationId: context.organizationId, userId: context.userId },
        },
        data: { role: "ADMIN" },
      }),
      prisma.membership.update({ where: { id: target.id }, data: { role: "OWNER" } }),
      prisma.user.update({ where: { id: context.userId }, data: { role: "ADMIN" } }),
      prisma.user.update({ where: { id: targetUserId }, data: { role: "OWNER" } }),
    ]);
    revalidatePath("/settings/team");
    revalidatePath("/settings/company");
    revalidatePath("/settings/personal");
    return actionSuccess({ ownerUserId: targetUserId });
  } catch (error) {
    return toActionFailure(error, "转移所有权失败，请稍后重试");
  }
}
