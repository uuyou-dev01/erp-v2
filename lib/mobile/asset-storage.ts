import path from "node:path";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "node:crypto";
import { inspectImage } from "@/lib/assets/image-validation";

const MOBILE_ASSET_ROOT = path.resolve(
  process.env.ERP_ASSET_ROOT || path.join(process.cwd(), ".data", "assets")
);
const LEGACY_MOBILE_ASSET_ROOT = path.resolve(process.cwd(), ".data", "mobile-assets");

function resolveInside(root: string, storageKey: string) {
  const absolutePath = path.resolve(root, storageKey);
  if (!absolutePath.startsWith(`${root}${path.sep}`)) throw new Error("证据文件路径不安全");
  return absolutePath;
}

export function resolveMobileAssetPath(storageKey: string) {
  return resolveInside(MOBILE_ASSET_ROOT, storageKey);
}

function s3Config() {
  if ((process.env.MOBILE_ASSET_DRIVER || "local") !== "s3") return null;
  const bucket = process.env.MOBILE_ASSET_S3_BUCKET;
  const region = process.env.MOBILE_ASSET_S3_REGION;
  if (!bucket || !region)
    throw new Error("对象存储缺少 MOBILE_ASSET_S3_BUCKET 或 MOBILE_ASSET_S3_REGION");
  return {
    bucket,
    client: new S3Client({
      region,
      endpoint: process.env.MOBILE_ASSET_S3_ENDPOINT || undefined,
      forcePathStyle: process.env.MOBILE_ASSET_S3_FORCE_PATH_STYLE === "true",
      credentials:
        process.env.MOBILE_ASSET_S3_ACCESS_KEY_ID && process.env.MOBILE_ASSET_S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.MOBILE_ASSET_S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.MOBILE_ASSET_S3_SECRET_ACCESS_KEY,
            }
          : undefined,
    }),
  };
}

export function mobileAssetDriver() {
  return s3Config() ? "s3" : "local";
}

export async function prepareMobileAssetUpload(input: {
  assetId: string;
  storageKey: string;
  mimeType: string;
  byteSize: number;
  sha256?: string | null;
}) {
  const config = s3Config();
  if (!config) {
    return {
      uploadUrl: `/api/v1/mobile/assets/${input.assetId}/content`,
      headers: { "content-type": input.mimeType },
    };
  }
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: input.storageKey,
    ContentType: input.mimeType,
    ContentLength: input.byteSize,
    Metadata: input.sha256 ? { sha256: input.sha256 } : undefined,
  });
  return {
    uploadUrl: await getSignedUrl(config.client, command, { expiresIn: 900 }),
    headers: { "content-type": input.mimeType },
  };
}

export async function verifyMobileAssetUpload(input: {
  storageKey: string;
  mimeType: string;
  byteSize: number;
  sha256?: string | null;
}) {
  const config = s3Config();
  if (!config) return null;
  const head = await config.client.send(
    new HeadObjectCommand({ Bucket: config.bucket, Key: input.storageKey })
  );
  if (head.ContentLength !== input.byteSize) throw new Error("对象存储中的图片大小与申请时不一致");
  if (head.ContentType?.toLowerCase() !== input.mimeType)
    throw new Error("对象存储中的图片类型与申请时不一致");
  if (input.sha256 && head.Metadata?.sha256 !== input.sha256)
    throw new Error("对象存储中的图片校验值不一致");
  const response = await config.client.send(
    new GetObjectCommand({ Bucket: config.bucket, Key: input.storageKey })
  );
  if (!response.Body) throw new Error("对象存储未返回文件内容");
  const bytes = Buffer.from(await response.Body.transformToByteArray());
  if (bytes.byteLength !== input.byteSize) throw new Error("对象存储中的图片大小与申请时不一致");
  const inspected = inspectImage(bytes);
  if (inspected.mimeType !== input.mimeType) throw new Error("对象存储中的图片实际类型不一致");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (input.sha256 && sha256 !== input.sha256) throw new Error("对象存储中的图片内容校验失败");
  return { sha256 };
}

export async function readMobileAsset(storageKey: string) {
  const config = s3Config();
  if (!config) {
    try {
      return await readFile(resolveMobileAssetPath(storageKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return readFile(resolveInside(LEGACY_MOBILE_ASSET_ROOT, storageKey));
    }
  }
  const response = await config.client.send(
    new GetObjectCommand({ Bucket: config.bucket, Key: storageKey })
  );
  if (!response.Body) throw new Error("对象存储未返回文件内容");
  return Buffer.from(await response.Body.transformToByteArray());
}

export async function writeMobileAsset(input: {
  storageKey: string;
  mimeType: string;
  bytes: Buffer;
  sha256?: string | null;
}) {
  const config = s3Config();
  if (config) {
    await config.client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: input.storageKey,
        Body: input.bytes,
        ContentType: input.mimeType,
        ContentLength: input.bytes.byteLength,
        Metadata: input.sha256 ? { sha256: input.sha256 } : undefined,
      })
    );
    return;
  }
  const absolutePath = resolveMobileAssetPath(input.storageKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.bytes, { flag: "wx" });
}

export async function deleteMobileAsset(storageKey: string) {
  const config = s3Config();
  if (config) {
    await config.client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: storageKey }));
    return;
  }
  await unlink(resolveMobileAssetPath(storageKey)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  await unlink(resolveInside(LEGACY_MOBILE_ASSET_ROOT, storageKey)).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    }
  );
}
