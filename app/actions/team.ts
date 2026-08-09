"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { hasRoleAtLeast, ROLES } from "@/lib/auth/permissions";
import { requireUserContext } from "@/lib/auth/user-context";
import { hashPassword } from "@/lib/auth/password";

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
  return TEAM_ROLES.includes(role as (typeof TEAM_ROLES)[number])
    ? role
    : ROLES.VIEWER;
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
  const [stores, members] = await Promise.all([
    prisma.store.findMany({
      where: { id: { in: context.storeIds } },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
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
          select: { storeId: true, role: true },
        },
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    }),
  ]);

  return {
    currentUserId: context.userId,
    stores,
    roles: TEAM_ROLES,
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
      };
    }),
  };
}

export async function createTeamMember(formData: FormData) {
  const context = await requireTeamManager();
  const email = cleanString(formData.get("email")).toLowerCase();
  const name = cleanString(formData.get("name"));
  const role = cleanRole(formData.get("role"));
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

export async function deactivateTeamMember(formData: FormData) {
  const context = await requireTeamManager();
  const userId = cleanString(formData.get("userId"));
  if (!userId) throw new Error("成员不存在");
  if (userId === context.userId) throw new Error("不能停用当前登录成员");

  await prisma.membership.updateMany({
    where: { organizationId: context.organizationId, userId },
    data: { status: "INACTIVE" },
  });
  await prisma.storeAccess.deleteMany({
    where: { userId, storeId: { in: context.storeIds } },
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
