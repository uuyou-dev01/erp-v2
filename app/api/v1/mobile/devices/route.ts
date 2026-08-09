import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserContext } from "@/lib/auth/user-context";
import { mobileApiError } from "@/lib/mobile/http";

export async function GET() {
  try {
    const context = await requireUserContext();
    const devices = await prisma.companionDevice.findMany({
      where: { organizationId: context.organizationId, userId: context.userId },
      select: { id: true, name: true, clientKind: true, lastUsedAt: true, revokedAt: true, createdAt: true },
      orderBy: { lastUsedAt: "desc" },
    });
    return NextResponse.json({ devices });
  } catch (error) {
    return mobileApiError(error, "无法读取设备");
  }
}
