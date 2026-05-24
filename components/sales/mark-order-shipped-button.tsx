"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { markOrderShipped } from "@/app/actions/customer-orders";
import { Truck, X } from "lucide-react";

interface MarkOrderShippedButtonProps {
  orderId: string;
  defaultTrackingNo?: string | null;
}

export function MarkOrderShippedButton({
  orderId,
  defaultTrackingNo,
}: MarkOrderShippedButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [trackingNo, setTrackingNo] = useState(defaultTrackingNo ?? "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await markOrderShipped(orderId, trackingNo || undefined);
      setOpen(false);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "标记发货失败");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Truck className="mr-2 h-4 w-4" />
        确认已发货
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => !loading && setOpen(false)} />
      <Card className="relative z-10 w-full max-w-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>确认已发货</CardTitle>
            <button type="button" onClick={() => setOpen(false)} disabled={loading}>
              <X className="h-5 w-5" />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              确认后将扣减库存并更新订单为已发货状态。
            </p>
            <div className="space-y-2">
              <Label htmlFor="trackingNo">物流单号（选填）</Label>
              <Input
                id="trackingNo"
                value={trackingNo}
                onChange={(e) => setTrackingNo(e.target.value)}
                placeholder="发货凭证/单号"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                取消
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "提交中..." : "确认发货"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
