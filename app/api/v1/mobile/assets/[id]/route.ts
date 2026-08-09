import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserContext } from "@/lib/auth/user-context";
import { mobileApiError } from "@/lib/mobile/http";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [context, { id }] = await Promise.all([requireUserContext(), params]);
    const result = await prisma.mobileAsset.updateMany({
      where: {
        id,
        organizationId: context.organizationId,
        userId: context.userId,
        captureId: null,
        itemUnitId: null,
        status: { in: ["PENDING", "READY"] },
      },
      data: { status: "ABORTED", abortedAt: new Date() },
    });
    if (!result.count) throw new Error("文件不存在、已使用或无权操作");
    return NextResponse.json({ success: true });
  } catch (error) {
    return mobileApiError(error, "取消上传失败");
  }
}
