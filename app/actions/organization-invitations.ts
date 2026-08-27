"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { canShipOrders, hasRoleAtLeast, ROLES } from "@/lib/auth/permissions";
import { notifyUser } from "@/lib/application/notifications";
import { createInvitationToken, hashInvitationToken } from "@/lib/auth/invitation-token";
import { isSecureCookieEnabled } from "@/lib/auth/cookie-security";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  ACTIVE_STORE_COOKIE,
  requireAuthenticatedUser,
  requireUserContext,
} from "@/lib/auth/user-context";

const INVITABLE_ROLES = [
  ROLES.ADMIN,
  ROLES.MANAGER,
  ROLES.PROCUREMENT,
  ROLES.WAREHOUSE,
  ROLES.LISTING,
  ROLES.FULFILLMENT,
  ROLES.FINANCE,
  ROLES.VIEWER,
] as const;
const MANAGER_ROLES = new Set<string>([
  ROLES.PROCUREMENT,
  ROLES.WAREHOUSE,
  ROLES.LISTING,
  ROLES.FULFILLMENT,
  ROLES.FINANCE,
  ROLES.VIEWER,
]);

function cleanString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function validateInviteRole(actorRole: string, requestedRole: string) {
  if (!INVITABLE_ROLES.includes(requestedRole as (typeof INVITABLE_ROLES)[number])) {
    throw new Error("请选择有效角色");
  }
  if (!hasRoleAtLeast(actorRole, ROLES.MANAGER)) throw new Error("无权邀请企业成员");
  if (!hasRoleAtLeast(actorRole, ROLES.ADMIN) && !MANAGER_ROLES.has(requestedRole)) {
    throw new Error("运营负责人不能邀请管理员或其他负责人");
  }
}

async function allowedStoreIds(
  formData: FormData,
  organizationId: string,
  actorStoreIds: string[]
) {
  const requested = formData.getAll("storeIds").map((value) => cleanString(value));
  const stores = await prisma.store.findMany({
    where: { organizationId, id: { in: requested.filter((id) => actorStoreIds.includes(id)) } },
    select: { id: true },
  });
  if (stores.length === 0) throw new Error("请至少选择一个可访问店铺");
  return stores.map((store) => store.id);
}

export async function createTeamInvitationAction(formData: FormData) {
  try {
    const context = await requireUserContext();
    const email = cleanString(formData.get("email")).toLowerCase();
    const role = cleanString(formData.get("role"));
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("请输入有效邮箱");
    validateInviteRole(context.role, role);
    const storeIds = await allowedStoreIds(formData, context.organizationId, context.storeIds);
    const existingMember = await prisma.user.findUnique({
      where: { email },
      select: {
        memberships: {
          where: { organizationId: context.organizationId, status: "ACTIVE" },
          select: { id: true },
        },
      },
    });
    if (existingMember?.memberships.length) throw new Error("该账号已经是企业成员");

    const rawToken = createInvitationToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invitation = await prisma.$transaction(async (tx) => {
      await tx.organizationInvitation.updateMany({
        where: { organizationId: context.organizationId, email, status: "PENDING" },
        data: { status: "REVOKED" },
      });
      return tx.organizationInvitation.create({
        data: {
          organizationId: context.organizationId,
          email,
          role,
          tokenHash: hashInvitationToken(rawToken),
          expiresAt,
          invitedById: context.userId,
          storeScopes: { create: storeIds.map((storeId) => ({ storeId })) },
        },
        select: { id: true },
      });
    });
    revalidatePath("/settings/team");
    return actionSuccess({
      invitationId: invitation.id,
      invitationPath: `/invite/team/${rawToken}`,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    return toActionFailure(error, "创建邀请失败，请稍后重试");
  }
}

export async function revokeTeamInvitationAction(formData: FormData) {
  try {
    const context = await requireUserContext();
    if (!hasRoleAtLeast(context.role, ROLES.MANAGER)) throw new Error("无权撤销邀请");
    const invitationId = cleanString(formData.get("invitationId"));
    const result = await prisma.organizationInvitation.updateMany({
      where: {
        id: invitationId,
        organizationId: context.organizationId,
        status: "PENDING",
        ...(hasRoleAtLeast(context.role, ROLES.ADMIN) ? {} : { role: { in: [...MANAGER_ROLES] } }),
      },
      data: { status: "REVOKED" },
    });
    if (!result.count) throw new Error("邀请不存在或已失效");
    revalidatePath("/settings/team");
    return actionSuccess({ invitationId });
  } catch (error) {
    return toActionFailure(error, "撤销邀请失败，请稍后重试");
  }
}

export async function regenerateTeamInvitationAction(formData: FormData) {
  try {
    const context = await requireUserContext();
    if (!hasRoleAtLeast(context.role, ROLES.MANAGER)) throw new Error("无权重新生成邀请");
    const invitationId = cleanString(formData.get("invitationId"));
    const rawToken = createInvitationToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const result = await prisma.organizationInvitation.updateMany({
      where: {
        id: invitationId,
        organizationId: context.organizationId,
        status: "PENDING",
        ...(hasRoleAtLeast(context.role, ROLES.ADMIN) ? {} : { role: { in: [...MANAGER_ROLES] } }),
      },
      data: { tokenHash: hashInvitationToken(rawToken), expiresAt },
    });
    if (!result.count) throw new Error("邀请不存在或已失效");
    revalidatePath("/settings/team");
    return actionSuccess({
      invitationPath: `/invite/team/${rawToken}`,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    return toActionFailure(error, "重新生成邀请失败，请稍后重试");
  }
}

export async function getTeamInvitationByToken(token: string) {
  if (!token) return null;
  const invitation = await prisma.organizationInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      organization: { select: { id: true, name: true } },
      storeScopes: { select: { store: { select: { id: true, name: true } } } },
    },
  });
  if (!invitation) return null;
  if (invitation.status === "PENDING" && invitation.expiresAt <= new Date()) {
    await prisma.organizationInvitation.update({
      where: { id: invitation.id },
      data: { status: "EXPIRED" },
    });
    return { ...invitation, status: "EXPIRED" };
  }
  return invitation;
}

async function acceptInvitation(invitationId: string, expectedToken?: string) {
  const user = await requireAuthenticatedUser();
  const invitation = await prisma.organizationInvitation.findUnique({
    where: { id: invitationId },
    include: { storeScopes: { select: { storeId: true } } },
  });
  if (!invitation || invitation.status !== "PENDING") throw new Error("邀请不存在或已失效");
  if (expectedToken && invitation.tokenHash !== hashInvitationToken(expectedToken))
    throw new Error("邀请链接无效");
  if (invitation.expiresAt <= new Date()) {
    await prisma.organizationInvitation.update({
      where: { id: invitation.id },
      data: { status: "EXPIRED" },
    });
    throw new Error("邀请已过期，请联系管理员重新生成");
  }
  if (invitation.email !== user.email) throw new Error(`请使用受邀邮箱 ${invitation.email} 登录`);
  const storeIds = invitation.storeScopes.map((scope) => scope.storeId);
  if (!storeIds.length) throw new Error("邀请没有配置店铺权限");

  await prisma.$transaction(async (tx) => {
    const claim = await tx.organizationInvitation.updateMany({
      where: { id: invitation.id, status: "PENDING" },
      data: { status: "ACCEPTED", acceptedById: user.id, acceptedAt: new Date() },
    });
    if (!claim.count) throw new Error("邀请已被其他请求处理");
    const locations = await tx.location.findMany({
      where: { storeId: { in: storeIds } },
      select: { id: true, storeId: true },
    });
    await tx.membership.upsert({
      where: {
        organizationId_userId: { organizationId: invitation.organizationId, userId: user.id },
      },
      update: { role: invitation.role, status: "ACTIVE" },
      create: {
        organizationId: invitation.organizationId,
        userId: user.id,
        role: invitation.role,
        status: "ACTIVE",
      },
    });
    for (const storeId of storeIds) {
      const permissions = {
        shipLocationIds: canShipOrders(invitation.role)
          ? locations
              .filter((location) => location.storeId === storeId)
              .map((location) => location.id)
          : [],
      };
      await tx.storeAccess.upsert({
        where: { storeId_userId: { storeId, userId: user.id } },
        update: { role: invitation.role, permissions },
        create: { storeId, userId: user.id, role: invitation.role, permissions },
      });
    }
    const pools = await tx.inventoryPool.findMany({
      where: { legacyStoreId: { in: storeIds } },
      select: { id: true },
    });
    for (const pool of pools) {
      await tx.inventoryPoolAccess.upsert({
        where: { inventoryPoolId_userId: { inventoryPoolId: pool.id, userId: user.id } },
        update: { role: invitation.role },
        create: { inventoryPoolId: pool.id, userId: user.id, role: invitation.role },
      });
    }
    for (const location of locations) {
      const permissions = {
        shipLocationIds: canShipOrders(invitation.role)
          ? locations
              .filter((candidate) => candidate.storeId === location.storeId)
              .map((candidate) => candidate.id)
          : [],
      };
      await tx.locationAccess.upsert({
        where: { locationId_userId: { locationId: location.id, userId: user.id } },
        update: { role: invitation.role, permissions },
        create: { locationId: location.id, userId: user.id, role: invitation.role, permissions },
      });
    }
    const channels = await tx.salesChannelAccount.findMany({
      where: { legacyPlatform: { storeId: { in: storeIds } } },
      select: { id: true },
    });
    for (const channel of channels) {
      await tx.channelAccess.upsert({
        where: {
          salesChannelAccountId_userId: { salesChannelAccountId: channel.id, userId: user.id },
        },
        update: { role: invitation.role },
        create: { salesChannelAccountId: channel.id, userId: user.id, role: invitation.role },
      });
    }
    await tx.user.update({
      where: { id: user.id },
      data: { storeId: storeIds[0], role: invitation.role },
    });
  });
  await notifyUser({
    organizationId: invitation.organizationId,
    recipientId: invitation.invitedById,
    actorId: user.id,
    refType: "ORGANIZATION_INVITATION",
    refId: invitation.id,
    type: "MEMBERSHIP_INVITATION_ACCEPTED",
    title: `${user.name || user.email} 已接受团队邀请`,
    body: `角色：${invitation.role}；店铺范围：${storeIds.length} 个。`,
    actionUrl: "/settings/team",
    dedupeKey: `organization-invitation:${invitation.id}:accepted`,
  });
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, invitation.organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookieEnabled(),
    path: "/",
  });
  cookieStore.set(ACTIVE_STORE_COOKIE, storeIds[0], {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookieEnabled(),
    path: "/",
  });
  revalidatePath("/settings/team");
  return actionSuccess({ organizationId: invitation.organizationId, storeId: storeIds[0] });
}

export async function acceptTeamInvitationAction(token: string) {
  try {
    const invitation = await getTeamInvitationByToken(token);
    if (!invitation) throw new Error("邀请链接无效");
    return await acceptInvitation(invitation.id, token);
  } catch (error) {
    return toActionFailure(error, "接受邀请失败，请稍后重试");
  }
}

export async function acceptTeamInvitationByIdAction(invitationId: string) {
  try {
    return await acceptInvitation(invitationId);
  } catch (error) {
    return toActionFailure(error, "接受邀请失败，请稍后重试");
  }
}
