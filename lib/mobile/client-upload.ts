import { ensureMobileDeviceRegistered } from "@/lib/mobile/client-device";

export interface UploadedMobileAsset {
  assetId: string;
  url: string;
}

async function sha256(file: File) {
  if (!globalThis.crypto?.subtle) return undefined;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function uploadMobileAsset(file: File): Promise<UploadedMobileAsset> {
  await ensureMobileDeviceRegistered();
  const hash = await sha256(file);
  const presign = await fetch("/api/v1/mobile/assets/presign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mimeType: file.type, byteSize: file.size, sha256: hash }),
  });
  const prepared = await presign.json() as { assetId?: string; uploadUrl?: string; headers?: Record<string, string>; error?: { message?: string } };
  if (!presign.ok || !prepared.assetId || !prepared.uploadUrl) throw new Error(prepared.error?.message || "无法准备图片上传");
  const uploaded = await fetch(prepared.uploadUrl, { method: "PUT", headers: prepared.headers ?? { "content-type": file.type }, body: file });
  if (!uploaded.ok) throw new Error("图片上传失败");
  const completed = await fetch(`/api/v1/mobile/assets/${prepared.assetId}/complete`, { method: "POST" });
  const result = await completed.json() as { asset?: { publicUrl?: string | null }; error?: { message?: string } };
  if (!completed.ok || !result.asset?.publicUrl) throw new Error(result.error?.message || "无法确认图片上传结果");
  return { assetId: prepared.assetId, url: result.asset.publicUrl };
}
