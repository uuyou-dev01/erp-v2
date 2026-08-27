import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserContext } from "@/lib/auth/user-context";
import { mobileApiError } from "@/lib/mobile/http";
import { verifyMobileAssetUpload } from "@/lib/mobile/asset-storage";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [context, { id }] = await Promise.all([requireUserContext(), params]);
    const asset = await prisma.mobileAsset.findFirst({
      where: { id, organizationId: context.organizationId, userId: context.userId, status: { in: ["PENDING", "READY"] } },
      select: { id: true, publicUrl: true, storageKey: true, status: true, mimeType: true, byteSize: true, sha256: true },
    });
    if (!asset) throw new Error("文件尚未上传完成或无权访问");
    if (asset.status === "PENDING") {
      const verified = await verifyMobileAssetUpload(asset);
      const publicUrl = `/api/v1/mobile/assets/${asset.id}/content`;
      await prisma.mobileAsset.update({
        where: { id: asset.id },
        data: {
          status: "READY",
          publicUrl,
          completedAt: new Date(),
          ...(verified?.sha256 ? { sha256: verified.sha256 } : {}),
        },
      });
      return NextResponse.json({ success: true, asset: { ...asset, status: "READY", publicUrl } });
    }
    return NextResponse.json({ success: true, asset });
  } catch (error) {
    return mobileApiError(error, "无法确认上传结果");
  }
}
