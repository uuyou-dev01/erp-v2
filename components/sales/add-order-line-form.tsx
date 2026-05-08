"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { addOrderLine } from "@/app/actions/customer-orders";
import { getSKUs } from "@/app/actions/skus";
import { isValidDecimal } from "@/lib/decimal";
import { AlertCircle } from "lucide-react";
import { t } from "@/lib/i18n";

interface AddOrderLineFormProps {
  orderId: string;
  currency: string;
  storeId: string;
}

export function AddOrderLineForm({ orderId, currency, storeId }: AddOrderLineFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [skus, setSKUs] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [formData, setFormData] = useState({
    skuId: "",
    quantity: "",
    unitPrice: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    getSKUs(storeId).then(setSKUs);
  }, [storeId]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.skuId) newErrors.skuId = "请选择SKU";
    if (!formData.quantity) {
      newErrors.quantity = "数量为必填项";
    } else if (!isValidDecimal(formData.quantity) || parseFloat(formData.quantity) <= 0) {
      newErrors.quantity = "数量格式无效";
    }
    if (formData.unitPrice && !isValidDecimal(formData.unitPrice)) {
      newErrors.unitPrice = "单价格式无效";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      await addOrderLine({
        orderId,
        skuId: formData.skuId,
        quantity: formData.quantity,
        unitPrice: formData.unitPrice || undefined,
      });

      setFormData({ skuId: "", quantity: "", unitPrice: "" });
      router.refresh();
    } catch (error) {
      console.error("Failed to add order line:", error);
      alert("添加商品行失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="skuId">SKU *</Label>
          <Select
            id="skuId"
            value={formData.skuId}
            onChange={(e) => setFormData({ ...formData, skuId: e.target.value })}
            required
          >
            <option value="">{t("inventory.select_sku")}</option>
            {skus.map((sku) => (
              <option key={sku.id} value={sku.id}>{sku.code} - {sku.name}</option>
            ))}
          </Select>
          {errors.skuId && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />{errors.skuId}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="quantity">{t("common.quantity")} *</Label>
          <Input
            id="quantity"
            type="text"
            value={formData.quantity}
            onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
            placeholder="例如：10"
            required
          />
          {errors.quantity && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />{errors.quantity}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="unitPrice">{t("common.price")} ({currency})</Label>
          <Input
            id="unitPrice"
            type="text"
            value={formData.unitPrice}
            onChange={(e) => setFormData({ ...formData, unitPrice: e.target.value })}
            placeholder="例如：149.99"
          />
          {errors.unitPrice && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />{errors.unitPrice}
            </p>
          )}
          <p className="text-xs text-muted-foreground">选填 - 可稍后设置</p>
        </div>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? t("common.saving") : t("purchase.add_line")}
      </Button>
    </form>
  );
}
