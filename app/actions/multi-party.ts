"use server";

import { revalidatePath } from "next/cache";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { getActiveOrganizationConnection } from "@/lib/application/organization-connections";
import { syncLegacyOrganizationFoundation } from "@/lib/application/multi-party-foundation";
import { hasRoleAtLeast, ROLES } from "@/lib/auth/permissions";
import { requireUserContext } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";
import { notifyOrganizationAdministrators } from "@/lib/application/collaboration-notifications";
import {
  agreementCounterpartOrganizationId,
  assertCanConfirmServiceAgreement,
  canEndServiceAgreement,
  canReviseServiceAgreement,
  normalizeServiceAgreementTypes,
  SERVICE_AGREEMENT_STATUS,
} from "@/lib/application/service-agreement-lifecycle";

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
        revision: { select: { id: true } },
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
    const serviceTypes = normalizeServiceAgreementTypes(data.serviceTypes);
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
        serviceTypes,
        settlementCurrency: data.settlementCurrency,
        paymentTermsDays: Math.max(0, data.paymentTermsDays ?? 0),
        notes: data.notes || null,
        status: "PENDING_COUNTERPARTY",
        proposedByOrganizationId: context.organizationId,
      },
    });
    const counterpartOrganizationId =
      context.organizationId === data.clientOrganizationId
        ? data.providerOrganizationId
        : data.clientOrganizationId;
    await notifyOrganizationAdministrators({
      organizationId: counterpartOrganizationId,
      actorId: context.userId,
      refType: "SERVICE_AGREEMENT",
      refId: agreement.id,
      type: "SERVICE_AGREEMENT_PROPOSED",
      title: `${context.organizationId === data.clientOrganizationId ? client.name : provider.name} 发来服务协议`,
      body: `服务范围：${serviceTypes.join("、")}；结算币种：${data.settlementCurrency}`,
      actionUrl: `/settings/business-structure#agreement-${encodeURIComponent(agreement.id)}`,
      dedupeKey: `service-agreement:${agreement.id}:proposed:v${agreement.version}`,
      priority: "HIGH",
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
    const counterpartOrganizationId = agreementCounterpartOrganizationId({
      ...agreement,
      currentOrganizationId: context.organizationId,
    });
    assertCanConfirmServiceAgreement({
      ...agreement,
      currentOrganizationId: context.organizationId,
    });
    const activeConnection = await getActiveOrganizationConnection(
      prisma,
      agreement.clientOrganizationId,
      agreement.providerOrganizationId
    );
    if (!activeConnection) throw new Error("双方企业连接已失效，不能启用协议");
    const now = new Date();
    const isInitialAcceptance = agreement.status === SERVICE_AGREEMENT_STATUS.PENDING_COUNTERPARTY;
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.serviceAgreement.updateMany({
        where: { id, status: agreement.status },
        data: {
          status: SERVICE_AGREEMENT_STATUS.ACTIVE,
          effectiveFrom: agreement.effectiveFrom ?? now,
          effectiveTo: null,
          acceptedById: isInitialAcceptance ? context.userId : agreement.acceptedById,
          acceptedAt: isInitialAcceptance ? now : agreement.acceptedAt,
          pausedByOrganizationId: null,
        },
      });
      if (!claimed.count) throw new Error("协议已被其他管理员处理，请刷新后重试");
      if (agreement.supersedesAgreementId) {
        const superseded = await tx.serviceAgreement.updateMany({
          where: {
            id: agreement.supersedesAgreementId,
            status: { in: ["PENDING_COUNTERPARTY", "ACTIVE", "PAUSED"] },
          },
          data: { status: SERVICE_AGREEMENT_STATUS.ENDED, effectiveTo: now },
        });
        if (!superseded.count) {
          throw new Error("被修订协议已结束或状态已变化，请刷新后重试");
        }
      }
    });
    await notifyOrganizationAdministrators({
      organizationId: counterpartOrganizationId,
      actorId: context.userId,
      refType: "SERVICE_AGREEMENT",
      refId: agreement.id,
      type: isInitialAcceptance ? "SERVICE_AGREEMENT_ACCEPTED" : "SERVICE_AGREEMENT_RESUMED",
      title: isInitialAcceptance ? "对方已接受服务协议" : "对方已确认恢复服务协议",
      body: isInitialAcceptance
        ? agreement.supersedesAgreementId
          ? `协议版本 ${agreement.version} 已生效，上一版本已结束并保留历史记录。`
          : `协议版本 ${agreement.version} 已生效。`
        : `协议版本 ${agreement.version} 已恢复生效。`,
      actionUrl: `/settings/business-structure#agreement-${encodeURIComponent(agreement.id)}`,
      dedupeKey: isInitialAcceptance
        ? `service-agreement:${agreement.id}:accepted:v${agreement.version}`
        : `service-agreement:${agreement.id}:resumed:${agreement.pausedAt?.toISOString() ?? "legacy"}`,
    });
    revalidatePath("/settings/business-structure");
    return actionSuccess({ id });
  } catch (error) {
    return toActionFailure(error, "启用服务协议失败");
  }
}

export async function pauseServiceAgreementAction(id: string) {
  try {
    const context = await requireOrganizationAdmin();
    const agreement = await prisma.serviceAgreement.findUnique({ where: { id } });
    if (!agreement) throw new Error("服务协议不存在");
    const counterpartOrganizationId = agreementCounterpartOrganizationId({
      ...agreement,
      currentOrganizationId: context.organizationId,
    });
    if (agreement.status !== SERVICE_AGREEMENT_STATUS.ACTIVE) {
      throw new Error("只有生效中的协议可以暂停");
    }
    const now = new Date();
    const claimed = await prisma.serviceAgreement.updateMany({
      where: { id, status: SERVICE_AGREEMENT_STATUS.ACTIVE },
      data: {
        status: SERVICE_AGREEMENT_STATUS.PAUSED,
        pausedByOrganizationId: context.organizationId,
        pausedAt: now,
      },
    });
    if (!claimed.count) throw new Error("协议状态已变化，请刷新后重试");
    await notifyOrganizationAdministrators({
      organizationId: counterpartOrganizationId,
      actorId: context.userId,
      refType: "SERVICE_AGREEMENT",
      refId: agreement.id,
      type: "SERVICE_AGREEMENT_PAUSED",
      title: `服务协议 v${agreement.version} 已暂停`,
      body: "恢复协议需要由未发起暂停的一方管理员重新确认。",
      actionUrl: `/settings/business-structure#agreement-${encodeURIComponent(agreement.id)}`,
      dedupeKey: `service-agreement:${agreement.id}:paused:${now.toISOString()}`,
      priority: "HIGH",
    });
    revalidatePath("/settings/business-structure");
    return actionSuccess({ id, status: SERVICE_AGREEMENT_STATUS.PAUSED });
  } catch (error) {
    return toActionFailure(error, "暂停服务协议失败");
  }
}

export async function endServiceAgreementAction(id: string) {
  try {
    const context = await requireOrganizationAdmin();
    const agreement = await prisma.serviceAgreement.findUnique({ where: { id } });
    if (!agreement) throw new Error("服务协议不存在");
    const counterpartOrganizationId = agreementCounterpartOrganizationId({
      ...agreement,
      currentOrganizationId: context.organizationId,
    });
    if (!canEndServiceAgreement(agreement.status)) throw new Error("当前协议不能结束");
    const now = new Date();
    const claimed = await prisma.serviceAgreement.updateMany({
      where: { id, status: agreement.status },
      data: { status: SERVICE_AGREEMENT_STATUS.ENDED, effectiveTo: now },
    });
    if (!claimed.count) throw new Error("协议状态已变化，请刷新后重试");
    await notifyOrganizationAdministrators({
      organizationId: counterpartOrganizationId,
      actorId: context.userId,
      refType: "SERVICE_AGREEMENT",
      refId: agreement.id,
      type: "SERVICE_AGREEMENT_ENDED",
      title: `服务协议 v${agreement.version} 已结束`,
      body: "历史协议与既有成交快照继续保留，只停止新的业务授权。",
      actionUrl: `/settings/business-structure#agreement-${encodeURIComponent(agreement.id)}`,
      dedupeKey: `service-agreement:${agreement.id}:ended`,
      priority: "HIGH",
    });
    revalidatePath("/settings/business-structure");
    return actionSuccess({ id, status: SERVICE_AGREEMENT_STATUS.ENDED });
  } catch (error) {
    return toActionFailure(error, "结束服务协议失败");
  }
}

export async function reviseServiceAgreementAction(data: {
  id: string;
  serviceTypes: string[];
  settlementCurrency: string;
  paymentTermsDays: number;
  notes?: string;
}) {
  try {
    const context = await requireOrganizationAdmin();
    const source = await prisma.serviceAgreement.findUnique({
      where: { id: data.id },
      include: { revision: { select: { id: true } } },
    });
    if (!source) throw new Error("服务协议不存在");
    const counterpartOrganizationId = agreementCounterpartOrganizationId({
      ...source,
      currentOrganizationId: context.organizationId,
    });
    if (!canReviseServiceAgreement(source.status)) {
      throw new Error("只有生效中或已暂停的协议可以创建修订版");
    }
    if (source.revision) throw new Error("该协议已有后续版本，请从最新版本继续修订");
    const activeConnection = await getActiveOrganizationConnection(
      prisma,
      source.clientOrganizationId,
      source.providerOrganizationId
    );
    if (!activeConnection) throw new Error("双方企业连接已失效，不能修订协议");
    const serviceTypes = normalizeServiceAgreementTypes(data.serviceTypes);
    const settlementCurrency = data.settlementCurrency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(settlementCurrency)) throw new Error("结算币种无效");
    const agreement = await prisma.serviceAgreement.create({
      data: {
        clientOrganizationId: source.clientOrganizationId,
        providerOrganizationId: source.providerOrganizationId,
        inventoryPoolId: source.inventoryPoolId,
        locationId: source.locationId,
        serviceTypes,
        settlementCurrency,
        paymentTermsDays: Math.max(0, Math.floor(data.paymentTermsDays || 0)),
        notes: data.notes?.trim() || null,
        status: SERVICE_AGREEMENT_STATUS.PENDING_COUNTERPARTY,
        proposedByOrganizationId: context.organizationId,
        supersedesAgreementId: source.id,
        version: source.version + 1,
      },
    });
    await notifyOrganizationAdministrators({
      organizationId: counterpartOrganizationId,
      actorId: context.userId,
      refType: "SERVICE_AGREEMENT",
      refId: agreement.id,
      type: "SERVICE_AGREEMENT_REVISION_PROPOSED",
      title: `服务协议修订版 v${agreement.version} 待确认`,
      body: `服务范围：${serviceTypes.join("、")}；结算币种：${settlementCurrency}`,
      actionUrl: `/settings/business-structure#agreement-${encodeURIComponent(agreement.id)}`,
      dedupeKey: `service-agreement:${agreement.id}:revision-proposed:v${agreement.version}`,
      priority: "HIGH",
    });
    revalidatePath("/settings/business-structure");
    return actionSuccess({ id: agreement.id, version: agreement.version });
  } catch (error) {
    return toActionFailure(error, "创建协议修订版失败");
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
