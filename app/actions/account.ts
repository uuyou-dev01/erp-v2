"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  ACTIVE_STORE_COOKIE,
  requireAuthenticatedUser,
  USER_CONTEXT_COOKIE,
} from "@/lib/auth/user-context";
import { recordAuthAudit } from "@/lib/auth/security-events";

function cleanString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function passwordString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

export async function updateMyProfileAction(formData: FormData) {
  try {
    const user = await requireAuthenticatedUser();
    const name = cleanString(formData.get("name"));
    if (!name) throw new Error("请输入姓名");
    if (name.length > 50) throw new Error("姓名不能超过 50 个字符");

    await prisma.user.update({
      where: { id: user.id },
      data: { name },
    });
    revalidatePath("/settings/personal");
    return actionSuccess({ name });
  } catch (error) {
    return toActionFailure(error, "保存个人资料失败，请重试");
  }
}

export async function changeMyPasswordAction(formData: FormData) {
  try {
    const authenticatedUser = await requireAuthenticatedUser();
    const currentPassword = passwordString(formData.get("currentPassword"));
    const newPassword = passwordString(formData.get("newPassword"));
    const confirmPassword = passwordString(formData.get("confirmPassword"));

    if (!currentPassword) throw new Error("请输入当前密码");
    if (newPassword.length < 8) throw new Error("新密码至少需要 8 位");
    if (newPassword !== confirmPassword) throw new Error("两次输入的新密码不一致");
    if (newPassword === currentPassword) throw new Error("新密码不能与当前密码相同");

    const user = await prisma.user.findUnique({
      where: { id: authenticatedUser.id },
      select: { password: true },
    });
    if (!user || !(await verifyPassword(currentPassword, user.password))) {
      throw new Error("当前密码不正确");
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: authenticatedUser.id },
        data: { password: await hashPassword(newPassword), sessionVersion: { increment: 1 } },
      });
      await tx.authToken.updateMany({
        where: { userId: authenticatedUser.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
    });
    await recordAuthAudit({
      eventType: "PASSWORD_CHANGED",
      outcome: "SUCCESS",
      userId: authenticatedUser.id,
    });
    const cookieStore = await cookies();
    cookieStore.delete(USER_CONTEXT_COOKIE);
    cookieStore.delete(ACTIVE_STORE_COOKIE);
    cookieStore.delete(ACTIVE_ORGANIZATION_COOKIE);
    return actionSuccess({ changed: true, destination: "/login" });
  } catch (error) {
    return toActionFailure(error, "修改密码失败，请重试");
  }
}
