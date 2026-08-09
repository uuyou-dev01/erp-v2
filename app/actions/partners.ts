"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { requireUserContext } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";

function normalizeCode(value: string) {
  const code = value.trim().toUpperCase();
  if (!code) throw new Error("合作方代码不能为空");
  return code;
}

function parseOptionalRate(value: string | undefined, label: string) {
  if (!value || value.trim() === "") return null;
  const rate = new Decimal(value);
  if (!rate.isFinite() || rate.lt(0) || rate.gt(1)) {
    throw new Error(`${label}必须是 0 到 1 之间的数字`);
  }
  return rate;
}

function revalidatePartnerSurfaces(id?: string) {
  revalidatePath("/settings/partners");
  revalidatePath("/marketplace");
  revalidatePath("/marketplace/my-offers");
  if (id) revalidatePath(`/settings/partners?partnerId=${id}`);
}

async function resolveLinkedOrganizationId(code?: string) {
  const normalized = code?.trim().toUpperCase();
  if (!normalized) return null;
  const organization = await prisma.organization.findUnique({
    where: { code: normalized },
    select: { id: true },
  });
  if (!organization) throw new Error("没有找到该经营主体代码，请让对方确认代码后再关联");
  return organization.id;
}

export async function getPartners(storeId?: string) {
  const context = await requireUserContext(storeId ? { storeId } : undefined);
  const partners = await prisma.partner.findMany({
    where: { storeId: context.activeStoreId },
    include: {
      organization: { select: { id: true, name: true, code: true } },
      tradingRelationships: {
        orderBy: { updatedAt: "desc" },
      },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  return partners.map((partner) => ({
    ...partner,
    tradingRelationships: partner.tradingRelationships.map((relationship) => ({
      ...relationship,
      commissionRate: relationship.commissionRate?.toString() ?? null,
      serviceFeeRate: relationship.serviceFeeRate?.toString() ?? null,
    })),
  }));
}

export async function getActivePartners(storeId?: string) {
  const context = await requireUserContext(storeId ? { storeId } : undefined);
  return prisma.partner.findMany({
    where: { storeId: context.activeStoreId, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });
}

export async function createPartnerAction(data: {
  storeId?: string;
  code: string;
  name: string;
  type?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  defaultCurrency?: string;
  notes?: string;
  relationshipType?: string;
  visibilityScope?: string;
  commissionRate?: string;
  serviceFeeRate?: string;
  settlementCurrency?: string;
  relationshipNotes?: string;
  organizationCode?: string;
}) {
  try {
    const context = await requireUserContext(data.storeId ? { storeId: data.storeId } : undefined);
    const code = normalizeCode(data.code);
    const name = data.name.trim();
    if (!name) throw new Error("合作方名称不能为空");
    const organizationId = await resolveLinkedOrganizationId(data.organizationCode);

    const partner = await prisma.partner.create({
      data: {
        storeId: context.activeStoreId,
        organizationId,
        code,
        name,
        type: data.type || "SUPPLIER",
        contactName: data.contactName || null,
        contactEmail: data.contactEmail || null,
        contactPhone: data.contactPhone || null,
        defaultCurrency: data.defaultCurrency || null,
        notes: data.notes || null,
        tradingRelationships: {
          create: {
            storeId: context.activeStoreId,
            relationshipType: data.relationshipType || "SUPPLY",
            visibilityScope: data.visibilityScope || "PRIVATE",
            commissionRate: parseOptionalRate(data.commissionRate, "默认佣金比例"),
            serviceFeeRate: parseOptionalRate(data.serviceFeeRate, "默认服务费比例"),
            settlementCurrency: data.settlementCurrency || data.defaultCurrency || null,
            notes: data.relationshipNotes || null,
          },
        },
      },
    });

    revalidatePartnerSurfaces(partner.id);
    return actionSuccess({ id: partner.id });
  } catch (error) {
    return toActionFailure(error, "创建合作方失败，请重试");
  }
}

export async function updatePartnerAction(
  id: string,
  data: {
    storeId?: string;
    code: string;
    name: string;
    type?: string;
    status?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    defaultCurrency?: string;
    notes?: string;
    organizationCode?: string;
  }
) {
  try {
    const existing = await prisma.partner.findUnique({ where: { id } });
    if (!existing) throw new Error("合作方不存在");
    const context = await requireUserContext({ storeId: data.storeId ?? existing.storeId });
    const name = data.name.trim();
    if (!name) throw new Error("合作方名称不能为空");
    const organizationId = await resolveLinkedOrganizationId(data.organizationCode);

    const partner = await prisma.partner.update({
      where: { id },
      data: {
        storeId: context.activeStoreId,
        organizationId,
        code: normalizeCode(data.code),
        name,
        type: data.type || "SUPPLIER",
        status: data.status || "ACTIVE",
        contactName: data.contactName || null,
        contactEmail: data.contactEmail || null,
        contactPhone: data.contactPhone || null,
        defaultCurrency: data.defaultCurrency || null,
        notes: data.notes || null,
      },
    });

    revalidatePartnerSurfaces(partner.id);
    return actionSuccess({ id: partner.id });
  } catch (error) {
    return toActionFailure(error, "保存合作方失败，请重试");
  }
}

export async function upsertTradingRelationshipAction(data: {
  storeId?: string;
  partnerId: string;
  relationshipType?: string;
  visibilityScope?: string;
  status?: string;
  commissionRate?: string;
  serviceFeeRate?: string;
  settlementCurrency?: string;
  notes?: string;
}) {
  try {
    const partner = await prisma.partner.findUnique({ where: { id: data.partnerId } });
    if (!partner) throw new Error("合作方不存在");
    const context = await requireUserContext({ storeId: data.storeId ?? partner.storeId });
    const relationshipType = data.relationshipType || "SUPPLY";

    const relationship = await prisma.tradingRelationship.upsert({
      where: {
        storeId_partnerId_relationshipType: {
          storeId: context.activeStoreId,
          partnerId: partner.id,
          relationshipType,
        },
      },
      create: {
        storeId: context.activeStoreId,
        partnerId: partner.id,
        relationshipType,
        visibilityScope: data.visibilityScope || "PRIVATE",
        status: data.status || "ACTIVE",
        commissionRate: parseOptionalRate(data.commissionRate, "默认佣金比例"),
        serviceFeeRate: parseOptionalRate(data.serviceFeeRate, "默认服务费比例"),
        settlementCurrency: data.settlementCurrency || null,
        notes: data.notes || null,
      },
      update: {
        visibilityScope: data.visibilityScope || "PRIVATE",
        status: data.status || "ACTIVE",
        commissionRate: parseOptionalRate(data.commissionRate, "默认佣金比例"),
        serviceFeeRate: parseOptionalRate(data.serviceFeeRate, "默认服务费比例"),
        settlementCurrency: data.settlementCurrency || null,
        notes: data.notes || null,
      },
    });

    revalidatePartnerSurfaces(partner.id);
    return actionSuccess({ id: relationship.id });
  } catch (error) {
    return toActionFailure(error, "保存合作关系失败，请重试");
  }
}

export async function deactivatePartnerAction(id: string) {
  try {
    const existing = await prisma.partner.findUnique({ where: { id } });
    if (!existing) throw new Error("合作方不存在");
    await requireUserContext({ storeId: existing.storeId });

    await prisma.partner.update({
      where: { id },
      data: {
        status: "INACTIVE",
        tradingRelationships: {
          updateMany: {
            where: { status: "ACTIVE" },
            data: { status: "INACTIVE" },
          },
        },
      },
    });

    revalidatePartnerSurfaces(id);
    return actionSuccess({ id });
  } catch (error) {
    return toActionFailure(error, "停用合作方失败，请重试");
  }
}
