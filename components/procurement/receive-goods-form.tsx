"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { receivePurchaseOrderAction } from "@/app/actions/purchase-orders";
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

  const updateFormData = (updates: Partial<typeof formData>) => {
    setErrors({});
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (!formData.locationId) {
      setErrors({ locationId: "请选择目的地仓库" });
      return;
    }

    setLoading(true);
    try {
      const result = await receivePurchaseOrderAction({
        purchaseOrderId,
        locationId: formData.locationId,
        receivedAt: new Date(formData.receivedAt),
      });
      if (!result.success) {
        setErrors({ form: result.error });
        return;
      }

      router.push("/procurement");
      router.refresh();
    } catch (error) {
      setErrors({
        form: error instanceof Error ? error.message : "收货失败，请重试",
      });
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
      {errors.form && (
        <p className="flex items-center gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {errors.form}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="locationId">目的地仓库 *</Label>
          <Select
            id="locationId"
            value={formData.locationId}
            onChange={(e) => updateFormData({ locationId: e.target.value })}
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
            onChange={(e) => updateFormData({ receivedAt: e.target.value })}
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
