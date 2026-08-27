"use server";

import { revalidatePath } from "next/cache";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { getActiveOrganizationConnection } from "@/lib/application/organization-connections";
import { syncLegacyOrganizationFoundation } from "@/lib/application/multi-party-foundation";
import { hasRoleAtLeast, ROLES } from "@/lib/auth/permissions";
import { requireUserContext } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";

async function requireOrganizationAdmin() {
  const context = await requireUserContext();
  if (!hasRoleAtLeast(context.role, ROLES.ADMIN)) {
    throw new Error("只有经营主体管理员可以维护货盘与合作协议");
  }
  return context;
}

export async function getMultiPartyManagementData() {
  const context = await requireOrganizationAdmin();
  const activeConnections = await prisma.organizationConnection.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { requesterOrganizationId: context.organizationId },
        { targetOrganizationId: context.organizationId },
      ],
    },
    select: { requesterOrganizationId: true, targetOrganizationId: true },
  });
  const connectedOrganizationIds = activeConnections.map((connection) =>
    connection.requesterOrganizationId === context.organizationId
      ? connection.targetOrganizationId
      : connection.requesterOrganizationId
  );
  const [organizations, pools, channels, locations, agreements] = await Promise.all([
    prisma.organization.findMany({
      where: { id: { in: [context.organizationId, ...connectedOrganizationIds] } },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.inventoryPool.findMany({
      where: { organizationId: context.organizationId },
      include: { _count: { select: { accesses: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.salesChannelAccount.findMany({
      where: { organizationId: context.organizationId },
      include: { _count: { select: { accesses: true, listings: true, customerOrders: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.location.findMany({
      where: {
        OR: [
          { operatorOrganizationId: context.organizationId },
          { accesses: { some: { userId: context.userId } } },
        ],
      },
      include: {
        operatorOrganization: { select: { id: true, name: true } },
        _count: { select: { accesses: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.serviceAgreement.findMany({
      where: {
        OR: [
          { clientOrganizationId: context.organizationId },
          { providerOrganizationId: context.organizationId },
        ],
      },
      include: {
        clientOrganization: { select: { id: true, name: true } },
        providerOrganization: { select: { id: true, name: true } },
        inventoryPool: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { context, organizations, pools, channels, locations, agreements };
}

export async function syncLegacyFoundationAction() {
  try {
    const context = await requireOrganizationAdmin();
    const result = await syncLegacyOrganizationFoundation(context.organizationId);
    revalidatePath("/settings/business-structure");
    revalidatePath("/settings/team");
    return actionSuccess(result);
  } catch (error) {
    return toActionFailure(error, "初始化货盘与销售店铺失败");
  }
}

export async function createServiceAgreementAction(data: {
  clientOrganizationId: string;
  providerOrganizationId: string;
  inventoryPoolId?: string;
  locationId?: string;
  serviceTypes: string[];
  settlementCurrency: string;
  paymentTermsDays?: number;
  notes?: string;
}) {
  try {
    const context = await requireOrganizationAdmin();
    if (
      context.organizationId !== data.clientOrganizationId &&
      context.organizationId !== data.providerOrganizationId
    ) {
      throw new Error("只能为当前经营主体创建合作协议");
    }
    if (data.clientOrganizationId === data.providerOrganizationId) {
      throw new Error("客户主体和服务主体不能相同");
    }
    if (data.serviceTypes.length === 0) throw new Error("请至少选择一种服务");
    if (!/^[A-Z]{3}$/.test(data.settlementCurrency)) throw new Error("结算币种无效");

    const [client, provider, pool, location] = await Promise.all([
      prisma.organization.findUnique({ where: { id: data.clientOrganizationId } }),
      prisma.organization.findUnique({ where: { id: data.providerOrganizationId } }),
      data.inventoryPoolId
        ? prisma.inventoryPool.findUnique({ where: { id: data.inventoryPoolId } })
        : null,
      data.locationId ? prisma.location.findUnique({ where: { id: data.locationId } }) : null,
    ]);
    if (!client || !provider) throw new Error("经营主体不存在");
    const activeConnection = await getActiveOrganizationConnection(
      prisma,
      data.clientOrganizationId,
      data.providerOrganizationId
    );
    if (!activeConnection) throw new Error("双方企业尚未建立有效连接");
    if (pool && pool.organizationId !== data.clientOrganizationId) {
      throw new Error("协议货盘必须属于客户主体");
    }
    if (location && location.operatorOrganizationId !== data.providerOrganizationId) {
      throw new Error("协议仓库必须由服务主体运营");
    }

    const agreement = await prisma.serviceAgreement.create({
      data: {
        clientOrganizationId: data.clientOrganizationId,
        providerOrganizationId: data.providerOrganizationId,
        inventoryPoolId: data.inventoryPoolId || null,
        locationId: data.locationId || null,
        serviceTypes: data.serviceTypes,
        settlementCurrency: data.settlementCurrency,
        paymentTermsDays: Math.max(0, data.paymentTermsDays ?? 0),
        notes: data.notes || null,
        status: "PENDING_COUNTERPARTY",
        proposedByOrganizationId: context.organizationId,
      },
    });
    revalidatePath("/settings/business-structure");
    return actionSuccess({ id: agreement.id });
  } catch (error) {
    return toActionFailure(error, "创建服务协议失败");
  }
}

export async function activateServiceAgreementAction(id: string) {
  try {
    const context = await requireOrganizationAdmin();
    const agreement = await prisma.serviceAgreement.findUnique({ where: { id } });
    if (!agreement) throw new Error("服务协议不存在");
    if (
      ![agreement.clientOrganizationId, agreement.providerOrganizationId].includes(
        context.organizationId
      )
    ) {
      throw new Error("当前企业不是协议参与方");
    }
    if (agreement.status !== "PENDING_COUNTERPARTY") {
      throw new Error("只有待对方确认的协议可以启用");
    }
    if (!agreement.proposedByOrganizationId) throw new Error("旧版协议草稿需要重新创建");
    if (agreement.proposedByOrganizationId === context.organizationId) {
      throw new Error("协议必须由对方企业管理员确认");
    }
    const activeConnection = await getActiveOrganizationConnection(
      prisma,
      agreement.clientOrganizationId,
      agreement.providerOrganizationId
    );
    if (!activeConnection) throw new Error("双方企业连接已失效，不能启用协议");
    await prisma.serviceAgreement.update({
      where: { id },
      data: {
        status: "ACTIVE",
        effectiveFrom: agreement.effectiveFrom ?? new Date(),
        acceptedById: context.userId,
        acceptedAt: new Date(),
      },
    });
    revalidatePath("/settings/business-structure");
    return actionSuccess({ id });
  } catch (error) {
    return toActionFailure(error, "启用服务协议失败");
  }
}

export async function grantScopedAccessAction(data: {
  scopeType: "INVENTORY_POOL" | "CHANNEL" | "LOCATION";
  scopeId: string;
  userEmail: string;
  role: string;
  permissions?: Record<string, boolean>;
}) {
  try {
    const context = await requireOrganizationAdmin();
    const user = await prisma.user.findUnique({
      where: { email: data.userEmail.trim().toLowerCase() },
      select: { id: true },
    });
    if (!user) throw new Error("目标账号尚未注册");
    if (data.scopeType === "INVENTORY_POOL") {
      const pool = await prisma.inventoryPool.findUnique({ where: { id: data.scopeId } });
      if (!pool || pool.organizationId !== context.organizationId) throw new Error("无权授权该货盘");
      await prisma.inventoryPoolAccess.upsert({
        where: { inventoryPoolId_userId: { inventoryPoolId: pool.id, userId: user.id } },
        update: { role: data.role, permissions: data.permissions },
        create: { inventoryPoolId: pool.id, userId: user.id, role: data.role, permissions: data.permissions },
      });
    } else if (data.scopeType === "CHANNEL") {
      const channel = await prisma.salesChannelAccount.findUnique({ where: { id: data.scopeId } });
      if (!channel || channel.organizationId !== context.organizationId) throw new Error("无权授权该销售店铺");
      await prisma.channelAccess.upsert({
        where: { salesChannelAccountId_userId: { salesChannelAccountId: channel.id, userId: user.id } },
        update: { role: data.role, permissions: data.permissions },
        create: { salesChannelAccountId: channel.id, userId: user.id, role: data.role, permissions: data.permissions },
      });
    } else {
      const location = await prisma.location.findUnique({ where: { id: data.scopeId } });
      if (!location || location.operatorOrganizationId !== context.organizationId) throw new Error("无权授权该仓库");
      await prisma.locationAccess.upsert({
        where: { locationId_userId: { locationId: location.id, userId: user.id } },
        update: { role: data.role, permissions: data.permissions },
        create: { locationId: location.id, userId: user.id, role: data.role, permissions: data.permissions },
      });
    }
    revalidatePath("/settings/business-structure");
    return actionSuccess({ userId: user.id });
  } catch (error) {
    return toActionFailure(error, "授权失败");
  }
}
