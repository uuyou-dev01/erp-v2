import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserContext } from "@/lib/auth/user-context";
import { mobileApiError } from "@/lib/mobile/http";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [context, { id }] = await Promise.all([requireUserContext(), params]);
    const result = await prisma.productIntelligenceCapture.updateMany({
      where: { id, organizationId: context.organizationId, storeId: context.activeStoreId, status: { in: ["FAILED", "RECEIVED", "PROCESSING"] } },
      data: { status: "NEEDS_REVIEW", errorMessage: null },
    });
    if (!result.count) throw new Error("当前采集状态不允许重试");
    return NextResponse.json({ success: true, status: "NEEDS_REVIEW" });
  } catch (error) {
    return mobileApiError(error, "重试采集失败");
  }
}
