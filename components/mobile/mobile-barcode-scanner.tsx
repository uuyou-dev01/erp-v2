"use client";

import { useEffect, useRef, useState } from "react";
import { ScanLine, X } from "lucide-react";

type BarcodeDetectorLike = new (options?: { formats?: string[] }) => {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>;
};

export function MobileBarcodeScanner({ onDetected }: { onDetected: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    let stream: MediaStream | null = null;
    let frame = 0;
    const start = async () => {
      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorLike }).BarcodeDetector;
      if (!Detector) {
        setError("当前浏览器不支持实时扫码，请使用相机拍照或手动粘贴");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (!videoRef.current || !active) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new Detector({ formats: ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "data_matrix"] });
        const scan = async () => {
          if (!active || !videoRef.current) return;
          try {
            const results = await detector.detect(videoRef.current);
            if (results[0]?.rawValue) {
              onDetected(results[0].rawValue);
              setOpen(false);
              return;
            }
          } catch {
            // A frame can fail while the camera is focusing; keep scanning.
          }
          frame = window.requestAnimationFrame(scan);
        };
        frame = window.requestAnimationFrame(scan);
      } catch {
        setError("无法打开相机，请检查浏览器相机权限");
      }
    };
    void start();
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onDetected, open]);

  return <><button type="button" aria-label="扫描物流单号" onClick={() => { setError(null); setOpen(true); }} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><ScanLine className="h-5 w-5" /></button>{open ? <div className="fixed inset-0 z-[80] mx-auto flex max-w-[520px] flex-col bg-slate-950 text-white"><header className="flex items-center justify-between px-5 pb-4 pt-[max(env(safe-area-inset-top),1rem)]"><div><p className="font-semibold">扫描物流单号</p><p className="mt-1 text-xs text-slate-400">将条码放入取景框</p></div><button type="button" onClick={() => setOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10"><X className="h-5 w-5" /></button></header><div className="relative flex-1 overflow-hidden"><video ref={videoRef} playsInline muted className="h-full w-full object-cover" /><div className="pointer-events-none absolute inset-10 rounded-3xl border-2 border-blue-400 shadow-[0_0_0_999px_rgba(2,6,23,0.45)]" />{error ? <div className="absolute inset-x-5 bottom-8 rounded-2xl bg-white p-4 text-sm leading-6 text-slate-800">{error}</div> : null}</div></div> : null}</>;
}
