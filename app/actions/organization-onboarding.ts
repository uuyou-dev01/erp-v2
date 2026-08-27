"use server";

import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { createPublicCode } from "@/lib/auth/invitation-token";
import { isSecureCookieEnabled } from "@/lib/auth/cookie-security";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  ACTIVE_STORE_COOKIE,
  requireAuthenticatedUser,
} from "@/lib/auth/user-context";
import { normalizeStoreCurrency } from "@/lib/application/store-settings";

function cleanString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export async function getOnboardingData() {
  const user = await requireAuthenticatedUser();
  const now = new Date();
  const [memberships, invitations, activeWarehouseCollaboration] = await Promise.all([
    prisma.membership.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      select: {
        role: true,
        organization: { select: { id: true, name: true, collaborationCode: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.organizationInvitation.findMany({
      where: { email: user.email, status: "PENDING", expiresAt: { gt: now } },
      select: {
        id: true,
        role: true,
        expiresAt: true,
        organization: { select: { id: true, name: true } },
        storeScopes: { select: { store: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.locationFulfiller.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      select: { id: true },
    }),
  ]);
  return {
    user,
    memberships,
    invitations,
    hasWarehouseCollaboration: Boolean(activeWarehouseCollaboration),
  };
}

export async function createOrganizationAction(formData: FormData) {
  try {
    const user = await requireAuthenticatedUser();
    const name = cleanString(formData.get("name"));
    const storeName = cleanString(formData.get("storeName"));
    const currency = normalizeStoreCurrency(cleanString(formData.get("currency")));
    if (!name) throw new Error("请输入企业或团队名称");
    if (!storeName) throw new Error("请输入第一个店铺名称");
    if (name.length > 80 || storeName.length > 80) throw new Error("名称不能超过 80 个字符");

    let created: { organizationId: string; storeId: string; collaborationCode: string } | null =
      null;
    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      const collaborationCode = createPublicCode("ORG", 6);
      const internalCode = `ORG_${createPublicCode("ORG", 8).slice(4)}`;
      const storeCode = createPublicCode("STORE", 8).replace("-", "_");
      try {
        created = await prisma.$transaction(async (tx) => {
          const organization = await tx.organization.create({
            data: { name, code: internalCode, collaborationCode },
            select: { id: true, collaborationCode: true },
          });
          const store = await tx.store.create({
            data: { organizationId: organization.id, name: storeName, code: storeCode, currency },
            select: { id: true },
          });
          await tx.membership.create({
            data: {
              organizationId: organization.id,
              userId: user.id,
              role: "OWNER",
              status: "ACTIVE",
            },
          });
          await tx.storeAccess.create({
            data: { storeId: store.id, userId: user.id, role: "OWNER" },
          });
          // The existing Store dual-write trigger creates the legacy-compatible
          // inventory pool, and StoreAccess creates its matching pool access.
          const pool = await tx.inventoryPool.findUnique({
            where: { legacyStoreId: store.id },
            select: { id: true },
          });
          if (!pool) throw new Error("默认库存池初始化失败");
          await tx.user.update({
            where: { id: user.id },
            data: { storeId: store.id, role: "OWNER" },
          });
          return {
            organizationId: organization.id,
            storeId: store.id,
            collaborationCode: organization.collaborationCode,
          };
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const target = String(error.meta?.target ?? "");
          if (!/(organizations_(code|collaborationCode)|stores_code)/.test(target)) throw error;
          continue;
        }
        throw error;
      }
    }
    if (!created) throw new Error("生成企业代码失败，请重试");

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, created.organizationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureCookieEnabled(),
      path: "/",
    });
    cookieStore.set(ACTIVE_STORE_COOKIE, created.storeId, {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureCookieEnabled(),
      path: "/",
    });
    return actionSuccess(created);
  } catch (error) {
    return toActionFailure(error, "创建企业失败，请稍后重试");
  }
}
