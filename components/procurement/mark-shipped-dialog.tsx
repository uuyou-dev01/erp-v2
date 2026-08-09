"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { markPurchaseAsShippedAction } from "@/app/actions/purchase-orders";
import { Truck, X, AlertCircle } from "lucide-react";

interface MarkShippedDialogProps {
  purchaseOrderId: string;
  defaultTrackingNo?: string | null;
  defaultCarrier?: string | null;
  defaultEtaDate?: string | null;
  defaultShipmentNote?: string | null;
  isResubmit?: boolean;
}

function toDateInputValue(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

export function MarkShippedDialog({
  purchaseOrderId,
  defaultTrackingNo,
  defaultCarrier,
  defaultEtaDate,
  defaultShipmentNote,
  isResubmit = false,
}: MarkShippedDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [form, setForm] = useState({
    shippedAt: new Date().toISOString().split("T")[0],
    trackingNo: defaultTrackingNo ?? "",
    carrier: defaultCarrier ?? "",
    etaDate: toDateInputValue(defaultEtaDate),
    shipmentNote: defaultShipmentNote ?? "",
    transportMode: "COURIER" as "HAND_CARRY" | "CONSOLIDATOR" | "POSTAL" | "COURIER" | "FREIGHT" | "OTHER",
    carriedBy: "",
    grossWeightKg: "",
    customsAmount: "",
    customsCurrency: "",
    taxAmount: "",
    taxCurrency: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const errs: Record<string, string> = {};
    if (!form.shippedAt) errs.shippedAt = "请填写发货日期";
    if (form.etaDate && form.shippedAt && form.etaDate < form.shippedAt) {
      errs.etaDate = "预计到货日期不能早于发货日期";
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    try {
      const result = await markPurchaseAsShippedAction({
        purchaseOrderId,
        shippedAt: new Date(form.shippedAt),
        trackingNo: form.trackingNo || undefined,
        carrier: form.carrier || undefined,
        etaDate: form.etaDate ? new Date(form.etaDate) : undefined,
        shipmentNote: form.shipmentNote || undefined,
        shipmentMode: "in_transit",
        transportMode: form.transportMode,
        carriedBy: form.carriedBy || undefined,
        grossWeightKg: form.grossWeightKg || undefined,
        customsAmount: form.customsAmount || undefined,
        customsCurrency: form.customsCurrency || undefined,
        taxAmount: form.taxAmount || undefined,
        taxCurrency: form.taxCurrency || undefined,
      });
      if (!result.success) {
        setSubmitError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "标记发货失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant={isResubmit ? "outline" : "default"}>
        <Truck className="mr-2 h-4 w-4" />
        {isResubmit ? "更新物流信息" : "标记为已发货"}
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !loading && setOpen(false)}
      />
      <Card className="relative z-10 w-full max-w-xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{isResubmit ? "更新物流信息" : "标记为已发货"}</CardTitle>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-lg border border-blue-500/40 bg-blue-500/5 p-3 text-sm">
              <p className="font-medium text-blue-700">标记发货后</p>
              <p className="text-muted-foreground">
                采购单状态将变为「在途」，可用于追踪物流进度。到货后再走「确认收货」生成入库库存。
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="transportMode">这一段怎么运输</Label>
                <Select
                  id="transportMode"
                  value={form.transportMode}
                  onChange={(event) => setForm({ ...form, transportMode: event.target.value as typeof form.transportMode })}
                >
                  <option value="HAND_CARRY">我或朋友随身带</option>
                  <option value="CONSOLIDATOR">集运商 / 合箱</option>
                  <option value="POSTAL">邮局直邮</option>
                  <option value="COURIER">快递</option>
                  <option value="FREIGHT">货运</option>
                  <option value="OTHER">其他</option>
                </Select>
              </div>
              {form.transportMode === "HAND_CARRY" ? (
                <div className="space-y-2">
                  <Label htmlFor="carriedBy">由谁携带</Label>
                  <Input id="carriedBy" value={form.carriedBy} onChange={(event) => setForm({ ...form, carriedBy: event.target.value })} placeholder="姓名或说明" />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="grossWeightKg">重量（kg，可选）</Label>
                  <Input id="grossWeightKg" type="number" min="0" step="0.001" value={form.grossWeightKg} onChange={(event) => setForm({ ...form, grossWeightKg: event.target.value })} />
                </div>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="shippedAt">发货日期 *</Label>
                <Input
                  id="shippedAt"
                  type="date"
                  value={form.shippedAt}
                  onChange={(e) => {
                    setSubmitError(null);
                    setForm({ ...form, shippedAt: e.target.value });
                  }}
                  required
                />
                {errors.shippedAt && (
                  <p className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    {errors.shippedAt}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="etaDate">预计到货日期</Label>
                <Input
                  id="etaDate"
                  type="date"
                  value={form.etaDate}
                  onChange={(e) => {
                    setSubmitError(null);
                    setForm({ ...form, etaDate: e.target.value });
                  }}
                  min={form.shippedAt || undefined}
                />
                {errors.etaDate && (
                  <p className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    {errors.etaDate}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>申报金额与币种（可选）</Label>
                <div className="grid grid-cols-[1fr_90px] gap-2">
                  <Input type="number" min="0" step="0.01" value={form.customsAmount} onChange={(event) => setForm({ ...form, customsAmount: event.target.value })} placeholder="金额" />
                  <Input value={form.customsCurrency} onChange={(event) => setForm({ ...form, customsCurrency: event.target.value.toUpperCase() })} placeholder="JPY" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>本段税费与币种（可选）</Label>
                <div className="grid grid-cols-[1fr_90px] gap-2">
                  <Input type="number" min="0" step="0.01" value={form.taxAmount} onChange={(event) => setForm({ ...form, taxAmount: event.target.value })} placeholder="金额" />
                  <Input value={form.taxCurrency} onChange={(event) => setForm({ ...form, taxCurrency: event.target.value.toUpperCase() })} placeholder="CNY" />
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="trackingNo">物流单号</Label>
                <Input
                  id="trackingNo"
                  value={form.trackingNo}
                  onChange={(e) => {
                    setSubmitError(null);
                    setForm({ ...form, trackingNo: e.target.value });
                  }}
                  placeholder="例如：SF1234567890"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="carrier">承运商</Label>
                <Input
                  id="carrier"
                  value={form.carrier}
                  onChange={(e) => {
                    setSubmitError(null);
                    setForm({ ...form, carrier: e.target.value });
                  }}
                  placeholder="例如：顺丰 / EMS / DHL"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="shipmentNote">物流备注</Label>
              <textarea
                id="shipmentNote"
                value={form.shipmentNote}
                onChange={(e) => {
                  setSubmitError(null);
                  setForm({ ...form, shipmentNote: e.target.value });
                }}
                rows={2}
                placeholder="多包裹、第二程物流单号等可记在此处"
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {submitError ? (
              <div
                role="alert"
                className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{submitError}</p>
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                取消
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "提交中..." : "确认"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
