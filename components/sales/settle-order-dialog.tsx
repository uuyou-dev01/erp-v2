"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { settleCustomerOrder } from "@/app/actions/customer-orders";
import { Calculator, X } from "lucide-react";

interface SettleOrderDialogProps {
  orderId: string;
  currency: string;
  defaultPlatformFee?: string;
  defaultShippingFee?: string;
  defaultFeeRate?: string;
}

export function SettleOrderDialog({
  orderId,
  currency,
  defaultPlatformFee,
  defaultShippingFee,
  defaultFeeRate,
}: SettleOrderDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    platformFee: defaultPlatformFee ?? "",
    shippingFee: defaultShippingFee ?? "",
    platformFeeRate: defaultFeeRate ?? "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await settleCustomerOrder(orderId, {
        platformFee: form.platformFee || undefined,
        shippingFee: form.shippingFee || undefined,
        platformFeeRate: form.platformFeeRate || undefined,
      });
      setOpen(false);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "结算失败");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Calculator className="mr-2 h-4 w-4" />
        结算订单
      </Button>
    );
  }

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
              补充实际手续费和邮费，系统自动重算净利润。售出日期已自动记录。
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>平台手续费 ({currency})</Label>
                <Input
                  value={form.platformFee}
                  onChange={(e) => setForm({ ...form, platformFee: e.target.value })}
                  placeholder="金额"
                />
              </div>
              <div className="space-y-2">
                <Label>或费率 (0.1 = 10%)</Label>
                <Input
                  value={form.platformFeeRate}
                  onChange={(e) => setForm({ ...form, platformFeeRate: e.target.value })}
                  placeholder="0.1"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>邮费 ({currency})</Label>
                <Input
                  value={form.shippingFee}
                  onChange={(e) => setForm({ ...form, shippingFee: e.target.value })}
                  placeholder="实际邮费"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                取消
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "结算中..." : "确认结算"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
