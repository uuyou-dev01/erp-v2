import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveCompanionDevice } from "@/lib/mobile/device-auth";
import { requireUserContext } from "@/lib/auth/user-context";
import { mobileApiError } from "@/lib/mobile/http";
import { mobileAssetDriver, readMobileAsset, resolveMobileAssetPath } from "@/lib/mobile/asset-storage";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [context, { id }] = await Promise.all([requireUserContext(), params]);
    const asset = await prisma.mobileAsset.findFirst({
      where: {
        id,
        organizationId: context.organizationId,
        storeId: { in: context.storeIds },
        status: "READY",
      },
    });
    if (!asset) throw new Error("证据文件不存在或无权访问");
    const bytes = await readMobileAsset(asset.storageKey);
    return new NextResponse(bytes, {
      headers: {
        "content-type": asset.mimeType,
        "content-length": String(bytes.byteLength),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return mobileApiError(error, "无法读取证据文件");
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ context }, { id }] = await Promise.all([requireActiveCompanionDevice(), params]);
    const asset = await prisma.mobileAsset.findFirst({
      where: { id, organizationId: context.organizationId, storeId: context.activeStoreId, userId: context.userId, status: "PENDING" },
    });
    if (!asset) throw new Error("上传凭证不存在、已完成或无权访问");
    if (mobileAssetDriver() !== "local") throw new Error("对象存储上传必须使用申请得到的签名地址");
    const contentType = request.headers.get("content-type")?.toLowerCase();
    if (contentType !== asset.mimeType) throw new Error("图片类型与申请时不一致");
    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.byteLength !== asset.byteSize) throw new Error("图片大小与申请时不一致");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (asset.sha256 && asset.sha256 !== sha256) throw new Error("图片校验失败，请重新上传");
    const absolutePath = resolveMobileAssetPath(asset.storageKey);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, bytes, { flag: "wx" });
    const publicUrl = `/api/v1/mobile/assets/${asset.id}/content`;
    await prisma.mobileAsset.update({
      where: { id: asset.id },
      data: { status: "READY", publicUrl, sha256, completedAt: new Date() },
    });
    return NextResponse.json({ success: true, assetId: asset.id, url: publicUrl });
  } catch (error) {
    return mobileApiError(error, "证据上传失败");
  }
}
