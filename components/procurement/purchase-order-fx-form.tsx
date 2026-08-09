"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updatePurchaseOrderFxRateAction } from "@/app/actions/purchase-orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PurchaseOrderFxFormProps {
  orderId: string;
  currentRate: string | null;
  suggestedRate: string | null;
}

export function PurchaseOrderFxForm({
  orderId,
  currentRate,
  suggestedRate,
}: PurchaseOrderFxFormProps) {
  const router = useRouter();
  const [fxRate, setFxRate] = useState(currentRate ?? suggestedRate ?? "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    setMessage(null);
    setLoading(true);
    try {
      const result = await updatePurchaseOrderFxRateAction(orderId, fxRate);
      if (!result.success) {
        setMessage(result.error);
        return;
      }
      setMessage("汇率已保存");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <Label htmlFor={`fx-rate-${orderId}`}>
        {currentRate ? "更新订单汇率" : "补录订单汇率"}
      </Label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <Input
          id={`fx-rate-${orderId}`}
          inputMode="decimal"
          value={fxRate}
          onChange={(event) => setFxRate(event.target.value)}
          placeholder="例如 0.05000000"
        />
        <Button type="button" onClick={submit} disabled={loading || !fxRate.trim()}>
          {loading ? "保存中..." : "保存汇率"}
        </Button>
      </div>
      {suggestedRate ? (
        <p className="mt-2 text-xs text-muted-foreground">
          系统按下单日期找到的建议汇率：{suggestedRate}
        </p>
      ) : null}
      {message ? <p className="mt-2 text-sm">{message}</p> : null}
    </div>
  );
}
