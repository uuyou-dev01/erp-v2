"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Loader2, PackageCheck, Send, Truck } from "lucide-react";
import { executeMobileTaskActionResult } from "@/app/actions/mobile";
import type { getMobileTask } from "@/lib/mobile/tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { uploadMobileAsset } from "@/lib/mobile/client-upload";
import { ensureMobileDeviceRegistered } from "@/lib/mobile/client-device";
import { MobileBarcodeScanner } from "@/components/mobile/mobile-barcode-scanner";

type MobileTaskData = NonNullable<Awaited<ReturnType<typeof getMobileTask>>>;

function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs font-semibold text-slate-600">{children}</label>;
}

export function MobileActionForm({ task }: { task: MobileTaskData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [acceptedImpact, setAcceptedImpact] = useState(false);
  const [fields, setFields] = useState<Record<string, string | boolean | string[]>>({
    arrivedAt: new Date().toISOString().slice(0, 10),
    isComplete: true,
    purchaseTrackingNo:
      task.detail.actionContext.purchaseTrackingNo ?? task.detail.actionContext.trackingNo ?? "",
    destinationLocationId: "",
    arrivalLocationId: "",
    locationId: "",
    mode: "inbound",
    trackingNo: task.detail.actionContext.trackingNo ?? "",
    carrier: "",
    shippingMethod: "",
    shipper: "",
    pickupCode: "",
    proofNote: "",
    imageUrls: [],
    assetIds: [],
    note: "",
    returnTrackingNo: "",
    restockMode: "RETURN_CHECK",
    refundAmount: "",
    platformFeeReversal: "",
    shippingFeeReversal: "",
  });
  const idempotencyKey = useMemo(newIdempotencyKey, []);
  const action = task.summary.primaryAction;

  const update = (name: string, value: string | boolean | string[]) => {
    setMessage(null);
    setFields((current) => ({ ...current, [name]: value }));
  };

  const submit = () => {
    if (task.policy.requiresSecondConfirm && !acceptedImpact) {
      setMessage({ tone: "error", text: "请先确认已经核对业务影响" });
      return;
    }
    if (task.policy.requiredEvidence?.includes("PHOTO") && !((fields.imageUrls as string[]) || []).length) {
      setMessage({ tone: "error", text: "该节点需要至少一张凭证照片" });
      return;
    }
    startTransition(async () => {
      try {
        await ensureMobileDeviceRegistered();
      } catch (error) {
        setMessage({ tone: "error", text: error instanceof Error ? error.message : "设备绑定失败" });
        return;
      }
      const result = await executeMobileTaskActionResult({
        taskId: task.summary.id,
        action,
        expectedVersion: task.expectedVersion,
        idempotencyKey,
        fields,
        confirmation: { acceptedImpact },
      });
      if (!result.success) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setMessage({ tone: "success", text: `${task.summary.primaryActionLabel}已完成` });
      router.refresh();
      window.setTimeout(() => router.push("/m"), 700);
    });
  };

  const uploadImages = async (files: FileList | null) => {
    if (!files?.length) return;
    const urls: string[] = [];
    const assetIds: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const payload = await uploadMobileAsset(file);
        urls.push(payload.url);
        assetIds.push(payload.assetId);
      } catch (error) {
        setMessage({ tone: "error", text: error instanceof Error ? error.message : "凭证上传失败" });
        return;
      }
    }
    setFields((current) => ({
      ...current,
      imageUrls: [...((current.imageUrls as string[]) || []), ...urls],
      assetIds: [...((current.assetIds as string[]) || []), ...assetIds],
    }));
  };

  if (!task.summary.mobileEnabled) {
    return (
      <div className="border-t border-slate-100 py-6 text-sm text-slate-500">
        该节点涉及复杂配置或高风险操作，请在 PC ERP 中处理。
      </div>
    );
  }

  return (
    <form
      className="space-y-5 pb-28"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {(action === "fillLogistics") && (
        <>
          <div>
            <FieldLabel>采购物流单号 *</FieldLabel>
            <div className="flex gap-2"><Input value={String(fields.purchaseTrackingNo || "")} onChange={(event) => update("purchaseTrackingNo", event.target.value)} placeholder="扫描或粘贴单号" required className="h-12 rounded-xl text-base" /><MobileBarcodeScanner onDetected={(value) => update("purchaseTrackingNo", value)} /></div>
          </div>
          <div>
            <FieldLabel>预计到货位置 *</FieldLabel>
            <Select
              value={String(fields.destinationLocationId || "")}
              onChange={(event) => update("destinationLocationId", event.target.value)}
              className="h-12 rounded-xl"
              required
            >
              <option value="">选择仓库或集运点</option>
              {task.locations.map((location) => (
                <option key={location.id} value={location.id}>{location.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel>承运商</FieldLabel>
            <Input value={String(fields.carrier || "")} onChange={(event) => update("carrier", event.target.value)} className="h-12 rounded-xl" />
          </div>
        </>
      )}

      {(action === "confirmArrival" || action === "receivePurchase") && (
        <>
          <div>
            <FieldLabel>到货位置 *</FieldLabel>
            <Select
              value={String(fields.arrivalLocationId || "")}
              onChange={(event) => update("arrivalLocationId", event.target.value)}
              className="h-12 rounded-xl"
              required
            >
              <option value="">选择实际到货位置</option>
              {task.locations.map((location) => (
                <option key={location.id} value={location.id}>{location.name}</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>到货日期</FieldLabel>
              <Input type="date" value={String(fields.arrivedAt)} onChange={(event) => update("arrivedAt", event.target.value)} className="h-12 rounded-xl" />
            </div>
            <label className="flex h-[72px] items-end pb-1">
              <span className="flex h-12 w-full items-center gap-2 rounded-xl bg-slate-100 px-3 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={Boolean(fields.isComplete)} onChange={(event) => update("isComplete", event.target.checked)} />
                完整到货
              </span>
            </label>
          </div>
          {!fields.isComplete ? <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-amber-300 bg-amber-50 text-center"><Camera className="h-5 w-5 text-amber-600" /><span className="mt-2 text-sm font-medium text-amber-900">上传部分/异常到货照片 *</span><span className="mt-1 text-[11px] text-amber-700">已上传 {((fields.imageUrls as string[]) || []).length} 张</span><input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(event) => uploadImages(event.target.files)} /></label> : null}
        </>
      )}

      {(action === "inbound" || action === "disposition") && (
        <>
          {action === "disposition" ? (
            <div>
              <FieldLabel>下一步</FieldLabel>
              <div className="grid grid-cols-3 gap-2">
                {[["inbound", "入库"], ["consolidate", "集运"], ["transfer", "转发"]].map(([value, label]) => (
                  <button key={value} type="button" onClick={() => update("mode", value)} className={`h-11 rounded-xl text-sm font-semibold ${fields.mode === value ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {fields.mode === "inbound" || action === "inbound" ? (
            <div>
              <FieldLabel>入库位置 *</FieldLabel>
              <Select value={String(fields.locationId || "")} onChange={(event) => update("locationId", event.target.value)} className="h-12 rounded-xl" required>
                <option value="">选择入库位置</option>
                {task.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </Select>
            </div>
          ) : fields.mode === "transfer" ? (
            <div>
              <FieldLabel>目标位置 *</FieldLabel>
              <Select value={String(fields.toLocationId || "")} onChange={(event) => update("toLocationId", event.target.value)} className="h-12 rounded-xl" required>
                <option value="">选择目标位置</option>
                {task.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </Select>
            </div>
          ) : (
            <p className="rounded-xl bg-amber-50 px-3 py-3 text-xs text-amber-800">请选择已有集运批次；完整批次管理暂在 PC 完成。</p>
          )}
        </>
      )}

      {action === "shipOrder" && (
        <>
          <div>
            <FieldLabel>运单号</FieldLabel>
            <div className="flex gap-2"><Input value={String(fields.trackingNo || "")} onChange={(event) => update("trackingNo", event.target.value)} placeholder="扫描或粘贴单号" className="h-12 rounded-xl text-base" /><MobileBarcodeScanner onDetected={(value) => update("trackingNo", value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>发货方式</FieldLabel>
              <Input value={String(fields.shippingMethod || "")} onChange={(event) => update("shippingMethod", event.target.value)} className="h-12 rounded-xl" />
            </div>
            <div>
              <FieldLabel>取件码</FieldLabel>
              <Input value={String(fields.pickupCode || "")} onChange={(event) => update("pickupCode", event.target.value)} className="h-12 rounded-xl" />
            </div>
          </div>
          <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-center">
            <Camera className="h-5 w-5 text-slate-400" />
            <span className="mt-2 text-sm font-medium text-slate-600">拍摄或选择发货凭证</span>
            <span className="mt-1 text-[11px] text-slate-400">已上传 {((fields.imageUrls as string[]) || []).length} 张</span>
            <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(event) => uploadImages(event.target.files)} />
          </label>
        </>
      )}

      {(action === "confirmDelivery" || action === "confirmOrder") && (
        <div className="rounded-2xl bg-blue-50 p-4 text-sm leading-6 text-blue-900">
          请核对上方商品和当前状态。提交后将进入下一业务节点。
        </div>
      )}

      {action === "registerReturn" && (
        <>
          <div><FieldLabel>退货物流单号</FieldLabel><div className="flex gap-2"><Input className="h-12 rounded-xl" value={String(fields.returnTrackingNo || "")} onChange={(event) => update("returnTrackingNo", event.target.value)} /><MobileBarcodeScanner onDetected={(value) => update("returnTrackingNo", value)} /></div></div>
          <div><FieldLabel>库存处理</FieldLabel><Select className="h-12 rounded-xl" value={String(fields.restockMode || "RETURN_CHECK")} onChange={(event) => update("restockMode", event.target.value)}><option value="RETURN_CHECK">退回后检查</option><option value="AVAILABLE">直接恢复可售</option></Select></div>
          <div className="grid grid-cols-3 gap-2"><div><FieldLabel>退款金额</FieldLabel><Input inputMode="decimal" className="h-11 rounded-xl" value={String(fields.refundAmount || "")} onChange={(event) => update("refundAmount", event.target.value)} /></div><div><FieldLabel>平台费冲回</FieldLabel><Input inputMode="decimal" className="h-11 rounded-xl" value={String(fields.platformFeeReversal || "")} onChange={(event) => update("platformFeeReversal", event.target.value)} /></div><div><FieldLabel>运费冲回</FieldLabel><Input inputMode="decimal" className="h-11 rounded-xl" value={String(fields.shippingFeeReversal || "")} onChange={(event) => update("shippingFeeReversal", event.target.value)} /></div></div>
          <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-center"><Camera className="h-5 w-5 text-slate-400" /><span className="mt-2 text-sm font-medium text-slate-600">上传退货凭证 *</span><span className="mt-1 text-[11px] text-slate-400">已上传 {((fields.imageUrls as string[]) || []).length} 张</span><input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(event) => uploadImages(event.target.files)} /></label>
        </>
      )}

      {action === "approveReturnInspection" && (
        <>
          <div className="rounded-2xl bg-blue-50 p-4 text-sm leading-6 text-blue-900">请核对退回商品的实物与库存身份。确认后商品将按现有退货规则恢复状态。</div>
          <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-center">
            <Camera className="h-5 w-5 text-slate-400" />
            <span className="mt-2 text-sm font-medium text-slate-600">上传退货检查凭证 *</span>
            <span className="mt-1 text-[11px] text-slate-400">已上传 {((fields.imageUrls as string[]) || []).length} 张</span>
            <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(event) => uploadImages(event.target.files)} />
          </label>
        </>
      )}

      <div>
        <FieldLabel>备注</FieldLabel>
        <Textarea value={String(fields.note || fields.proofNote || "")} onChange={(event) => update(action === "shipOrder" ? "proofNote" : "note", event.target.value)} className="min-h-20 rounded-xl" placeholder="可选" />
      </div>

      {task.policy.requiresSecondConfirm ? <label className="flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-950"><input type="checkbox" className="mt-1" checked={acceptedImpact} onChange={(event) => setAcceptedImpact(event.target.checked)} /><span>我已核对商品、数量和当前状态，确认执行此业务节点。</span></label> : null}

      {message ? (
        <div className={`flex items-start gap-2 rounded-xl px-3 py-3 text-sm ${message.tone === "success" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`} role="alert">
          {message.tone === "success" ? <Check className="mt-0.5 h-4 w-4" /> : null}
          {message.text}
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-[72px] z-30 mx-auto max-w-[520px] border-t border-slate-100 bg-white/95 p-3 backdrop-blur-xl">
        <Button type="submit" disabled={pending} className="h-12 w-full rounded-xl bg-blue-600 text-[15px] font-semibold shadow-lg shadow-blue-600/20 hover:bg-blue-700">
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : action === "shipOrder" ? <Send className="mr-2 h-4 w-4" /> : action === "fillLogistics" ? <Truck className="mr-2 h-4 w-4" /> : <PackageCheck className="mr-2 h-4 w-4" />}
          {task.summary.primaryActionLabel}
        </Button>
      </div>
    </form>
  );
}
