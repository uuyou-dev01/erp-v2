"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  ACTIVE_STORE_COOKIE,
  ACTIVE_ORGANIZATION_COOKIE,
  requireUserContext,
  USER_CONTEXT_COOKIE,
} from "@/lib/auth/user-context";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSessionToken } from "@/lib/auth/session-token";

async function authenticateUser(
  emailInput: FormDataEntryValue | null,
  passwordInput: FormDataEntryValue | null,
) {
  const email = String(emailInput || "").trim().toLowerCase();
  const password = String(passwordInput || "");
  if (!email) {
    throw new Error("请输入邮箱");
  }
  if (!password) {
    throw new Error("请输入密码");
  }

  const user = await prisma.user.findFirst({
    where: {
      email,
      memberships: {
        some: {
          status: "ACTIVE",
        },
      },
    },
    select: { email: true, password: true },
  });
  if (!user || !(await verifyPassword(password, user.password))) {
    throw new Error("邮箱或密码不正确");
  }
  if (user.password === "hashed_password_placeholder") {
    await prisma.user.update({
      where: { email: user.email },
      data: { password: await hashPassword(password) },
    });
  }

  const cookieStore = await cookies();
  cookieStore.set(USER_CONTEXT_COOKIE, createSessionToken(user.email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  cookieStore.set(ACTIVE_STORE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return user.email;
}

export async function switchCurrentUser(formData: FormData) {
  await authenticateUser(formData.get("email"), formData.get("password"));

  redirect("/workbench");
}

export async function switchCurrentUserAction(formData: FormData) {
  try {
    const email = await authenticateUser(
      formData.get("email"),
      formData.get("password"),
    );
    return actionSuccess({ email });
  } catch (error) {
    return toActionFailure(error, "切换操作人失败，请重试");
  }
}

export async function clearCurrentUser() {
  const cookieStore = await cookies();
  cookieStore.delete(USER_CONTEXT_COOKIE);
  cookieStore.delete(ACTIVE_STORE_COOKIE);
  cookieStore.delete(ACTIVE_ORGANIZATION_COOKIE);
  redirect("/login");
}

export async function switchActiveOrganizationAction(organizationId: string) {
  try {
    const context = await requireUserContext();
    if (!context.organizationIds.includes(organizationId)) {
      throw new Error("无权访问该经营主体");
    }
    const membership = await prisma.membership.findFirst({
      where: {
        organizationId,
        userId: context.userId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!membership) throw new Error("当前账号不是该经营主体的有效成员");

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    cookieStore.delete(ACTIVE_STORE_COOKIE);
    return actionSuccess({ organizationId });
  } catch (error) {
    return toActionFailure(error, "切换经营主体失败，请重试");
  }
}

export async function switchActiveStoreAction(storeId: string) {
  try {
    const context = await requireUserContext({ storeId });
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_STORE_COOKIE, context.activeStoreId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    return actionSuccess({ storeId: context.activeStoreId });
  } catch (error) {
    return toActionFailure(error, "切换店铺失败，请重试");
  }
}
