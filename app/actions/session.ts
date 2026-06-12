"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { USER_CONTEXT_COOKIE } from "@/lib/auth/user-context";

export async function getLoginUsers() {
  const users = await prisma.user.findMany({
    where: {
      memberships: {
        some: {
          status: "ACTIVE",
        },
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      memberships: {
        where: { status: "ACTIVE" },
        select: { role: true },
        take: 1,
      },
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });

  return users.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name || user.email,
    role: user.memberships[0]?.role || user.role,
  }));
}

export async function switchCurrentUser(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email) {
    throw new Error("请选择用户");
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
    select: { email: true },
  });
  if (!user) {
    throw new Error("用户不存在或未启用");
  }

  const cookieStore = await cookies();
  cookieStore.set(USER_CONTEXT_COOKIE, user.email, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  redirect("/workbench");
}

export async function clearCurrentUser() {
  const cookieStore = await cookies();
  cookieStore.delete(USER_CONTEXT_COOKIE);
  redirect("/login");
}
