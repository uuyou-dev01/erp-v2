import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveCompanionDevice } from "@/lib/mobile/device-auth";
import { mobileApiError } from "@/lib/mobile/http";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ context }, { id }] = await Promise.all([requireActiveCompanionDevice(), params]);
    await prisma.pushSubscription.updateMany({ where: { id, organizationId: context.organizationId, userId: context.userId }, data: { revokedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return mobileApiError(error, "关闭推送失败");
  }
}
