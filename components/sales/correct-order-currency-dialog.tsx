"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Coins, X } from "lucide-react";
import { correctCustomerOrderCurrencyAction } from "@/app/actions/customer-orders";
import { CURRENCIES } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export function CorrectOrderCurrencyDialog({
  orderId,
  currency,
  totalPaid,
  platformFee,
  shippingFee,
}: {
  orderId: string;
  currency: string;
  totalPaid: string;
  platformFee: string;
  shippingFee: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newCurrency, setNewCurrency] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await correctCustomerOrderCurrencyAction({
        orderId,
        expectedCurrency: currency,
        expectedTotalPaid: totalPaid,
        newCurrency,
        confirmedSameCurrencyFees: confirmed,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更正失败，请重试");
    } finally {
      setPending(false);
    }
  };

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Coins className="mr-2 h-4 w-4" aria-hidden="true" />
        更正币种
      </Button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="更正订单币种"
    >
      <div className="absolute inset-0 bg-black/50" onClick={() => !pending && setOpen(false)} />
      <Card className="relative z-10 w-full max-w-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>更正订单原币</CardTitle>
          <button type="button" aria-label="关闭" disabled={pending} onClick={() => setOpen(false)}>
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p>
                当前币种：<strong>{currency}</strong>
              </p>
              <p>
                成交金额：{currency} {totalPaid}
              </p>
              <p>
                平台费：{currency} {platformFee}
              </p>
              <p>
                销售运费：{currency} {shippingFee}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="correct-order-currency">正确的订单原币</Label>
              <Select
                id="correct-order-currency"
                value={newCurrency}
                onChange={(event) => {
                  setNewCurrency(event.target.value);
                  setError(null);
                }}
                required
              >
                <option value="">请选择</option>
                {CURRENCIES.filter((option) => option.value !== currency).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <p className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                只更正币种，售价、平台费和销售运费的数字不变；报表折合 CNY
                与利润将按订单日期的汇率重新核算。若费用使用了不同币种，请先分别核对，暂不要提交。
              </span>
            </p>
            <label className="flex items-start gap-2 text-sm leading-5">
              <input
                type="checkbox"
                className="mt-1"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>我已核对：售价、平台费和销售运费的数字都属于所选原币。</span>
            </label>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={pending || !newCurrency || !confirmed}>
                {pending ? "更正中…" : "确认更正"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
