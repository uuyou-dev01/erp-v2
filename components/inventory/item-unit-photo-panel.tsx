"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Camera, Check, Copy, ImagePlus, Smartphone, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/ui/product-image";

interface ItemUnitPhotoPanelProps {
  itemUnitId: string;
  itemName: string;
  photos: string[];
}

export function ItemUnitPhotoPanel({ itemUnitId, itemName, photos }: ItemUnitPhotoPanelProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [mobileUrl, setMobileUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [synced, setSynced] = useState(false);
  const signature = useMemo(() => photos.join("|"), [photos]);
  const [knownSignature, setKnownSignature] = useState(signature);

  useEffect(() => {
    setMounted(true);
    setMobileUrl(`${window.location.origin}/m/items/${itemUnitId}/photos`);
  }, [itemUnitId]);

  useEffect(() => setKnownSignature(signature), [signature]);

  useEffect(() => {
    if (!handoffOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHandoffOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [handoffOpen]);

  useEffect(() => {
    if (!handoffOpen) return;
    let stopped = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/v1/mobile/item-units/${itemUnitId}/photos`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { item?: { photos?: string[] } };
        const nextSignature = (payload.item?.photos ?? []).join("|");
        if (!stopped && nextSignature && nextSignature !== knownSignature) {
          setKnownSignature(nextSignature);
          setSynced(true);
          router.refresh();
        }
      } catch {
        // Polling is only a convenience; the mobile upload remains authoritative.
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [handoffOpen, itemUnitId, knownSignature, router]);

  const copyLink = async () => {
    if (!mobileUrl) return;
    await navigator.clipboard.writeText(mobileUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const coverUrl = photos[0] ?? null;

  return (
    <>
      <div className="flex shrink-0 flex-col gap-2">
        <a
          href={coverUrl ?? undefined}
          target={coverUrl ? "_blank" : undefined}
          rel={coverUrl ? "noreferrer" : undefined}
          aria-label={coverUrl ? "查看单件主图" : "单件暂无照片"}
          onClick={(event) => {
            if (!coverUrl) event.preventDefault();
          }}
          className="relative block"
        >
          <ProductImage
            src={coverUrl}
            alt={itemName}
            size="lg"
            className="h-24 w-24 rounded-xl bg-muted/50 shadow-sm"
          />
          {photos.length > 1 ? (
            <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white">
              +{photos.length - 1}
            </span>
          ) : null}
        </a>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-24 px-2 text-xs"
          onClick={() => {
            setSynced(false);
            setHandoffOpen(true);
          }}
        >
          <Smartphone className="mr-1.5 h-3.5 w-3.5" />
          手机拍照
        </Button>
      </div>

      {mounted && handoffOpen
        ? createPortal(
            <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-black/45"
                aria-label="关闭手机拍照"
                onClick={() => setHandoffOpen(false)}
              />
              <div className="relative z-10 w-full max-w-sm rounded-2xl border bg-background p-5 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">手机接力</p>
                    <h2 className="mt-1 text-lg font-semibold">扫描后拍摄实物照片</h2>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label="关闭"
                    onClick={() => setHandoffOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="mt-5 flex justify-center rounded-xl bg-white p-4">
                  {mobileUrl ? (
                    <QRCodeSVG value={mobileUrl} size={188} level="M" marginSize={1} />
                  ) : (
                    <div className="h-[188px] w-[188px] animate-pulse rounded-lg bg-muted" />
                  )}
                </div>

                <div className="mt-4 flex items-start gap-3 rounded-xl bg-muted/40 px-3 py-3">
                  {synced ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <Camera className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <p className="text-xs leading-5 text-muted-foreground">
                    {synced
                      ? "已收到手机上传，单件详情正在刷新。"
                      : "手机需登录同一 ERP 账号。拍照保存后，这里会自动刷新。"}
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" onClick={() => void copyLink()}>
                    {copied ? (
                      <Check className="mr-2 h-4 w-4" />
                    ) : (
                      <Copy className="mr-2 h-4 w-4" />
                    )}
                    {copied ? "已复制" : "复制链接"}
                  </Button>
                  <a href={`/m/items/${itemUnitId}/photos`}>
                    <Button type="button" className="w-full">
                      <ImagePlus className="mr-2 h-4 w-4" />
                      本机打开
                    </Button>
                  </a>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
