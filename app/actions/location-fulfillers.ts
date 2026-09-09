"use server";

import Decimal from "decimal.js";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { logActivity } from "@/lib/application/activity-log";
import { notifyUser } from "@/lib/application/notifications";
import {
  ensureWarehouseRosterLocationAccess,
  revokeWarehouseRosterLocationAccess,
} from "@/lib/application/location-fulfillment-access";
import { INCOMPLETE_TASK_STATUSES } from "@/lib/application/tasks";
import { hasRoleAtLeast, ROLES } from "@/lib/auth/permissions";
import { createInvitationToken, hashInvitationToken } from "@/lib/auth/invitation-token";
import { requireAuthenticatedUser, requireUserContext } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";
import {
  normalizeWarehouseFulfillerRole,
  WAREHOUSE_FULFILLER_STATUS,
  WAREHOUSE_RELATIONSHIP_EVENT,
} from "@/lib/application/relationship-foundation";

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("请输入有效邮箱");
  return email;
}

function normalizeRole(value?: string) {
  return normalizeWarehouseFulfillerRole(value);
}

async function recordFulfillerEvent(
  tx: Prisma.TransactionClient,
  input: {
    fulfillerId: string;
    eventType: string;
    actorUserId: string;
    fromStatus?: string | null;
    toStatus: string;
    reason?: string | null;
    metadata?: Prisma.InputJsonValue;
  }
) {
  return tx.locationFulfillerEvent.create({ data: input });
}

async function revokeFulfillerWork(
  tx: Prisma.TransactionClient,
  input: { locationId: string; storeId: string; userId: string }
) {
  const claimedTasks = await tx.task.findMany({
    where: {
      fulfillmentLocationId: input.locationId,
      assignedToId: input.userId,
      status: { in: [...INCOMPLETE_TASK_STATUSES] },
    },
    select: { id: true, dispatch: { select: { requestId: true } } },
  });
  const taskIds = claimedTasks.map((task) => task.id);
  const requestIds = claimedTasks
    .map((task) => task.dispatch?.requestId)
    .filter((id): id is string => Boolean(id));
  await tx.task.updateMany({
    where: {
      id: { in: taskIds },
    },
    data: {
      assignedToId: null,
      delegatedToId: null,
      assignedAt: null,
      startedAt: null,
      status: "OPEN",
    },
  });
  await tx.taskDispatch.updateMany({
    where: { taskId: { in: taskIds }, status: "CLAIMED" },
    data: {
      targetScopeType: "LOCATION",
      targetScopeRef: input.locationId,
      status: "QUEUED",
      claimedByUserId: null,
      claimedAt: null,
    },
  });
  await tx.collaborationRequest.updateMany({
    where: { id: { in: requestIds }, status: "ACCEPTED" },
    data: { status: "OPEN", resolvedAt: null, resolutionCode: null },
  });
  const internalAccess = await tx.storeAccess.findFirst({
    where: { storeId: input.storeId, userId: input.userId },
    select: { id: true },
  });
  if (!internalAccess) {
    await revokeWarehouseRosterLocationAccess(tx, {
      locationId: input.locationId,
      userId: input.userId,
    });
  }
}

async function requireLocationRosterManager(locationId: string) {
  const context = await requireUserContext();
  if (!hasRoleAtLeast(context.role, ROLES.ADMIN)) {
    throw new Error("只有企业管理员可以维护任务协作者");
  }
  const location = await prisma.location.findFirst({
    where: {
      id: locationId,
      storeId: { in: context.storeIds },
      OR: [
        { operatorOrganizationId: context.organizationId },
        { operatorOrganizationId: null, store: { organizationId: context.organizationId } },
      ],
    },
    select: { id: true, name: true, storeId: true, operatorOrganizationId: true },
  });
  if (!location) throw new Error("仓库不存在或无权维护任务协作者");
  return { context, location };
}

async function requireOrganizationRosterViewer() {
  const context = await requireUserContext();
  if (!hasRoleAtLeast(context.role, ROLES.MANAGER)) {
    throw new Error("只有企业运营负责人可以查看任务协作关系");
  }
  return context;
}

function revalidateLocationRoster(locationId: string) {
  revalidatePath(`/inventory/locations/${locationId}`);
  revalidatePath("/inventory/locations");
  revalidatePath("/workbench");
  revalidatePath("/collaboration/tasks");
}

export async function getLocationFulfillerRoster(locationId: string) {
  await requireLocationRosterManager(locationId);
  return prisma.locationFulfiller.findMany({
    where: { locationId },
    select: {
      id: true,
      email: true,
      userId: true,
      role: true,
      status: true,
      isDefault: true,
      expiresAt: true,
      acceptedAt: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ isDefault: "desc" }, { status: "asc" }, { createdAt: "asc" }],
  });
}

export async function getOrganizationWarehouseCollaborators() {
  const context = await requireOrganizationRosterViewer();
  const roster = await prisma.locationFulfiller.findMany({
    where: { organizationId: context.organizationId },
    select: {
      id: true,
      email: true,
      userId: true,
      role: true,
      status: true,
      isDefault: true,
      acceptedAt: true,
      suspendedAt: true,
      expiresAt: true,
      user: { select: { name: true, email: true } },
      location: { select: { id: true, name: true, code: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
  const userIds = Array.from(
    new Set(roster.map((entry) => entry.userId).filter((id): id is string => Boolean(id)))
  );
  const [memberships, workTotals] = await Promise.all([
    userIds.length
      ? prisma.membership.findMany({
          where: {
            organizationId: context.organizationId,
            userId: { in: userIds },
            status: "ACTIVE",
          },
          select: { userId: true },
        })
      : [],
    userIds.length
      ? prisma.workRecord.groupBy({
          by: ["userId", "workName", "unit"],
          where: {
            organizationId: context.organizationId,
            userId: { in: userIds },
            relationshipType: "WAREHOUSE_COLLABORATOR",
            status: "CONFIRMED",
          },
          _sum: { quantity: true },
          _count: { _all: true },
        })
      : [],
  ]);
  const memberIds = new Set(memberships.map((membership) => membership.userId));
  const collaborators = new Map<
    string,
    {
      key: string;
      userId: string | null;
      name: string;
      email: string;
      relationshipType: "MEMBER" | "WAREHOUSE_COLLABORATOR" | "PENDING_INVITATION";
      locations: Array<{
        rosterId: string;
        id: string;
        name: string;
        code: string;
        role: string;
        status: string;
        isDefault: boolean;
      }>;
    }
  >();
  for (const entry of roster) {
    const key = entry.userId ?? `email:${entry.email.toLowerCase()}`;
    const existing = collaborators.get(key) ?? {
      key,
      userId: entry.userId,
      name: entry.user?.name || entry.user?.email || entry.email,
      email: entry.user?.email || entry.email,
      relationshipType: entry.userId
        ? memberIds.has(entry.userId)
          ? ("MEMBER" as const)
          : ("WAREHOUSE_COLLABORATOR" as const)
        : ("PENDING_INVITATION" as const),
      locations: [],
    };
    existing.locations.push({
      rosterId: entry.id,
      ...entry.location,
      role: entry.role,
      status:
        entry.status === "INVITED" && entry.expiresAt && entry.expiresAt <= new Date()
          ? "EXPIRED"
          : entry.status,
      isDefault: entry.isDefault,
    });
    collaborators.set(key, existing);
  }

  return {
    rows: Array.from(collaborators.values()).map((collaborator) => ({
      ...collaborator,
      status: collaborator.locations.some((location) => location.status === "ACTIVE")
        ? "ACTIVE"
        : collaborator.locations.some((location) => location.status === "INVITED")
          ? "INVITED"
          : collaborator.locations.some((location) => location.status === "EXPIRED")
            ? "EXPIRED"
            : "SUSPENDED",
      work: collaborator.userId
        ? workTotals
            .filter((total) => total.userId === collaborator.userId)
            .map((total) => ({
              name: total.workName,
              unit: total.unit,
              quantity: new Decimal(total._sum.quantity?.toString() ?? 0).toString(),
              eventCount: total._count._all,
            }))
        : [],
    })),
  };
}

export async function getExistingLocationFulfillerCandidates(locationId: string) {
  const { context } = await requireLocationRosterManager(locationId);
  const [existingAtLocation, activeElsewhere] = await Promise.all([
    prisma.locationFulfiller.findMany({
      where: { locationId, status: { in: ["ACTIVE", "INVITED"] } },
      select: { userId: true, email: true },
    }),
    prisma.locationFulfiller.findMany({
      where: {
        organizationId: context.organizationId,
        locationId: { not: locationId },
        status: "ACTIVE",
        userId: { not: null },
      },
      select: {
        userId: true,
        email: true,
        user: { select: { id: true, name: true, email: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: { acceptedAt: "desc" },
    }),
  ]);
  const excludedUsers = new Set(existingAtLocation.map((row) => row.userId).filter(Boolean));
  const excludedEmails = new Set(existingAtLocation.map((row) => row.email.toLowerCase()));
  const candidates = new Map<
    string,
    { userId: string; name: string; email: string; locations: Array<{ id: string; name: string }> }
  >();
  for (const row of activeElsewhere) {
    if (
      !row.userId ||
      !row.user ||
      excludedUsers.has(row.userId) ||
      excludedEmails.has(row.email.toLowerCase())
    )
      continue;
    const candidate = candidates.get(row.userId) ?? {
      userId: row.userId,
      name: row.user.name || row.user.email,
      email: row.user.email,
      locations: [],
    };
    candidate.locations.push(row.location);
    candidates.set(row.userId, candidate);
  }
  return Array.from(candidates.values());
}

export async function addExistingLocationFulfillerAction(input: {
  locationId: string;
  userId: string;
  role?: string;
  isDefault?: boolean;
}) {
  try {
    const { context, location } = await requireLocationRosterManager(input.locationId);
    const role = normalizeRole(input.role);
    const isDefault = Boolean(input.isDefault);
    const candidate = await prisma.locationFulfiller.findFirst({
      where: {
        organizationId: context.organizationId,
        locationId: { not: location.id },
        userId: input.userId,
        status: "ACTIVE",
      },
      select: { userId: true, email: true, user: { select: { name: true, email: true } } },
    });
    if (!candidate?.userId || !candidate.user) throw new Error("该协作者不存在或合作关系已失效");
    const candidateUserId = candidate.userId;
    const candidateUser = candidate.user;

    const saved = await prisma.$transaction(async (tx) => {
      const previous = await tx.locationFulfiller.findUnique({
        where: { locationId_email: { locationId: location.id, email: candidate.email } },
        select: { status: true },
      });
      if (isDefault) {
        await tx.locationFulfiller.updateMany({
          where: { locationId: location.id },
          data: { isDefault: false },
        });
      }
      const fulfiller = await tx.locationFulfiller.upsert({
        where: { locationId_email: { locationId: location.id, email: candidate.email } },
        update: {
          userId: candidateUserId,
          role,
          status: "ACTIVE",
          isDefault,
          tokenHash: null,
          expiresAt: null,
          acceptedAt: new Date(),
          suspendedAt: null,
          invitedById: context.userId,
        },
        create: {
          organizationId: context.organizationId,
          locationId: location.id,
          userId: candidateUserId,
          email: candidate.email,
          role,
          status: "ACTIVE",
          isDefault,
          acceptedAt: new Date(),
          invitedById: context.userId,
        },
        select: { id: true },
      });
      await ensureWarehouseRosterLocationAccess(tx, {
        locationId: location.id,
        userId: candidateUserId,
      });
      await recordFulfillerEvent(tx, {
        fulfillerId: fulfiller.id,
        eventType: previous
          ? WAREHOUSE_RELATIONSHIP_EVENT.REACTIVATED
          : WAREHOUSE_RELATIONSHIP_EVENT.ACCEPTED,
        actorUserId: context.userId,
        fromStatus: previous?.status ?? null,
        toStatus: WAREHOUSE_FULFILLER_STATUS.ACTIVE,
        metadata: { role, reusedFromAnotherLocation: true },
      });
      return fulfiller;
    });

    if (isDefault) {
      await notifyOpenLocationTasks({
        locationId: location.id,
        userId: candidateUserId,
        actorId: context.userId,
        organizationId: context.organizationId,
      });
    }
    await Promise.all([
      logActivity({
        organizationId: context.organizationId,
        storeId: location.storeId,
        actorId: context.userId,
        action: "LOCATION_FULFILLER_REUSED",
        refType: "LOCATION",
        refId: location.id,
        after: { fulfillerId: saved.id, userId: candidateUserId, role, isDefault },
        message: `已将 ${candidateUser.name || candidateUser.email} 添加到 ${location.name}`,
      }),
      notifyUser({
        organizationId: context.organizationId,
        storeId: location.storeId,
        recipientId: candidateUserId,
        actorId: context.userId,
        refType: "LOCATION",
        refId: location.id,
        type: "LOCATION_ACCESS_ADDED",
        title: `你已被添加到 ${location.name}`,
        body: "无需再次接受邀请，现在可以处理该仓库范围内分配给你的任务。",
        actionUrl: "/collaboration/tasks",
        dedupeKey: `location-access:${location.id}:${candidateUserId}`,
      }),
    ]);
    revalidateLocationRoster(location.id);
    return actionSuccess({ fulfillerId: saved.id });
  } catch (error) {
    return toActionFailure(error, "添加已有协作者失败，请重试");
  }
}

export async function createLocationFulfillerInvitationAction(input: {
  locationId: string;
  email: string;
  role?: string;
  isDefault?: boolean;
}) {
  try {
    const { context, location } = await requireLocationRosterManager(input.locationId);
    const email = normalizeEmail(input.email);
    const role = normalizeRole(input.role);
    const isDefault = Boolean(input.isDefault);
    const token = createInvitationToken();
    const tokenHash = hashInvitationToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const activeExisting = await prisma.locationFulfiller.findUnique({
      where: { locationId_email: { locationId: location.id, email } },
      select: { status: true },
    });
    if (activeExisting?.status === "ACTIVE") {
      throw new Error("该邮箱已经在这个仓库的发货名单中");
    }

    const saved = await prisma.$transaction(async (tx) => {
      const fulfiller = await tx.locationFulfiller.upsert({
        where: { locationId_email: { locationId: location.id, email } },
        update: {
          role,
          status: "INVITED",
          isDefault,
          userId: null,
          tokenHash,
          expiresAt,
          invitedById: context.userId,
          acceptedAt: null,
          suspendedAt: null,
        },
        create: {
          organizationId: context.organizationId,
          locationId: location.id,
          email,
          role,
          isDefault,
          tokenHash,
          expiresAt,
          invitedById: context.userId,
        },
        select: { id: true },
      });
      await recordFulfillerEvent(tx, {
        fulfillerId: fulfiller.id,
        eventType: activeExisting
          ? WAREHOUSE_RELATIONSHIP_EVENT.REOPENED
          : WAREHOUSE_RELATIONSHIP_EVENT.INVITED,
        actorUserId: context.userId,
        fromStatus: activeExisting?.status ?? null,
        toStatus: WAREHOUSE_FULFILLER_STATUS.INVITED,
        metadata: { role, isDefault },
      });
      return fulfiller;
    });

    await logActivity({
      organizationId: context.organizationId,
      storeId: location.storeId,
      actorId: context.userId,
      action: "LOCATION_FULFILLER_INVITED",
      refType: "LOCATION",
      refId: location.id,
      after: { fulfillerId: saved.id, email, role, isDefault },
      message: `邀请 ${email} 协助 ${location.name} 发货`,
    });
    revalidateLocationRoster(location.id);
    return actionSuccess({
      fulfillerId: saved.id,
      invitationPath: `/invite/warehouse/${token}`,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    return toActionFailure(error, "创建仓库发货邀请失败，请重试");
  }
}

export async function getLocationFulfillerInvitationByToken(token: string) {
  if (!token) return null;
  const invitation = await prisma.locationFulfiller.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    select: {
      id: true,
      email: true,
      userId: true,
      role: true,
      status: true,
      isDefault: true,
      expiresAt: true,
      acceptedAt: true,
      organization: { select: { name: true } },
      location: { select: { id: true, name: true, code: true, region: true } },
      invitedBy: { select: { name: true, email: true } },
    },
  });
  if (!invitation) return null;
  if (
    invitation.status === "INVITED" &&
    (!invitation.expiresAt || invitation.expiresAt <= new Date())
  ) {
    return { ...invitation, status: "EXPIRED" };
  }
  return invitation;
}

async function notifyOpenLocationTasks(input: {
  locationId: string;
  userId: string;
  actorId: string;
  organizationId: string;
}) {
  const tasks = await prisma.task.findMany({
    where: {
      organizationId: input.organizationId,
      fulfillmentLocationId: input.locationId,
      type: "SHIP_ORDER",
      status: "OPEN",
      assignedToId: null,
      dispatch: { is: { status: "QUEUED" } },
    },
    select: { id: true, storeId: true, refId: true, title: true },
  });
  for (const task of tasks) {
    await notifyUser({
      organizationId: input.organizationId,
      storeId: task.storeId,
      recipientId: input.userId,
      actorId: input.actorId,
      taskId: task.id,
      refType: "CUSTOMER_ORDER",
      refId: task.refId,
      type: "WAREHOUSE_TASK_AVAILABLE",
      title: "当前协作范围有新的订单发货任务",
      body: task.title,
      actionUrl: `/collaboration/tasks?task=${encodeURIComponent(task.id)}`,
      dedupeKey: `warehouse-task:${task.id}:available`,
    });
  }
}

export async function acceptLocationFulfillerInvitationAction(token: string) {
  try {
    const user = await requireAuthenticatedUser();
    const invitation = await prisma.locationFulfiller.findUnique({
      where: { tokenHash: hashInvitationToken(token) },
      include: { location: { select: { storeId: true, name: true } } },
    });
    if (!invitation) throw new Error("邀请不存在或已失效");
    if (invitation.status === "ACTIVE") {
      if (invitation.userId !== user.id) throw new Error("邀请已由其他账号接受");
      await prisma.$transaction((tx) =>
        ensureWarehouseRosterLocationAccess(tx, {
          locationId: invitation.locationId,
          userId: user.id,
        })
      );
      revalidateLocationRoster(invitation.locationId);
      return actionSuccess({
        destination: "/collaboration/tasks",
        locationId: invitation.locationId,
        alreadyAccepted: true,
      });
    }
    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new Error(`请使用受邀邮箱 ${invitation.email} 登录`);
    }
    if (invitation.status !== "INVITED") throw new Error("邀请已失效");
    if (!invitation.expiresAt || invitation.expiresAt <= new Date()) throw new Error("邀请已过期");

    const newlyAccepted = await prisma.$transaction(async (tx) => {
      const claimed = await tx.locationFulfiller.updateMany({
        where: { id: invitation.id, status: "INVITED", tokenHash: invitation.tokenHash },
        data: {
          userId: user.id,
          status: "ACTIVE",
          acceptedAt: new Date(),
          suspendedAt: null,
        },
      });
      if (!claimed.count) {
        const latest = await tx.locationFulfiller.findUnique({
          where: { id: invitation.id },
          select: { status: true, userId: true },
        });
        if (latest?.status !== "ACTIVE" || latest.userId !== user.id) {
          throw new Error("邀请已被其他请求处理");
        }
        await ensureWarehouseRosterLocationAccess(tx, {
          locationId: invitation.locationId,
          userId: user.id,
        });
        return false;
      }
      if (invitation.isDefault) {
        await tx.locationFulfiller.updateMany({
          where: { locationId: invitation.locationId, id: { not: invitation.id } },
          data: { isDefault: false },
        });
      }
      await ensureWarehouseRosterLocationAccess(tx, {
        locationId: invitation.locationId,
        userId: user.id,
      });
      await recordFulfillerEvent(tx, {
        fulfillerId: invitation.id,
        eventType: WAREHOUSE_RELATIONSHIP_EVENT.ACCEPTED,
        actorUserId: user.id,
        fromStatus: WAREHOUSE_FULFILLER_STATUS.INVITED,
        toStatus: WAREHOUSE_FULFILLER_STATUS.ACTIVE,
      });
      return true;
    });

    if (newlyAccepted && invitation.isDefault) {
      await notifyOpenLocationTasks({
        locationId: invitation.locationId,
        userId: user.id,
        actorId: invitation.invitedById,
        organizationId: invitation.organizationId,
      });
    }
    if (newlyAccepted) {
      await logActivity({
        organizationId: invitation.organizationId,
        storeId: invitation.location.storeId,
        actorId: user.id,
        action: "LOCATION_FULFILLER_ACCEPTED",
        refType: "LOCATION",
        refId: invitation.locationId,
        after: { fulfillerId: invitation.id, userId: user.id },
        message: `${user.name || user.email} 已加入 ${invitation.location.name} 发货名单`,
      });
    }
    revalidateLocationRoster(invitation.locationId);
    return actionSuccess({
      destination: "/collaboration/tasks",
      locationId: invitation.locationId,
      alreadyAccepted: !newlyAccepted,
    });
  } catch (error) {
    return toActionFailure(error, "接受仓库邀请失败，请重试");
  }
}

export async function setDefaultLocationFulfillerAction(locationId: string, fulfillerId: string) {
  try {
    const { context, location } = await requireLocationRosterManager(locationId);
    const fulfiller = await prisma.locationFulfiller.findFirst({
      where: { id: fulfillerId, locationId, status: "ACTIVE", userId: { not: null } },
      select: { id: true, userId: true },
    });
    if (!fulfiller?.userId) throw new Error("只有已接受邀请的发货人可以设为默认负责人");
    await prisma.$transaction([
      prisma.locationFulfiller.updateMany({ where: { locationId }, data: { isDefault: false } }),
      prisma.locationFulfiller.update({ where: { id: fulfiller.id }, data: { isDefault: true } }),
    ]);
    await notifyOpenLocationTasks({
      locationId,
      userId: fulfiller.userId,
      actorId: context.userId,
      organizationId: context.organizationId,
    });
    revalidateLocationRoster(location.id);
    return actionSuccess({ fulfillerId });
  } catch (error) {
    return toActionFailure(error, "设置默认负责人失败，请重试");
  }
}

export async function updateLocationFulfillerRoleAction(
  locationId: string,
  fulfillerId: string,
  nextRole: string
) {
  try {
    const { context, location } = await requireLocationRosterManager(locationId);
    const role = normalizeRole(nextRole);
    const fulfiller = await prisma.locationFulfiller.findFirst({
      where: { id: fulfillerId, locationId },
      select: { id: true, email: true, role: true, status: true },
    });
    if (!fulfiller) throw new Error("任务协作者不存在");
    await prisma.$transaction(async (tx) => {
      await tx.locationFulfiller.update({ where: { id: fulfiller.id }, data: { role } });
      await recordFulfillerEvent(tx, {
        fulfillerId: fulfiller.id,
        eventType: WAREHOUSE_RELATIONSHIP_EVENT.ROLE_CHANGED,
        actorUserId: context.userId,
        fromStatus: fulfiller.status,
        toStatus: fulfiller.status,
        metadata: { fromRole: fulfiller.role, toRole: role },
      });
    });
    await logActivity({
      organizationId: context.organizationId,
      storeId: location.storeId,
      actorId: context.userId,
      action: "LOCATION_FULFILLER_ROLE_UPDATED",
      refType: "LOCATION",
      refId: location.id,
      before: { fulfillerId, role: fulfiller.role },
      after: { fulfillerId, role },
      message: `已调整 ${fulfiller.email} 在 ${location.name} 的任务角色`,
    });
    revalidateLocationRoster(location.id);
    return actionSuccess({ fulfillerId, role });
  } catch (error) {
    return toActionFailure(error, "更新任务角色失败，请重试");
  }
}

export async function suspendLocationFulfillerAction(locationId: string, fulfillerId: string) {
  try {
    const { context, location } = await requireLocationRosterManager(locationId);
    const fulfiller = await prisma.locationFulfiller.findFirst({
      where: {
        id: fulfillerId,
        locationId,
        status: { in: [WAREHOUSE_FULFILLER_STATUS.ACTIVE, WAREHOUSE_FULFILLER_STATUS.INVITED] },
      },
      select: { id: true, userId: true, email: true, status: true },
    });
    if (!fulfiller) throw new Error("发货人不存在");
    await prisma.$transaction(async (tx) => {
      await tx.locationFulfiller.update({
        where: { id: fulfiller.id },
        data: {
          status: "SUSPENDED",
          isDefault: false,
          expiresAt: null,
          suspendedAt: new Date(),
        },
      });
      await recordFulfillerEvent(tx, {
        fulfillerId: fulfiller.id,
        eventType: WAREHOUSE_RELATIONSHIP_EVENT.SUSPENDED,
        actorUserId: context.userId,
        fromStatus: fulfiller.status,
        toStatus: WAREHOUSE_FULFILLER_STATUS.SUSPENDED,
      });
      if (fulfiller.userId) {
        await revokeFulfillerWork(tx, {
          locationId,
          storeId: location.storeId,
          userId: fulfiller.userId,
        });
      }
    });
    await logActivity({
      organizationId: context.organizationId,
      storeId: location.storeId,
      actorId: context.userId,
      action: "LOCATION_FULFILLER_SUSPENDED",
      refType: "LOCATION",
      refId: locationId,
      before: { fulfillerId, email: fulfiller.email },
      message: `已暂停 ${fulfiller.email} 的仓库发货权限`,
    });
    revalidateLocationRoster(location.id);
    return actionSuccess({ fulfillerId });
  } catch (error) {
    return toActionFailure(error, "暂停发货人失败，请重试");
  }
}

export async function reactivateLocationFulfillerAction(locationId: string, fulfillerId: string) {
  try {
    const { context, location } = await requireLocationRosterManager(locationId);
    const fulfiller = await prisma.locationFulfiller.findFirst({
      where: {
        id: fulfillerId,
        locationId,
        status: WAREHOUSE_FULFILLER_STATUS.SUSPENDED,
        userId: { not: null },
      },
      select: { id: true, userId: true, email: true },
    });
    if (!fulfiller?.userId) throw new Error("只有已绑定账号的暂停关系可以直接恢复");
    await prisma.$transaction(async (tx) => {
      await tx.locationFulfiller.update({
        where: { id: fulfiller.id },
        data: { status: WAREHOUSE_FULFILLER_STATUS.ACTIVE, suspendedAt: null },
      });
      await ensureWarehouseRosterLocationAccess(tx, {
        locationId,
        userId: fulfiller.userId!,
      });
      await recordFulfillerEvent(tx, {
        fulfillerId: fulfiller.id,
        eventType: WAREHOUSE_RELATIONSHIP_EVENT.REACTIVATED,
        actorUserId: context.userId,
        fromStatus: WAREHOUSE_FULFILLER_STATUS.SUSPENDED,
        toStatus: WAREHOUSE_FULFILLER_STATUS.ACTIVE,
      });
    });
    await notifyOpenLocationTasks({
      locationId,
      userId: fulfiller.userId,
      actorId: context.userId,
      organizationId: context.organizationId,
    });
    await notifyUser({
      organizationId: context.organizationId,
      storeId: location.storeId,
      recipientId: fulfiller.userId,
      actorId: context.userId,
      refType: "LOCATION",
      refId: locationId,
      type: "LOCATION_ACCESS_REACTIVATED",
      title: `${location.name} 的协作已恢复`,
      body: "你可以继续处理这个仓库范围内的任务。",
      actionUrl: "/collaboration",
      dedupeKey: `location-reactivated:${fulfiller.id}:${Date.now()}`,
    });
    revalidateLocationRoster(locationId);
    return actionSuccess({ fulfillerId });
  } catch (error) {
    return toActionFailure(error, "恢复任务协作失败，请重试");
  }
}

export async function endMyLocationFulfillerRelationshipAction(
  fulfillerId: string,
  reason?: string
) {
  try {
    const user = await requireAuthenticatedUser();
    const fulfiller = await prisma.locationFulfiller.findFirst({
      where: {
        id: fulfillerId,
        userId: user.id,
        status: { in: [WAREHOUSE_FULFILLER_STATUS.ACTIVE, WAREHOUSE_FULFILLER_STATUS.SUSPENDED] },
      },
      include: { location: { select: { id: true, storeId: true, name: true } } },
    });
    if (!fulfiller) throw new Error("协作关系不存在或已经结束");
    const endReason = reason?.trim() || "协作者主动结束合作";
    await prisma.$transaction(async (tx) => {
      await tx.locationFulfiller.update({
        where: { id: fulfiller.id },
        data: {
          status: WAREHOUSE_FULFILLER_STATUS.ENDED,
          isDefault: false,
          tokenHash: null,
          expiresAt: null,
          suspendedAt: new Date(),
        },
      });
      await revokeFulfillerWork(tx, {
        locationId: fulfiller.location.id,
        storeId: fulfiller.location.storeId,
        userId: user.id,
      });
      await recordFulfillerEvent(tx, {
        fulfillerId: fulfiller.id,
        eventType: WAREHOUSE_RELATIONSHIP_EVENT.ENDED,
        actorUserId: user.id,
        fromStatus: fulfiller.status,
        toStatus: WAREHOUSE_FULFILLER_STATUS.ENDED,
        reason: endReason,
      });
    });
    await logActivity({
      organizationId: fulfiller.organizationId,
      storeId: fulfiller.location.storeId,
      actorId: user.id,
      action: "LOCATION_FULFILLER_ENDED",
      refType: "LOCATION",
      refId: fulfiller.location.id,
      before: { fulfillerId, status: fulfiller.status },
      after: { status: WAREHOUSE_FULFILLER_STATUS.ENDED, reason: endReason },
      message: `${user.name || user.email} 已结束 ${fulfiller.location.name} 的任务协作`,
    });
    revalidateLocationRoster(fulfiller.location.id);
    return actionSuccess({ fulfillerId, destination: "/collaboration" });
  } catch (error) {
    return toActionFailure(error, "结束任务协作失败，请重试");
  }
}
