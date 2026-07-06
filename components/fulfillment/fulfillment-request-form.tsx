"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createResaleOrderFulfillmentAction } from "@/app/actions/fulfillment-requests";
import type { SerializedResaleListing } from "@/app/actions/resale-listings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function FulfillmentRequestForm({
  storeId,
  resaleListing,
}: {
  storeId: string;
  resaleListing: SerializedResaleListing;
}) {
  const router = useRouter();
  const remainingQty = Math.max(0, Number(resaleListing.quantityPlanned) - Number(resaleListing.quantitySold));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    quantity: remainingQty > 0 ? String(remainingQty) : "1",
    externalOrderNo: "",
    recipientName: "",
    customerEmail: "",
    recipientPhone: "",
    shippingAddress: "",
    shippingCountry: "",
    note: "",
  });

  const updateField = (updates: Partial<typeof formData>) => {
    setError(null);
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await createResaleOrderFulfillmentAction({
        storeId,
        resaleListingId: resaleListing.id,
        quantity: formData.quantity,
        customerName: formData.recipientName,
        customerEmail: formData.customerEmail || undefined,
        customerPhone: formData.recipientPhone || undefined,
        externalOrderNo: formData.externalOrderNo || undefined,
        shippingAddress: formData.shippingAddress,
        shippingCountry: formData.shippingCountry || undefined,
        note: formData.note || undefined,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      router.push(`/fulfillment/requests/${result.fulfillmentRequestId}`);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "登记售出失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="rounded-md border border-border/60 bg-muted/30 p-4 text-sm">
        <div className="font-medium">{resaleListing.title}</div>
        <div className="mt-1 text-muted-foreground">
          来源货盘 {resaleListing.supplyOffer.title} · 平台 {resaleListing.platform.name} · 剩余可请求 {remainingQty}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="quantity">履约数量</Label>
          <Input
            id="quantity"
            type="number"
            min="0"
            step="0.01"
            value={formData.quantity}
            onChange={(event) => updateField({ quantity: event.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="recipientName">客户/收件人</Label>
          <Input
            id="recipientName"
            value={formData.recipientName}
            onChange={(event) => updateField({ recipientName: event.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="recipientPhone">电话</Label>
          <Input
            id="recipientPhone"
            value={formData.recipientPhone}
            onChange={(event) => updateField({ recipientPhone: event.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="externalOrderNo">外部订单号</Label>
          <Input
            id="externalOrderNo"
            value={formData.externalOrderNo}
            onChange={(event) => updateField({ externalOrderNo: event.target.value })}
            placeholder="平台订单号"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="customerEmail">客户邮箱</Label>
          <Input
            id="customerEmail"
            type="email"
            value={formData.customerEmail}
            onChange={(event) => updateField({ customerEmail: event.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_220px]">
        <div className="space-y-2">
          <Label htmlFor="shippingAddress">收件地址</Label>
          <Textarea
            id="shippingAddress"
            rows={4}
            value={formData.shippingAddress}
            onChange={(event) => updateField({ shippingAddress: event.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="shippingCountry">国家/地区</Label>
          <Input
            id="shippingCountry"
            value={formData.shippingCountry}
            onChange={(event) => updateField({ shippingCountry: event.target.value })}
            placeholder="JP / CN / US"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="note">备注</Label>
        <Textarea id="note" rows={3} value={formData.note} onChange={(event) => updateField({ note: event.target.value })} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          取消
        </Button>
        <Button type="submit" disabled={loading || resaleListing.status !== "ACTIVE"}>
          {loading ? "创建中..." : "登记售出并创建履约"}
        </Button>
      </div>
    </form>
  );
}
