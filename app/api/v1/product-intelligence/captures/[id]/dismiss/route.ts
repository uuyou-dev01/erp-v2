import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserContext } from "@/lib/auth/user-context";
import { mobileApiError } from "@/lib/mobile/http";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [context, { id }] = await Promise.all([requireUserContext(), params]);
    const result = await prisma.productIntelligenceCapture.updateMany({
      where: { id, organizationId: context.organizationId, storeId: context.activeStoreId, status: { not: "IMPORTED" } },
      data: { status: "DISMISSED", dismissedAt: new Date() },
    });
    if (!result.count) throw new Error("采集记录不存在、无权访问或已经导入");
    return NextResponse.json({ success: true });
  } catch (error) {
    return mobileApiError(error, "忽略采集失败");
  }
}
