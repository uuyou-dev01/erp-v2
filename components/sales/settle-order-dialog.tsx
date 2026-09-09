"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { settleCustomerOrderAction } from "@/app/actions/customer-orders";
import { AlertCircle, Calculator, X } from "lucide-react";

interface SettleOrderDialogProps {
  orderId: string;
  currency: string;
  defaultSalePrice?: string;
  defaultPlatformFee?: string;
  defaultShippingFee?: string;
  defaultFeeRate?: string;
  defaultFxRate?: string;
  baseCurrency?: string;
  requireActualShippingFee?: boolean;
}

export function SettleOrderDialog({
  orderId,
  currency,
  defaultSalePrice,
  defaultPlatformFee,
  defaultShippingFee,
  defaultFeeRate,
  defaultFxRate,
  baseCurrency = "CNY",
  requireActualShippingFee = false,
}: SettleOrderDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    actualSalePrice: "",
    platformFee: defaultPlatformFee ?? "",
    shippingFee: defaultShippingFee ?? "",
    platformFeeRate: defaultFeeRate ?? "",
    fxRate: defaultFxRate ?? (currency === baseCurrency ? "1" : ""),
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const updateForm = (updates: Partial<typeof form>) => {
    setSubmitError(null);
    setForm((prev) => ({ ...prev, ...updates }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setLoading(true);
    try {
      const result = await settleCustomerOrderAction(orderId, {
        actualSalePrice: form.actualSalePrice || undefined,
        platformFee: form.platformFee || undefined,
        shippingFee: form.shippingFee || undefined,
        platformFeeRate: form.platformFeeRate || undefined,
        fxRate: form.fxRate || undefined,
      });
      if (!result.success) {
        setSubmitError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "结算失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <Button
        variant="outline"
        onClick={() => {
          setSubmitError(null);
          setOpen(true);
        }}
      >
        <Calculator className="mr-2 h-4 w-4" />
        结算订单
      </Button>
    );
  }

  const salePrice = Number(form.actualSalePrice || defaultSalePrice || 0);
  const platformFee = Number(form.platformFee || 0);
  const shippingFee = Number(form.shippingFee || 0);
  const fxRate = Number(form.fxRate || 0);
  const netRevenue = salePrice - platformFee - shippingFee;
  const requiresFxRate = currency !== baseCurrency;
  const amount = (value: number, unit = currency) =>
    `${unit} ${Number.isFinite(value) ? value.toLocaleString("zh-CN", { maximumFractionDigits: 2 }) : "—"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => !loading && setOpen(false)} />
      <Card className="relative z-10 w-full max-w-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>结算订单</CardTitle>
            <button type="button" onClick={() => setOpen(false)} disabled={loading}>
              <X className="h-5 w-5" />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              成交金额已从订单带入；补充实际手续费、邮费和汇率后完成利润确认。
            </p>
            <section
              className="overflow-hidden rounded-lg border"
              aria-labelledby="dialog-settlement-summary"
            >
              <div className="border-b bg-muted/30 px-3 py-2.5">
                <h3 id="dialog-settlement-summary" className="text-sm font-semibold">
                  待结算汇总
                </h3>
              </div>
              <dl className="grid grid-cols-2 gap-3 px-3 py-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">成交金额</dt>
                  <dd className="mt-0.5 font-medium tabular-nums">{amount(salePrice)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">预计净入账</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums">{amount(netRevenue)}</dd>
                </div>
                {fxRate > 0 ? (
                  <div className="col-span-2 border-t pt-2">
                    <dt className="text-xs text-muted-foreground">
                      1 {currency} = {form.fxRate} {baseCurrency}
                    </dt>
                    <dd className="mt-0.5 tabular-nums">
                      折合净入账 {amount(netRevenue * fxRate, baseCurrency)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>
            <details className="rounded-lg border px-3 py-2.5">
              <summary className="cursor-pointer text-sm font-medium">修正已记录的成交金额</summary>
              <div className="mt-3 space-y-2">
                <Label>实际成交金额（选填）</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.actualSalePrice}
                  onChange={(e) => updateForm({ actualSalePrice: e.target.value })}
                  placeholder={`当前 ${amount(Number(defaultSalePrice || 0))}`}
                />
              </div>
            </details>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>平台手续费 ({currency})</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.platformFee}
                  onChange={(e) => updateForm({ platformFee: e.target.value })}
                  placeholder="金额"
                />
              </div>
              <div className="space-y-2">
                <Label>或费率 (0.1 = 10%)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={form.platformFeeRate}
                  onChange={(e) => updateForm({ platformFeeRate: e.target.value })}
                  placeholder="0.1"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>实际邮费 ({currency})</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  required={requireActualShippingFee}
                  value={form.shippingFee}
                  onChange={(e) => updateForm({ shippingFee: e.target.value })}
                  placeholder="实际邮费"
                />
                {requireActualShippingFee ? (
                  <p className="text-xs text-amber-700">
                    该订单邮费仍待打包核算；结算时必须填写，实际为 0 也请明确输入 0。
                  </p>
                ) : null}
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>
                  结算汇率（{currency} → {baseCurrency}
                  {requiresFxRate ? "，必填" : "，无需填写"}）
                </Label>
                <Input
                  type="number"
                  min="0.00000001"
                  step="0.00000001"
                  required={requiresFxRate}
                  disabled={!requiresFxRate}
                  value={form.fxRate}
                  onChange={(e) => updateForm({ fxRate: e.target.value })}
                  placeholder={`1 ${currency} 对应的 ${baseCurrency} 金额`}
                />
                <p className="text-xs text-muted-foreground">
                  结算后保存本次汇率快照，不随之后的汇率变化。
                </p>
              </div>
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
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                取消
              </Button>
              <Button type="submit" disabled={loading || (requiresFxRate && !form.fxRate.trim())}>
                {loading ? "结算中..." : "确认结算"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
