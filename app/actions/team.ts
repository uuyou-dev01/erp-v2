"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { deactivateOrganizationMembershipAccess } from "@/lib/application/organization-membership-access";
import { ensureWarehouseRosterLocationAccess } from "@/lib/application/location-fulfillment-access";
import { INCOMPLETE_TASK_STATUSES, TASK_TYPE } from "@/lib/application/tasks";
import { canShipOrders, hasRoleAtLeast, ROLES } from "@/lib/auth/permissions";
import { requireUserContext } from "@/lib/auth/user-context";
import { hashPassword } from "@/lib/auth/password";
import { grantsLocationCapability } from "@/lib/auth/scope-access";

const TEAM_ROLES = [
  ROLES.ADMIN,
  ROLES.MANAGER,
  ROLES.LISTING,
  ROLES.FULFILLMENT,
  ROLES.FINANCE,
  ROLES.VIEWER,
] as const;

async function requireTeamManager() {
  const context = await requireUserContext();
  if (!hasRoleAtLeast(context.role, ROLES.MANAGER)) {
    throw new Error("只有运营负责人及以上角色可以管理成员");
  }
  return context;
}

function cleanString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanRole(value: FormDataEntryValue | null) {
  const role = cleanString(value);
  return TEAM_ROLES.includes(role as (typeof TEAM_ROLES)[number]) ? role : ROLES.VIEWER;
}

function selectedStoreIds(formData: FormData, allowedStoreIds: string[]) {
  const allowed = new Set(allowedStoreIds);
  return formData
    .getAll("storeIds")
    .map((value) => cleanString(value))
    .filter((storeId) => storeId && allowed.has(storeId));
}

export async function getTeamManagementData() {
  const context = await requireTeamManager();
  await prisma.organizationInvitation.updateMany({
    where: {
      organizationId: context.organizationId,
      status: "PENDING",
      expiresAt: { lte: new Date() },
    },
    data: { status: "EXPIRED" },
  });
  const [stores, locations, members, invitations] = await Promise.all([
    prisma.store.findMany({
      where: { id: { in: context.storeIds } },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.location.findMany({
      where: { storeId: { in: context.storeIds } },
      select: { id: true, storeId: true, name: true, code: true },
      orderBy: [{ storeId: "asc" }, { name: "asc" }],
    }),
    prisma.user.findMany({
      where: {
        memberships: {
          some: { organizationId: context.organizationId },
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        memberships: {
          where: { organizationId: context.organizationId },
          select: { role: true, status: true, createdAt: true },
        },
        storeAccesses: {
          where: { storeId: { in: context.storeIds } },
          select: { storeId: true, role: true, permissions: true },
        },
        locationAccesses: {
          where: { location: { storeId: { in: context.storeIds } } },
          select: { locationId: true, role: true, permissions: true },
        },
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    }),
    prisma.organizationInvitation.findMany({
      where: { organizationId: context.organizationId },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        expiresAt: true,
        storeScopes: { select: { storeId: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return {
    currentUserId: context.userId,
    stores,
    locations,
    roles: TEAM_ROLES,
    currentUserRole: context.role,
    invitations: invitations.map((invitation) => ({
      ...invitation,
      createdAt: invitation.createdAt.toISOString(),
      expiresAt: invitation.expiresAt.toISOString(),
      storeIds: invitation.storeScopes.map((scope) => scope.storeId),
      storeScopes: undefined,
    })),
    members: members.map((member) => {
      const membership = member.memberships[0];
      return {
        id: member.id,
        email: member.email,
        name: member.name ?? "",
        role: membership?.role ?? ROLES.VIEWER,
        status: membership?.status ?? "INACTIVE",
        createdAt: membership?.createdAt.toISOString() ?? null,
        storeAccesses: member.storeAccesses,
        shipLocationIds: member.locationAccesses
          .filter((access) => grantsLocationCapability(access, "ship"))
          .map((access) => access.locationId),
      };
    }),
  };
}

export async function createTeamMember(formData: FormData) {
  const context = await requireTeamManager();
  const email = cleanString(formData.get("email")).toLowerCase();
  const name = cleanString(formData.get("name"));
  const role = cleanRole(formData.get("role"));
  if (
    !hasRoleAtLeast(context.role, ROLES.ADMIN) &&
    [ROLES.ADMIN, ROLES.MANAGER].includes(role as typeof ROLES.ADMIN)
  ) {
    throw new Error("运营负责人不能创建管理员或其他负责人");
  }
  const password = cleanString(formData.get("password"));
  const storeIds = selectedStoreIds(formData, context.storeIds);

  if (!email || !email.includes("@")) {
    throw new Error("请填写有效邮箱");
  }
  if (storeIds.length === 0) {
    throw new Error("请至少选择一个可访问店铺");
  }
  if (password.length < 8) {
    throw new Error("初始密码至少需要 8 位");
  }
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: name || undefined,
      password: passwordHash,
      role,
      storeId: storeIds[0],
    },
    create: {
      email,
      name: name || null,
      password: passwordHash,
      role,
      storeId: storeIds[0],
    },
  });

  await prisma.membership.upsert({
    where: {
      organizationId_userId: {
        organizationId: context.organizationId,
        userId: user.id,
      },
    },
    update: { role, status: "ACTIVE" },
    create: {
      organizationId: context.organizationId,
      userId: user.id,
      role,
      status: "ACTIVE",
    },
  });

  await Promise.all(
    storeIds.map((storeId) =>
      prisma.storeAccess.upsert({
        where: { storeId_userId: { storeId, userId: user.id } },
        update: { role },
        create: { storeId, userId: user.id, role },
      })
    )
  );

  await prisma.storeAccess.deleteMany({
    where: {
      userId: user.id,
      storeId: { in: context.storeIds.filter((storeId) => !storeIds.includes(storeId)) },
    },
  });

  revalidatePath("/settings/team");
}

export async function createTeamMemberAction(formData: FormData) {
  try {
    await createTeamMember(formData);
    return actionSuccess({});
  } catch (error) {
    return toActionFailure(error, "保存成员失败，请稍后重试");
  }
}

export async function updateTeamMemberAccess(formData: FormData) {
  const context = await requireTeamManager();
  const userId = cleanString(formData.get("userId"));
  const role = cleanRole(formData.get("role"));
  const storeIds = selectedStoreIds(formData, context.storeIds);
  const requestedShipLocationIds = formData
    .getAll("shipLocationIds")
    .map((value) => cleanString(value))
    .filter(Boolean);
  if (!userId) throw new Error("成员不存在");
  if (storeIds.length === 0) throw new Error("请至少选择一个可访问店铺");
  const allowedShipLocations = requestedShipLocationIds.length
    ? await prisma.location.findMany({
        where: { id: { in: requestedShipLocationIds }, storeId: { in: storeIds } },
        select: { id: true, storeId: true },
      })
    : [];
  if (allowedShipLocations.length !== new Set(requestedShipLocationIds).size) {
    throw new Error("可发货仓库不属于所选店铺");
  }

  const targetMembership = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId: context.organizationId, userId } },
    select: { role: true, status: true },
  });
  if (!targetMembership || targetMembership.status !== "ACTIVE") throw new Error("成员不存在或已停用");
  if (targetMembership.role === ROLES.OWNER) throw new Error("不能修改企业所有者的权限");
  if (
    !hasRoleAtLeast(context.role, ROLES.ADMIN) &&
    ([ROLES.ADMIN, ROLES.MANAGER].includes(targetMembership.role as typeof ROLES.ADMIN) ||
      [ROLES.ADMIN, ROLES.MANAGER].includes(role as typeof ROLES.ADMIN))
  ) {
    throw new Error("运营负责人不能修改管理员或其他负责人的权限");
  }

  await prisma.$transaction(async (tx) => {
    const existingStoreAccesses = await tx.storeAccess.findMany({
      where: { userId, store: { organizationId: context.organizationId } },
      select: { storeId: true, permissions: true },
    });
    const existingPermissions = new Map(
      existingStoreAccesses.map((access) => [access.storeId, access.permissions])
    );
    const removedStoreIds = existingStoreAccesses
      .map((access) => access.storeId)
      .filter((storeId) => !storeIds.includes(storeId));
    const activeWarehouseRosters = removedStoreIds.length
      ? await tx.locationFulfiller.findMany({
          where: {
            userId,
            status: "ACTIVE",
            location: { storeId: { in: removedStoreIds } },
          },
          select: { locationId: true },
        })
      : [];

    await tx.membership.update({
      where: { organizationId_userId: { organizationId: context.organizationId, userId } },
      data: { role },
    });
    for (const storeId of storeIds) {
      const currentPermissions = existingPermissions.get(storeId);
      const permissionRecord =
        currentPermissions && typeof currentPermissions === "object" && !Array.isArray(currentPermissions)
          ? (currentPermissions as Record<string, unknown>)
          : {};
      const permissions = {
        ...permissionRecord,
        shipLocationIds: allowedShipLocations
          .filter((location) => location.storeId === storeId)
          .map((location) => location.id),
      } as Prisma.InputJsonValue;
      await tx.storeAccess.upsert({
        where: { storeId_userId: { storeId, userId } },
        update: { role, permissions },
        create: { storeId, userId, role, permissions },
      });
    }

    if (removedStoreIds.length) {
      await tx.storeAccess.deleteMany({ where: { userId, storeId: { in: removedStoreIds } } });
      await tx.inventoryPoolAccess.deleteMany({
        where: { userId, inventoryPool: { legacyStoreId: { in: removedStoreIds } } },
      });
      await tx.channelAccess.deleteMany({
        where: {
          userId,
          salesChannelAccount: { legacyPlatform: { storeId: { in: removedStoreIds } } },
        },
      });
      await tx.locationAccess.deleteMany({
        where: { userId, location: { storeId: { in: removedStoreIds } } },
      });
      for (const roster of activeWarehouseRosters) {
        await ensureWarehouseRosterLocationAccess(tx, { locationId: roster.locationId, userId });
      }
    }

    const taskScope = [
      ...(removedStoreIds.length ? [{ storeId: { in: removedStoreIds } }] : []),
      ...(!canShipOrders(role) ? [{ type: TASK_TYPE.SHIP_ORDER }] : []),
    ];
    if (taskScope.length) {
      await tx.task.updateMany({
        where: {
          organizationId: context.organizationId,
          assignedToId: userId,
          status: { in: [...INCOMPLETE_TASK_STATUSES] },
          OR: taskScope,
        },
        data: {
          assignedToId: null,
          delegatedToId: null,
          assignedAt: null,
          startedAt: null,
          status: "OPEN",
        },
      });
    }
    await tx.user.update({ where: { id: userId }, data: { role, storeId: storeIds[0] } });
  });

  revalidatePath("/settings/team");
}

export async function updateTeamMemberAccessAction(formData: FormData) {
  try {
    await updateTeamMemberAccess(formData);
    return actionSuccess({});
  } catch (error) {
    return toActionFailure(error, "更新成员权限失败，请稍后重试");
  }
}

export async function deactivateTeamMember(formData: FormData) {
  const context = await requireTeamManager();
  const userId = cleanString(formData.get("userId"));
  if (!userId) throw new Error("成员不存在");
  if (userId === context.userId) throw new Error("不能停用当前登录成员");
  const targetMembership = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId: context.organizationId, userId } },
    select: { role: true },
  });
  if (!targetMembership) throw new Error("成员不存在");
  if (targetMembership.role === ROLES.OWNER) throw new Error("不能停用企业所有者");
  if (
    !hasRoleAtLeast(context.role, ROLES.ADMIN) &&
    ![ROLES.LISTING, ROLES.FULFILLMENT, ROLES.FINANCE, ROLES.VIEWER].includes(
      targetMembership.role as typeof ROLES.LISTING
    )
  ) {
    throw new Error("运营负责人只能停用普通业务成员");
  }

  await prisma.$transaction(async (tx) => {
    await deactivateOrganizationMembershipAccess(tx, {
      organizationId: context.organizationId,
      userId,
    });
  });

  revalidatePath("/settings/team");
}

export async function deactivateTeamMemberAction(formData: FormData) {
  try {
    await deactivateTeamMember(formData);
    return actionSuccess({});
  } catch (error) {
    return toActionFailure(error, "停用成员失败，请稍后重试");
  }
}
