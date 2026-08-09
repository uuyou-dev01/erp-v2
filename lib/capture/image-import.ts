import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { deleteMobileAsset, writeMobileAsset } from "@/lib/mobile/asset-storage";
import { assertPublicWebUrl } from "@/lib/capture/web-link-reader";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const MAX_IMAGES = 12;

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export function detectImageMime(bytes: Buffer) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "image/png";
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii")))
    return "image/gif";
  if (
    bytes.length >= 12 &&
    bytes.subarray(4, 8).toString("ascii") === "ftyp" &&
    /^(?:avif|avis)$/.test(bytes.subarray(8, 12).toString("ascii"))
  )
    return "image/avif";
  return null;
}

async function readLimitedImage(response: Response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES)
    throw new Error("来源图片超过 8MB");
  if (!response.body) throw new Error("来源图片没有返回内容");
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let byteSize = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteSize += value.byteLength;
    if (byteSize > MAX_IMAGE_BYTES) {
      await reader.cancel();
      throw new Error("来源图片超过 8MB");
    }
    chunks.push(Buffer.from(value));
  }
  if (!byteSize) throw new Error("来源图片为空");
  return Buffer.concat(chunks, byteSize);
}

async function downloadImage(rawUrl: string, referer?: string | null) {
  let current = (await assertPublicWebUrl(rawUrl)).toString();
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertPublicWebUrl(current);
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: {
        accept: "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.8,*/*;q=0.2",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36 ERP-Image-Capture/1.0",
        ...(referer ? { referer } : {}),
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("来源图片返回了无效跳转");
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok) throw new Error(`来源图片返回 ${response.status}`);
    const declaredMime =
      response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() || "";
    if (declaredMime && !declaredMime.startsWith("image/"))
      throw new Error("来源地址返回的不是图片");
    const bytes = await readLimitedImage(response);
    const mimeType = detectImageMime(bytes);
    if (!mimeType || !EXTENSION_BY_MIME[mimeType]) throw new Error("来源图片格式不受支持");
    return { bytes, mimeType, finalUrl: current };
  }
  throw new Error("来源图片跳转次数过多");
}

export interface ImportedCaptureImages {
  assetIds: string[];
  publicUrls: string[];
  failures: Array<{ sourceUrl: string; reason: string }>;
}

export async function importRemoteCaptureImages(input: {
  organizationId: string;
  storeId: string;
  userId: string;
  captureId: string;
  sourcePageUrl?: string | null;
  imageUrls: string[];
}): Promise<ImportedCaptureImages> {
  const urls = [...new Set(input.imageUrls.map((url) => url.trim()).filter(Boolean))].slice(
    0,
    MAX_IMAGES
  );
  const imported: ImportedCaptureImages = { assetIds: [], publicUrls: [], failures: [] };

  for (const sourceUrl of urls) {
    let assetId: string | null = null;
    let storageKey: string | null = null;
    try {
      const { bytes, mimeType } = await downloadImage(sourceUrl, input.sourcePageUrl);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const existing = await prisma.mobileAsset.findFirst({
        where: {
          captureId: input.captureId,
          organizationId: input.organizationId,
          storeId: input.storeId,
          sha256,
          status: "READY",
        },
        select: { id: true, publicUrl: true },
      });
      if (existing?.publicUrl) {
        imported.assetIds.push(existing.id);
        imported.publicUrls.push(existing.publicUrl);
        continue;
      }

      storageKey = `capture/${input.organizationId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${EXTENSION_BY_MIME[mimeType]}`;
      const asset = await prisma.mobileAsset.create({
        data: {
          organizationId: input.organizationId,
          storeId: input.storeId,
          userId: input.userId,
          captureId: input.captureId,
          storageKey,
          mimeType,
          byteSize: bytes.byteLength,
          sha256,
        },
      });
      assetId = asset.id;
      await writeMobileAsset({ storageKey, mimeType, bytes, sha256 });
      const publicUrl = `/api/v1/mobile/assets/${asset.id}/content`;
      await prisma.mobileAsset.update({
        where: { id: asset.id },
        data: { status: "READY", publicUrl, completedAt: new Date() },
      });
      imported.assetIds.push(asset.id);
      imported.publicUrls.push(publicUrl);
    } catch (error) {
      if (storageKey) await deleteMobileAsset(storageKey).catch(() => undefined);
      if (assetId)
        await prisma.mobileAsset
          .deleteMany({ where: { id: assetId, status: "PENDING" } })
          .catch(() => undefined);
      imported.failures.push({
        sourceUrl,
        reason: error instanceof Error ? error.message : "图片保存失败",
      });
    }
  }

  return imported;
}
