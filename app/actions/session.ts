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
import { isSecureCookieEnabled } from "@/lib/auth/cookie-security";
import { isSelfSignupEnabled } from "@/lib/auth/signup-policy";
import { getInvitedSignup } from "@/lib/auth/invited-signup";
import {
  assertLoginRateLimit,
  recordAuthAudit,
  recordLoginFailureAttempt,
} from "@/lib/auth/security-events";

function cleanString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function safeNextPath(value: FormDataEntryValue | null) {
  const path = cleanString(value);
  return path.startsWith("/") && !path.startsWith("//") ? path : null;
}

async function authenticateUser(
  emailInput: FormDataEntryValue | null,
  passwordInput: FormDataEntryValue | null
) {
  const email = String(emailInput || "")
    .trim()
    .toLowerCase();
  const password = String(passwordInput || "");
  if (!email) {
    throw new Error("请输入邮箱");
  }
  if (!password) {
    throw new Error("请输入密码");
  }

  try {
    await assertLoginRateLimit(email);
  } catch (error) {
    await recordAuthAudit({
      eventType: "LOGIN",
      outcome: "BLOCKED",
      email,
      metadata: { reason: "RATE_LIMIT" },
    });
    throw error;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      password: true,
      sessionVersion: true,
      accountStatus: true,
      memberships: {
        where: { status: "ACTIVE" },
        select: { id: true },
        take: 1,
      },
      locationFulfillerAssignments: {
        where: { status: "ACTIVE" },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (user?.password === "hashed_password_placeholder" && process.env.NODE_ENV === "production") {
    await recordLoginFailureAttempt(email);
    await recordAuthAudit({
      eventType: "LOGIN",
      outcome: "BLOCKED",
      email,
      userId: user.id,
      metadata: { reason: "LEGACY_DEMO_PASSWORD" },
    });
    throw new Error("该账号仍使用演示占位密码，请联系管理员生成一次性密码重置链接");
  }
  if (!user || !(await verifyPassword(password, user.password))) {
    await recordLoginFailureAttempt(email);
    await recordAuthAudit({
      eventType: "LOGIN",
      outcome: "FAILURE",
      email,
      userId: user?.id,
    });
    throw new Error("邮箱或密码不正确");
  }
  if (user.accountStatus !== "ACTIVE") {
    await recordAuthAudit({
      eventType: "LOGIN",
      outcome: "BLOCKED",
      email,
      userId: user.id,
      metadata: { accountStatus: user.accountStatus },
    });
    throw new Error("账号已停用，请联系管理员");
  }
  if (user.password === "hashed_password_placeholder") {
    await prisma.user.update({
      where: { email: user.email },
      data: { password: await hashPassword(password) },
    });
  }

  const cookieStore = await cookies();
  cookieStore.set(USER_CONTEXT_COOKIE, createSessionToken(user.id, user.sessionVersion), {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookieEnabled(),
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
    priority: "high",
  });

  await recordAuthAudit({
    eventType: "LOGIN",
    outcome: "SUCCESS",
    email,
    userId: user.id,
  });
  cookieStore.set(ACTIVE_STORE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookieEnabled(),
    path: "/",
    maxAge: 0,
  });
  cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookieEnabled(),
    path: "/",
    maxAge: 0,
  });

  return {
    id: user.id,
    email: user.email,
    hasMembership: user.memberships.length > 0,
    hasWarehouseCollaboration: user.locationFulfillerAssignments.length > 0,
  };
}

export async function switchCurrentUser(formData: FormData) {
  await authenticateUser(formData.get("email"), formData.get("password"));

  redirect("/workbench");
}

export async function switchCurrentUserAction(formData: FormData) {
  try {
    const user = await authenticateUser(formData.get("email"), formData.get("password"));
    const requestedNext = safeNextPath(formData.get("next"));
    const destination = user.hasMembership
      ? (requestedNext ?? "/workbench")
      : requestedNext?.startsWith("/invite/team/") ||
          requestedNext?.startsWith("/invite/warehouse/")
        ? requestedNext
        : user.hasWarehouseCollaboration
          ? requestedNext?.startsWith("/collaboration/tasks")
            ? requestedNext
            : "/collaboration/tasks"
          : "/onboarding";
    return actionSuccess({ email: user.email, destination });
  } catch (error) {
    return toActionFailure(error, "切换操作人失败，请重试");
  }
}

export const loginAction = switchCurrentUserAction;

export async function registerAccountAction(formData: FormData) {
  try {
    const requestedNext = safeNextPath(formData.get("next"));
    const invitedSignup = requestedNext ? await getInvitedSignup(requestedNext) : null;
    if (!isSelfSignupEnabled() && !invitedSignup) {
      throw new Error("当前环境未开放自助注册，请联系管理员");
    }
    const name = cleanString(formData.get("name"));
    const email = cleanString(formData.get("email")).toLowerCase();
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");
    if (!name) throw new Error("请输入姓名");
    if (name.length > 50) throw new Error("姓名不能超过 50 个字符");
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("请输入有效邮箱");
    if (invitedSignup && invitedSignup.email.toLowerCase() !== email) {
      throw new Error(`请使用受邀邮箱 ${invitedSignup.email} 注册`);
    }
    if (password.length < 8) throw new Error("密码至少需要 8 位");
    if (password !== confirmPassword) throw new Error("两次输入的密码不一致");

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new Error("该邮箱已注册，请直接登录");

    let user: { id: string; email: string; sessionVersion: number };
    try {
      user = await prisma.user.create({
        data: {
          name,
          email,
          password: await hashPassword(password),
          role: "USER",
          storeId: null,
          emailVerifiedAt: invitedSignup ? new Date() : null,
        },
        select: { id: true, email: true, sessionVersion: true },
      });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code: string }).code === "P2002"
      ) {
        throw new Error("该邮箱已注册，请直接登录");
      }
      throw error;
    }
    const cookieStore = await cookies();
    cookieStore.set(USER_CONTEXT_COOKIE, createSessionToken(user.id, user.sessionVersion), {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureCookieEnabled(),
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
      priority: "high",
    });
    cookieStore.delete(ACTIVE_STORE_COOKIE);
    cookieStore.delete(ACTIVE_ORGANIZATION_COOKIE);
    await recordAuthAudit({
      eventType: "REGISTER",
      outcome: "SUCCESS",
      email,
      userId: user.id,
      metadata: { invitationScoped: Boolean(invitedSignup) },
    });
    return actionSuccess({
      userId: user.id,
      destination:
        requestedNext?.startsWith("/invite/team/") ||
        requestedNext?.startsWith("/invite/warehouse/")
          ? requestedNext
          : "/onboarding",
    });
  } catch (error) {
    return toActionFailure(error, "注册失败，请稍后重试");
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
      secure: isSecureCookieEnabled(),
      path: "/",
      priority: "high",
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
      secure: isSecureCookieEnabled(),
      path: "/",
      priority: "high",
    });
    return actionSuccess({ storeId: context.activeStoreId });
  } catch (error) {
    return toActionFailure(error, "切换店铺失败，请重试");
  }
}
