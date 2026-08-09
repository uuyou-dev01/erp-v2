import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireUserContext } from "@/lib/auth/user-context";
import { MOBILE_DEVICE_COOKIE } from "@/lib/mobile/device-auth";
import { mobileApiError } from "@/lib/mobile/http";

export async function POST(request: Request) {
  try {
    const [context, body] = await Promise.all([
      requireUserContext(),
      request.json() as Promise<{ installationId?: string; name?: string; clientKind?: string }>,
    ]);
    if (!body.installationId?.trim() || body.installationId.length > 120) throw new Error("设备标识不正确");
    const device = await prisma.companionDevice.upsert({
      where: {
        organizationId_userId_installationId: {
          organizationId: context.organizationId,
          userId: context.userId,
          installationId: body.installationId.trim(),
        },
      },
      create: {
        organizationId: context.organizationId,
        userId: context.userId,
        installationId: body.installationId.trim(),
        name: body.name?.trim() || "移动设备",
        clientKind: body.clientKind?.trim() || "MOBILE_PWA",
        scopes: ["mobile:read", "mobile:execute", "capture:write"],
        lastUsedAt: new Date(),
      },
      update: {
        name: body.name?.trim() || undefined,
        revokedAt: null,
        lastUsedAt: new Date(),
      },
    });
    (await cookies()).set(MOBILE_DEVICE_COOKIE, device.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return NextResponse.json({ success: true, device: { id: device.id, name: device.name, lastUsedAt: device.lastUsedAt } });
  } catch (error) {
    return mobileApiError(error, "设备绑定失败");
  }
}
