"use client";

import { useState, useTransition } from "react";
import { Camera, Check, Loader2, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobileBarcodeScanner } from "@/components/mobile/mobile-barcode-scanner";
import { uploadMobileAsset } from "@/lib/mobile/client-upload";
import { createClientId } from "@/lib/client-id";

type ShippingTask = { id: string; title: string; subtitle: string | null };

export function MobileContinuousShipping({ tasks }: { tasks: ShippingTask[] }) {
  const [index, setIndex] = useState(0);
  const [trackingNo, setTrackingNo] = useState("");
  const [shippingMethod, setShippingMethod] = useState("");
  const [assets, setAssets] = useState<Array<{ assetId: string; url: string }>>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const task = tasks[index];

  if (!task) return <div className="py-16 text-center"><PackageCheck className="mx-auto h-8 w-8 text-emerald-600" /><p className="mt-3 text-sm font-semibold text-slate-800">待发货任务已经处理完</p><p className="mt-1 text-xs text-slate-400">本次连续处理 {index} 项</p></div>;

  const resetForNext = () => { setTrackingNo(""); setShippingMethod(""); setAssets([]); setConfirmed(false); setMessage(null); setIndex((current) => current + 1); };
  const submit = () => startTransition(async () => {
    setMessage(null);
    try {
      const detailResponse = await fetch(`/api/v1/mobile/tasks/${encodeURIComponent(task.id)}`);
      const detail = await detailResponse.json() as { expectedVersion?: string; error?: { message?: string } };
      if (!detailResponse.ok || !detail.expectedVersion) throw new Error(detail.error?.message || "任务已变化，请刷新");
      const response = await fetch(`/api/v1/mobile/tasks/${encodeURIComponent(task.id)}/actions/shipOrder`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": createClientId() },
        body: JSON.stringify({ expectedVersion: detail.expectedVersion, fields: { trackingNo, shippingMethod, imageUrls: assets.map((asset) => asset.url), assetIds: assets.map((asset) => asset.assetId) }, confirmation: { acceptedImpact: true } }),
      });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message || "确认发货失败");
      resetForNext();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "确认发货失败");
    }
  });

  return <div className="space-y-5"><div className="flex items-center justify-between text-xs text-slate-400"><span>连续发货</span><span>{index + 1} / {tasks.length}</span></div><div className="border-y border-slate-200 py-5"><p className="text-lg font-semibold leading-6 text-slate-950">{task.title}</p>{task.subtitle ? <p className="mt-2 text-sm text-slate-500">{task.subtitle}</p> : null}</div><div><label className="mb-1.5 block text-xs font-semibold text-slate-600">运单号 *</label><div className="flex gap-2"><Input className="h-12 rounded-xl" value={trackingNo} onChange={(event) => setTrackingNo(event.target.value)} placeholder="扫描或粘贴单号" /><MobileBarcodeScanner onDetected={setTrackingNo} /></div></div><div><label htmlFor="continuous-shipping-method" className="mb-1.5 block text-xs font-semibold text-slate-600">发货方式</label><Input id="continuous-shipping-method" className="h-11 rounded-xl" value={shippingMethod} onChange={(event) => setShippingMethod(event.target.value)} placeholder="例如：顺丰" /></div><label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-center"><Camera className="h-5 w-5 text-slate-400" /><span className="mt-2 text-sm font-medium text-slate-700">发货凭证 *</span><span className="mt-1 text-[11px] text-slate-400">已上传 {assets.length} 张</span><input type="file" accept="image/*" capture="environment" className="sr-only" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const uploaded = await uploadMobileAsset(file); setAssets((current) => [...current, uploaded]); } catch (error) { setMessage(error instanceof Error ? error.message : "上传失败"); } finally { event.target.value = ""; } }} /></label><label className="flex items-start gap-3 rounded-xl bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-900"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4" /><span>我已核对商品、收件信息和发货凭证，确认执行库存扣减与发货。</span></label>{message ? <div role="alert" className="rounded-xl bg-rose-50 px-3 py-3 text-sm text-rose-800">{message}</div> : null}<Button className="h-12 w-full rounded-xl bg-blue-600" disabled={pending || !trackingNo.trim() || !assets.length || !confirmed} onClick={submit}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}确认并处理下一件</Button></div>;
}
