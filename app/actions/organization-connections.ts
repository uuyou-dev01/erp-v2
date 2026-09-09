"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { hasRoleAtLeast, ROLES } from "@/lib/auth/permissions";
import { requireUserContext } from "@/lib/auth/user-context";
import { notifyOrganizationAdministrators } from "@/lib/application/collaboration-notifications";

function normalizeCollaborationCode(value: string) {
  const code = value.trim().toUpperCase();
  if (!/^ORG-[23456789A-HJ-NP-Z]{6,12}$/.test(code)) throw new Error("请输入完整的企业协作码");
  return code;
}

function pairKey(firstId: string, secondId: string) {
  return [firstId, secondId].sort().join(":");
}

function revalidateConnectionPages() {
  revalidatePath("/settings/connections");
  revalidatePath("/settings/partners");
  revalidatePath("/settings/company");
}

export async function findOrganizationByCollaborationCodeAction(codeInput: string) {
  try {
    const context = await requireUserContext();
    const code = normalizeCollaborationCode(codeInput);
    const organization = await prisma.organization.findUnique({
      where: { collaborationCode: code },
      select: { id: true, name: true, collaborationCode: true },
    });
    if (!organization) throw new Error("没有找到该企业，请核对完整协作码");
    if (organization.id === context.organizationId) throw new Error("不能连接当前企业自己");
    return actionSuccess({ organization });
  } catch (error) {
    return toActionFailure(error, "查找企业失败，请重试");
  }
}

export async function getOrganizationConnectionsData() {
  const context = await requireUserContext();
  const [organization, connections, partners] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: context.organizationId },
      select: { id: true, name: true, collaborationCode: true },
    }),
    prisma.organizationConnection.findMany({
      where: {
        OR: [
          { requesterOrganizationId: context.organizationId },
          { targetOrganizationId: context.organizationId },
        ],
      },
      select: {
        id: true,
        status: true,
        requesterOrganizationId: true,
        targetOrganizationId: true,
        createdAt: true,
        respondedAt: true,
        endedAt: true,
        requesterOrganization: { select: { id: true, name: true, collaborationCode: true } },
        targetOrganization: { select: { id: true, name: true, collaborationCode: true } },
        initiatingPartner: { select: { id: true, name: true, type: true } },
        requestedBy: { select: { name: true, email: true } },
        respondedBy: { select: { name: true, email: true } },
        events: {
          select: {
            id: true,
            eventType: true,
            fromStatus: true,
            toStatus: true,
            reason: true,
            createdAt: true,
            actorUser: { select: { name: true, email: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.partner.findMany({
      where: { storeId: context.activeStoreId, status: "ACTIVE" },
      select: { id: true, name: true, code: true, organizationId: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { context, organization, connections, partners };
}

export async function requestOrganizationConnectionAction(data: {
  partnerId?: string;
  collaborationCode: string;
}) {
  try {
    const context = await requireUserContext();
    if (!hasRoleAtLeast(context.role, ROLES.MANAGER))
      throw new Error("只有运营负责人及以上角色可以发起企业连接");
    const targetCode = normalizeCollaborationCode(data.collaborationCode);
    const [partner, target, requester] = await Promise.all([
      data.partnerId
        ? prisma.partner.findFirst({
            where: { id: data.partnerId, storeId: context.activeStoreId, status: "ACTIVE" },
          })
        : Promise.resolve(null),
      prisma.organization.findUnique({
        where: { collaborationCode: targetCode },
        select: { id: true, name: true },
      }),
      prisma.organization.findUniqueOrThrow({
        where: { id: context.organizationId },
        select: { name: true },
      }),
    ]);
    if (data.partnerId && !partner) throw new Error("请选择当前店铺的有效合作方");
    if (!target) throw new Error("没有找到该企业，请核对完整协作码");
    if (target.id === context.organizationId) throw new Error("不能连接当前企业自己");
    if (partner?.organizationId && partner.organizationId !== target.id)
      throw new Error("该合作方已经连接到其他企业");
    const key = pairKey(context.organizationId, target.id);
    const previous = await prisma.organizationConnection.findUnique({ where: { pairKey: key } });
    if (previous?.status === "PENDING") throw new Error("双方已经有待处理的连接请求");
    if (previous?.status === "ACTIVE") throw new Error("双方企业已经连接");

    const connection = await prisma.$transaction(async (tx) => {
      const saved = previous
        ? await tx.organizationConnection.update({
            where: { id: previous.id },
            data: {
              requesterOrganizationId: context.organizationId,
              targetOrganizationId: target.id,
              initiatingPartnerId: partner?.id ?? null,
              status: "PENDING",
              requestedById: context.userId,
              respondedById: null,
              respondedAt: null,
              endedAt: null,
            },
          })
        : await tx.organizationConnection.create({
            data: {
              requesterOrganizationId: context.organizationId,
              targetOrganizationId: target.id,
              initiatingPartnerId: partner?.id,
              pairKey: key,
              requestedById: context.userId,
            },
          });
      await tx.organizationConnectionEvent.create({
        data: {
          connectionId: saved.id,
          eventType: previous ? "REOPENED" : "REQUESTED",
          actorUserId: context.userId,
          fromStatus: previous?.status ?? null,
          toStatus: "PENDING",
          metadata: { initiatingPartnerId: partner?.id ?? null },
        },
      });
      return saved;
    });
    await notifyOrganizationAdministrators({
      organizationId: target.id,
      actorId: context.userId,
      refType: "ORGANIZATION_CONNECTION",
      refId: connection.id,
      type: "ORGANIZATION_CONNECTION_REQUEST",
      title: `${requester.name} 发来企业连接请求`,
      body: partner
        ? `对方希望通过合作方「${partner.name}」建立企业协作关系。`
        : "对方希望确认企业身份，并在后续按具体供给或协议开展合作。",
      actionUrl: "/settings/connections",
      dedupeKey: `organization-connection:${connection.id}:requested:${connection.updatedAt.getTime()}`,
      priority: "HIGH",
    });
    revalidateConnectionPages();
    return actionSuccess({ connectionId: connection.id, targetName: target.name });
  } catch (error) {
    return toActionFailure(error, "发起企业连接失败，请重试");
  }
}

export async function respondOrganizationConnectionAction(data: {
  connectionId: string;
  decision: "ACCEPT" | "REJECT";
}) {
  try {
    const context = await requireUserContext();
    if (!hasRoleAtLeast(context.role, ROLES.ADMIN))
      throw new Error("只有企业所有者或管理员可以处理连接请求");
    const connection = await prisma.organizationConnection.findUnique({
      where: { id: data.connectionId },
      include: {
        requesterOrganization: { select: { name: true } },
        targetOrganization: { select: { name: true } },
      },
    });
    if (
      !connection ||
      connection.targetOrganizationId !== context.organizationId ||
      connection.status !== "PENDING"
    ) {
      throw new Error("连接请求不存在或已处理");
    }
    const accepted = data.decision === "ACCEPT";
    const transitionEvent = await prisma.$transaction(async (tx) => {
      const claim = await tx.organizationConnection.updateMany({
        where: { id: connection.id, status: "PENDING" },
        data: {
          status: accepted ? "ACTIVE" : "REJECTED",
          respondedById: context.userId,
          respondedAt: new Date(),
        },
      });
      if (!claim.count) throw new Error("连接请求已被其他管理员处理");
      if (accepted && connection.initiatingPartnerId) {
        await tx.partner.update({
          where: { id: connection.initiatingPartnerId },
          data: { organizationId: context.organizationId },
        });
      }
      return tx.organizationConnectionEvent.create({
        data: {
          connectionId: connection.id,
          eventType: accepted ? "ACCEPTED" : "REJECTED",
          actorUserId: context.userId,
          fromStatus: "PENDING",
          toStatus: accepted ? "ACTIVE" : "REJECTED",
        },
      });
    });
    await notifyOrganizationAdministrators({
      organizationId: connection.requesterOrganizationId,
      actorId: context.userId,
      includeUserIds: [connection.requestedById],
      refType: "ORGANIZATION_CONNECTION",
      refId: connection.id,
      type: accepted ? "ORGANIZATION_CONNECTION_ACCEPTED" : "ORGANIZATION_CONNECTION_REJECTED",
      title: accepted
        ? `${connection.targetOrganization.name} 已接受企业连接`
        : `${connection.targetOrganization.name} 已拒绝企业连接`,
      actionUrl: "/settings/connections",
      dedupeKey: `organization-connection:${connection.id}:${accepted ? "accepted" : "rejected"}:${transitionEvent.id}`,
    });
    revalidateConnectionPages();
    return actionSuccess({ connectionId: connection.id, status: accepted ? "ACTIVE" : "REJECTED" });
  } catch (error) {
    return toActionFailure(error, "处理企业连接失败，请重试");
  }
}

export async function endOrganizationConnectionAction(connectionId: string, reason?: string) {
  try {
    const context = await requireUserContext();
    if (!hasRoleAtLeast(context.role, ROLES.ADMIN))
      throw new Error("只有企业所有者或管理员可以解除连接");
    const connection = await prisma.organizationConnection.findUnique({
      where: { id: connectionId },
      include: {
        requesterOrganization: { select: { name: true } },
        targetOrganization: { select: { name: true } },
      },
    });
    if (
      !connection ||
      connection.status !== "ACTIVE" ||
      ![connection.requesterOrganizationId, connection.targetOrganizationId].includes(
        context.organizationId
      )
    ) {
      throw new Error("有效企业连接不存在");
    }
    const transitionEvent = await prisma.$transaction(async (tx) => {
      await tx.organizationConnection.update({
        where: { id: connection.id },
        data: { status: "ENDED", endedAt: new Date(), respondedById: context.userId },
      });
      if (connection.initiatingPartnerId) {
        await tx.partner.updateMany({
          where: {
            id: connection.initiatingPartnerId,
            organizationId: connection.targetOrganizationId,
          },
          data: { organizationId: null },
        });
      }
      return tx.organizationConnectionEvent.create({
        data: {
          connectionId: connection.id,
          eventType: "ENDED",
          actorUserId: context.userId,
          fromStatus: "ACTIVE",
          toStatus: "ENDED",
          reason: reason?.trim() || null,
        },
      });
    });
    const counterpartOrganizationId =
      connection.requesterOrganizationId === context.organizationId
        ? connection.targetOrganizationId
        : connection.requesterOrganizationId;
    const actorOrganizationName =
      connection.requesterOrganizationId === context.organizationId
        ? connection.requesterOrganization.name
        : connection.targetOrganization.name;
    await notifyOrganizationAdministrators({
      organizationId: counterpartOrganizationId,
      actorId: context.userId,
      refType: "ORGANIZATION_CONNECTION",
      refId: connection.id,
      type: "ORGANIZATION_CONNECTION_ENDED",
      title: `${actorOrganizationName} 已解除企业连接`,
      body: reason?.trim() || "未来定向货盘和新协作授权已停止，历史记录仍保留。",
      actionUrl: "/settings/connections",
      dedupeKey: `organization-connection:${connection.id}:ended:${transitionEvent.id}`,
      priority: "HIGH",
    });
    revalidateConnectionPages();
    return actionSuccess({ connectionId });
  } catch (error) {
    return toActionFailure(error, "解除企业连接失败，请重试");
  }
}
