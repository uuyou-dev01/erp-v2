"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { createInvitationToken, hashInvitationToken } from "@/lib/auth/invitation-token";
import { hashPassword } from "@/lib/auth/password";
import { hasRoleAtLeast, ROLES } from "@/lib/auth/permissions";
import { recordAuthAudit } from "@/lib/auth/security-events";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  ACTIVE_STORE_COOKIE,
  requireUserContext,
  USER_CONTEXT_COOKIE,
} from "@/lib/auth/user-context";

const RESET_TOKEN_TYPE = "RESET_PASSWORD";

function resetTtlMinutes() {
  const configured = Number(process.env.AUTH_RESET_TOKEN_TTL_MINUTES ?? "30");
  if (!Number.isFinite(configured)) return 30;
  return Math.min(24 * 60, Math.max(10, Math.floor(configured)));
}

export async function generatePasswordResetTokenAction(targetUserId: string) {
  try {
    const context = await requireUserContext();
    if (!hasRoleAtLeast(context.role, ROLES.ADMIN)) {
      throw new Error("只有企业所有者或管理员可以生成密码重置链接");
    }
    if (!targetUserId) throw new Error("请选择需要重置密码的成员");
    const target = await prisma.user.findFirst({
      where: {
        id: targetUserId,
        accountStatus: "ACTIVE",
        memberships: {
          some: { organizationId: context.organizationId, status: "ACTIVE" },
        },
      },
      select: { id: true, email: true },
    });
    if (!target) throw new Error("目标成员不存在或账号已停用");

    const rawToken = createInvitationToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + resetTtlMinutes() * 60 * 1000);
    await prisma.$transaction(async (tx) => {
      await tx.authToken.updateMany({
        where: { userId: target.id, type: RESET_TOKEN_TYPE, consumedAt: null },
        data: { consumedAt: now },
      });
      await tx.authToken.create({
        data: {
          userId: target.id,
          type: RESET_TOKEN_TYPE,
          tokenHash: hashInvitationToken(rawToken),
          expiresAt,
          createdById: context.userId,
        },
      });
    });
    await recordAuthAudit({
      eventType: "PASSWORD_RESET_TOKEN_CREATED",
      outcome: "SUCCESS",
      email: target.email,
      userId: target.id,
      metadata: { createdById: context.userId },
    });
    return actionSuccess({
      resetPath: `/reset-password/${encodeURIComponent(rawToken)}`,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    return toActionFailure(error, "生成密码重置链接失败，请重试");
  }
}

export async function resetPasswordWithTokenAction(formData: FormData) {
  try {
    const token = String(formData.get("token") || "");
    const newPassword = String(formData.get("newPassword") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");
    if (!token) throw new Error("密码重置链接无效");
    if (newPassword.length < 8) throw new Error("新密码至少需要 8 位");
    if (newPassword !== confirmPassword) throw new Error("两次输入的新密码不一致");

    const tokenHash = hashInvitationToken(token);
    const now = new Date();
    const resetToken = await prisma.authToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, email: true, accountStatus: true } } },
    });
    if (
      !resetToken ||
      resetToken.type !== RESET_TOKEN_TYPE ||
      resetToken.consumedAt ||
      resetToken.expiresAt <= now ||
      resetToken.user.accountStatus !== "ACTIVE"
    ) {
      throw new Error("密码重置链接无效或已过期");
    }

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.authToken.updateMany({
        where: { id: resetToken.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (claimed.count !== 1) throw new Error("密码重置链接已被使用");
      await tx.user.update({
        where: { id: resetToken.user.id },
        data: {
          password: await hashPassword(newPassword),
          sessionVersion: { increment: 1 },
        },
      });
      await tx.authToken.updateMany({
        where: { userId: resetToken.user.id, consumedAt: null },
        data: { consumedAt: now },
      });
    });
    await recordAuthAudit({
      eventType: "PASSWORD_RESET_COMPLETED",
      outcome: "SUCCESS",
      email: resetToken.user.email,
      userId: resetToken.user.id,
    });
    const cookieStore = await cookies();
    cookieStore.delete(USER_CONTEXT_COOKIE);
    cookieStore.delete(ACTIVE_STORE_COOKIE);
    cookieStore.delete(ACTIVE_ORGANIZATION_COOKIE);
    return actionSuccess({ destination: "/login" });
  } catch (error) {
    return toActionFailure(error, "重置密码失败，请重试");
  }
}
