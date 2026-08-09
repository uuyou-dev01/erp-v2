"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { allocatePurchaseOrderCostsAction } from "@/app/actions/purchase-orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export function PurchaseCostAllocationForm({
  purchaseOrderId,
  purchaseCurrency,
  initialTotal,
}: {
  purchaseOrderId: string;
  purchaseCurrency: string;
  initialTotal: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    totalProductCost: initialTotal ?? "",
    method: "BY_QUANTITY" as "BY_QUANTITY" | "BY_AMOUNT",
    shippingAmount: "",
    shippingCurrency: purchaseCurrency,
    taxAmount: "",
    taxCurrency: purchaseCurrency,
    inspectionAmount: "",
    inspectionCurrency: purchaseCurrency,
  });

  const submit = () => {
    setError(null);
    startTransition(() => {
      void (async () => {
        const fees = [
          { feeType: "SHIPPING_COST" as const, amount: form.shippingAmount, currency: form.shippingCurrency },
          { feeType: "TAX" as const, amount: form.taxAmount, currency: form.taxCurrency },
          { feeType: "INSPECTION" as const, amount: form.inspectionAmount, currency: form.inspectionCurrency },
        ].filter((fee) => fee.amount.trim() && Number(fee.amount) !== 0);
        const result = await allocatePurchaseOrderCostsAction({
          purchaseOrderId,
          totalProductCost: form.totalProductCost,
          method: form.method,
          fees,
        });
        if (!result.success) {
          setError(result.error);
          return;
        }
        router.refresh();
      })();
    });
  };

  return (
    <div className="space-y-4 rounded-lg border border-amber-300 bg-amber-50/50 p-4">
      <div>
        <p className="font-medium">分摊整批采购成本</p>
        <p className="text-sm text-muted-foreground">
          运费、税费和质检费保留原币；系统换算后计入到岸成本。缺少或过期汇率会阻止确认。
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label>整批商品总价（{purchaseCurrency}）</Label>
          <Input
            value={form.totalProductCost}
            onChange={(event) => setForm({ ...form, totalProductCost: event.target.value })}
            placeholder="例如：40000"
          />
        </div>
        <div className="space-y-2">
          <Label>怎么分到每个商品</Label>
          <Select
            value={form.method}
            onChange={(event) => setForm({ ...form, method: event.target.value as typeof form.method })}
          >
            <option value="BY_QUANTITY">按件数平均分</option>
            <option value="BY_AMOUNT">按已填写的商品金额比例</option>
          </Select>
        </div>
      </div>
      {[
        ["shipping", "国际/国内运费"],
        ["tax", "税费"],
        ["inspection", "质检费"],
      ].map(([key, label]) => {
        const amountKey = `${key}Amount` as keyof typeof form;
        const currencyKey = `${key}Currency` as keyof typeof form;
        return (
          <div key={key} className="grid gap-3 md:grid-cols-[1fr_160px]">
            <div className="space-y-2">
              <Label>{label}（可选）</Label>
              <Input
                value={form[amountKey]}
                onChange={(event) => setForm({ ...form, [amountKey]: event.target.value })}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>币种</Label>
              <Input
                value={form[currencyKey]}
                onChange={(event) => setForm({ ...form, [currencyKey]: event.target.value.toUpperCase() })}
              />
            </div>
          </div>
        );
      })}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" onClick={submit} disabled={pending}>
        {pending ? "正在核对汇率并分摊…" : "确认成本分摊"}
      </Button>
    </div>
  );
}
