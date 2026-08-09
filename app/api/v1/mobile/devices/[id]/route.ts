import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireUserContext } from "@/lib/auth/user-context";
import { MOBILE_DEVICE_COOKIE } from "@/lib/mobile/device-auth";
import { mobileApiError } from "@/lib/mobile/http";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [context, { id }] = await Promise.all([requireUserContext(), params]);
    const result = await prisma.companionDevice.updateMany({
      where: { id, organizationId: context.organizationId, userId: context.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!result.count) throw new Error("设备不存在或已经撤销");
    await prisma.pushSubscription.updateMany({ where: { deviceId: id, organizationId: context.organizationId }, data: { revokedAt: new Date() } });
    const cookieStore = await cookies();
    if (cookieStore.get(MOBILE_DEVICE_COOKIE)?.value === id) cookieStore.delete(MOBILE_DEVICE_COOKIE);
    return NextResponse.json({ success: true });
  } catch (error) {
    return mobileApiError(error, "撤销设备失败");
  }
}
