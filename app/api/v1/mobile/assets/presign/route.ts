import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { mobileApiError } from "@/lib/mobile/http";
import { requireActiveCompanionDevice } from "@/lib/mobile/device-auth";
import { prepareMobileAssetUpload } from "@/lib/mobile/asset-storage";
import { assertMobileRateLimit } from "@/lib/mobile/rate-limit";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const [{ context, device }, body] = await Promise.all([
      requireActiveCompanionDevice(),
      request.json() as Promise<{ mimeType?: string; byteSize?: number; sha256?: string }>,
    ]);
    await assertMobileRateLimit({ organizationId: context.organizationId, subjectId: device.id, key: "asset-presign", limit: 30 });
    const mimeType = body.mimeType?.toLowerCase() || "";
    const byteSize = Number(body.byteSize);
    if (!ALLOWED_MIME.has(mimeType)) throw new Error("仅支持 JPEG、PNG 或 WebP 图片");
    if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > MAX_BYTES) throw new Error("图片大小必须在 8MB 以内");
    const extension = mimeType.split("/")[1].replace("jpeg", "jpg");
    const storageKey = `mobile/${context.organizationId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;
    const asset = await prisma.mobileAsset.create({
      data: {
        organizationId: context.organizationId,
        storeId: context.activeStoreId,
        userId: context.userId,
        storageKey,
        mimeType,
        byteSize,
        sha256: body.sha256?.trim().toLowerCase() || null,
        purpose: "MOBILE_EVIDENCE",
        visibility: "ORGANIZATION_PRIVATE",
      },
    });
    const upload = await prepareMobileAssetUpload({ assetId: asset.id, storageKey, mimeType, byteSize, sha256: asset.sha256 });
    return NextResponse.json({
      assetId: asset.id,
      uploadUrl: upload.uploadUrl,
      method: "PUT",
      headers: upload.headers,
      expiresIn: 900,
    });
  } catch (error) {
    return mobileApiError(error, "无法准备证据上传");
  }
}
