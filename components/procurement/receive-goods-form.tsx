"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { receivePurchaseOrder } from "@/app/actions/purchase-orders";
import { AlertCircle, Package } from "lucide-react";
import { t } from "@/lib/i18n";

interface ReceiveGoodsFormProps {
  purchaseOrderId: string;
  locations: Array<{ id: string; code: string; name: string }>;
  lineCount: number;
}

export function ReceiveGoodsForm({ purchaseOrderId, locations, lineCount }: ReceiveGoodsFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    locationId: "",
    receivedAt: new Date().toISOString().split("T")[0],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.locationId) {
      setErrors({ locationId: "请选择目的地仓库" });
      return;
    }

    setLoading(true);
    try {
      await receivePurchaseOrder({
        purchaseOrderId,
        locationId: formData.locationId,
        receivedAt: new Date(formData.receivedAt),
      });

      router.push("/procurement");
      router.refresh();
    } catch (error) {
      console.error("Failed to receive goods:", error);
      alert("收货失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex gap-3 rounded-lg border border-primary/50 bg-primary/10 p-4">
        <Package className="h-5 w-5 text-primary" />
        <div className="flex-1 space-y-1 text-sm">
          <p className="font-medium">即将收货 {lineCount} 项商品</p>
          <p className="text-muted-foreground">
            收货后将自动创建 {lineCount} 条入库库存并写入库存流水记录。采购单状态将变为【已收货】。
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="locationId">目的地仓库 *</Label>
          <Select
            id="locationId"
            value={formData.locationId}
            onChange={(e) => setFormData({ ...formData, locationId: e.target.value })}
            required
          >
            <option value="">{t("inventory.select_location")}</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.code} - {location.name}
              </option>
            ))}
          </Select>
          {errors.locationId && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {errors.locationId}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="receivedAt">{t("inventory.received_date")} *</Label>
          <Input
            id="receivedAt"
            type="date"
            value={formData.receivedAt}
            onChange={(e) => setFormData({ ...formData, receivedAt: e.target.value })}
            required
          />
        </div>
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "收货中..." : "确认收货并创建库存"}
      </Button>
    </form>
  );
}
