import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { inspectImage } from "@/lib/assets/image-validation";

const ASSET_ROOT = path.resolve(process.env.ERP_ASSET_ROOT || path.join(process.cwd(), ".data", "assets"));

function absoluteAssetPath(storageKey: string) {
  const target = path.resolve(ASSET_ROOT, storageKey);
  if (!target.startsWith(`${ASSET_ROOT}${path.sep}`)) throw new Error("资产存储路径不安全");
  return target;
}

function safeOriginalName(value: string) {
  return path.basename(value).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255) || null;
}

export async function storeUploadedImage(input: {
  bytes: Buffer;
  declaredMimeType?: string | null;
  originalName: string;
  organizationId: string;
  storeId: string;
  userId: string;
  purpose: "CATALOG_IMAGE" | "BUSINESS_EVIDENCE" | "INTELLIGENCE_IMAGE";
  visibility: "CATALOG_PUBLIC" | "ORGANIZATION_PRIVATE";
  refType?: string | null;
  refId?: string | null;
}) {
  const image = inspectImage(input.bytes);
  if (input.declaredMimeType && input.declaredMimeType.toLowerCase() !== image.mimeType) {
    throw new Error("图片声明类型与实际内容不一致");
  }
  if (input.visibility === "CATALOG_PUBLIC" && input.purpose !== "CATALOG_IMAGE") {
    throw new Error("只有商品目录图片可以设为公开");
  }

  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const storageKey = `${input.organizationId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${image.extension}`;
  const absolutePath = absoluteAssetPath(storageKey);
  const asset = await prisma.mobileAsset.create({
    data: {
      organizationId: input.organizationId,
      storeId: input.storeId,
      userId: input.userId,
      storageKey,
      mimeType: image.mimeType,
      byteSize: input.bytes.byteLength,
      sha256,
      purpose: input.purpose,
      visibility: input.visibility,
      originalName: safeOriginalName(input.originalName),
      refType: input.refType || null,
      refId: input.refId || null,
    },
    select: { id: true },
  });

  try {
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.bytes, { flag: "wx", mode: 0o600 });
    const publicUrl = `/api/assets/${asset.id}/content`;
    await prisma.mobileAsset.update({
      where: { id: asset.id },
      data: { status: "READY", completedAt: new Date(), publicUrl },
    });
    return { id: asset.id, url: publicUrl, sha256, mimeType: image.mimeType };
  } catch (error) {
    await unlink(absolutePath).catch(() => undefined);
    await prisma.mobileAsset.deleteMany({ where: { id: asset.id, status: "PENDING" } }).catch(() => undefined);
    throw error;
  }
}

export { absoluteAssetPath };
