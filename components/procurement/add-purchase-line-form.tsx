"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { addPurchaseLine } from "@/app/actions/purchase-orders";
import { getSKUs } from "@/app/actions/skus";
import { isValidDecimal } from "@/lib/decimal";
import { AlertCircle } from "lucide-react";
import { t } from "@/lib/i18n";

interface AddPurchaseLineFormProps {
  purchaseOrderId: string;
  currency: string;
  storeId: string;
}

export function AddPurchaseLineForm({
  purchaseOrderId,
  currency,
  storeId,
}: AddPurchaseLineFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [skus, setSKUs] = useState<Array<{ id: string; code: string; name: string; parentSkuId?: string | null }>>([]);
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
    if (!formData.unitPrice) {
      newErrors.unitPrice = "单价为必填项";
    } else if (!isValidDecimal(formData.unitPrice) || parseFloat(formData.unitPrice) < 0) {
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
      await addPurchaseLine({
        purchaseOrderId,
        skuId: formData.skuId,
        quantity: formData.quantity,
        unitPrice: formData.unitPrice,
      });

      setFormData({ skuId: "", quantity: "", unitPrice: "" });
      router.refresh();
    } catch (error) {
      console.error("Failed to add purchase line:", error);
      alert("添加商品失败，请重试");
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
            {(() => {
              const parents = skus.filter((s) => !s.parentSkuId);
              const standalone = parents.filter((p) => !skus.some((s) => s.parentSkuId === p.id));
              const groups = parents.filter((p) => skus.some((s) => s.parentSkuId === p.id));

              return (
                <>
                  {groups.map((parent) => (
                    <optgroup key={parent.id} label={`${parent.code} · ${parent.name}`}>
                      <option value={parent.id}>
                        {parent.code} (父 SKU)
                      </option>
                      {skus
                        .filter((s) => s.parentSkuId === parent.id)
                        .map((child) => (
                          <option key={child.id} value={child.id}>
                            　{child.code} - {child.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                  {standalone.map((sku) => (
                    <option key={sku.id} value={sku.id}>
                      {sku.code} - {sku.name}
                    </option>
                  ))}
                </>
              );
            })()}
          </Select>
          {errors.skuId && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {errors.skuId}
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
            placeholder="例如：100"
            required
          />
          {errors.quantity && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {errors.quantity}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="unitPrice">{t("purchase.unit_price")} ({currency}) *</Label>
          <Input
            id="unitPrice"
            type="text"
            value={formData.unitPrice}
            onChange={(e) => setFormData({ ...formData, unitPrice: e.target.value })}
            placeholder="例如：99.99"
            required
          />
          {errors.unitPrice && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {errors.unitPrice}
            </p>
          )}
        </div>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? t("common.saving") : t("purchase.add_line")}
      </Button>
    </form>
  );
}
