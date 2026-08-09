"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/ui/product-image";
import { uploadMobileAsset, type UploadedMobileAsset } from "@/lib/mobile/client-upload";

interface MobileItemPhotoCaptureProps {
  itemUnitId: string;
  itemName: string;
  initialPhotos: string[];
  maxPhotos: number;
}

export function MobileItemPhotoCapture({
  itemUnitId,
  itemName,
  initialPhotos,
  maxPhotos,
}: MobileItemPhotoCaptureProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const attach = async (assets: UploadedMobileAsset[]) => {
    const response = await fetch(`/api/v1/mobile/item-units/${itemUnitId}/photos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assetIds: assets.map((asset) => asset.assetId) }),
    });
    const payload = (await response.json()) as {
      photos?: string[];
      addedCount?: number;
      error?: { message?: string };
    };
    if (!response.ok || !payload.photos) {
      throw new Error(payload.error?.message || "照片保存失败");
    }
    return payload;
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const remaining = maxPhotos - photos.length;
    const selected = Array.from(files).slice(0, Math.min(8, remaining));
    if (selected.length === 0) {
      setMessage({ tone: "error", text: `这个单件已经有 ${maxPhotos} 张照片` });
      return;
    }

    setUploading(true);
    setMessage(null);
    const uploaded: UploadedMobileAsset[] = [];
    try {
      for (const file of selected) uploaded.push(await uploadMobileAsset(file));
      const payload = await attach(uploaded);
      setPhotos(payload.photos ?? photos);
      setMessage({
        tone: "success",
        text: `已同步 ${payload.addedCount ?? uploaded.length} 张照片到单件档案`,
      });
      router.refresh();
    } catch (error) {
      await Promise.allSettled(
        uploaded.map((asset) =>
          fetch(`/api/v1/mobile/assets/${asset.assetId}`, { method: "DELETE" })
        )
      );
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "照片上传失败",
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-5">
      <button
        type="button"
        disabled={uploading || photos.length >= maxPhotos}
        onClick={() => inputRef.current?.click()}
        className="flex min-h-40 w-full flex-col items-center justify-center rounded-3xl border border-dashed border-blue-300 bg-blue-50 px-6 text-center transition active:scale-[0.99] disabled:opacity-60"
      >
        {uploading ? (
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
            <Camera className="h-7 w-7" />
          </span>
        )}
        <span className="mt-4 text-base font-semibold text-blue-950">
          {uploading ? "正在同步照片…" : "拍摄这件商品"}
        </span>
        <span className="mt-1 text-xs text-blue-700/70">支持连续拍摄，单张不超过 8MB</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        disabled={uploading}
        className="sr-only"
        aria-label={`为${itemName}拍照`}
        onChange={(event) => void upload(event.target.files)}
      />

      {message ? (
        <div
          role={message.tone === "error" ? "alert" : "status"}
          className={
            message.tone === "error"
              ? "rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800"
              : "flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          }
        >
          {message.tone === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : null}
          {message.text}
        </div>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ImagePlus className="h-4 w-4 text-slate-400" />
            已有照片
          </h2>
          <span className="text-xs text-slate-400">
            {photos.length} / {maxPhotos}
          </span>
        </div>
        {photos.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((photo, index) => (
              <a
                key={`${photo}-${index}`}
                href={photo}
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                <ProductImage
                  src={photo}
                  alt={`${itemName} 照片 ${index + 1}`}
                  size="lg"
                  className="aspect-square h-auto w-full rounded-xl"
                />
              </a>
            ))}
          </div>
        ) : (
          <p className="border-y border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
            还没有实物照片
          </p>
        )}
      </section>

      <Button
        type="button"
        variant="outline"
        className="h-11 w-full rounded-xl"
        disabled={uploading || photos.length >= maxPhotos}
        onClick={() => inputRef.current?.click()}
      >
        <ImagePlus className="mr-2 h-4 w-4" />
        继续添加照片
      </Button>
    </div>
  );
}
