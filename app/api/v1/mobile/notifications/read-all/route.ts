import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserContext } from "@/lib/auth/user-context";
import { mobileApiError } from "@/lib/mobile/http";

export async function POST() {
  try {
    const context = await requireUserContext();
    const result = await prisma.notification.updateMany({
      where: { organizationId: context.organizationId, recipientId: context.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ success: true, count: result.count });
  } catch (error) {
    return mobileApiError(error, "标记全部通知失败");
  }
}
