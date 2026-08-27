"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { addPurchaseLineAction } from "@/app/actions/purchase-orders";
import { getSKUs } from "@/app/actions/skus";
import { isValidDecimal } from "@/lib/decimal";
import { AlertCircle } from "lucide-react";
import { t } from "@/lib/i18n";

interface AddPurchaseLineFormProps {
  purchaseOrderId: string;
  currency: string;
  storeId: string;
  onSuccess?: () => void;
}

export function AddPurchaseLineForm({
  purchaseOrderId,
  currency,
  storeId,
  onSuccess,
}: AddPurchaseLineFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [skus, setSKUs] = useState<
    Array<{
      id: string;
      code: string;
      name: string;
      catalogRole?: string | null;
      parentSkuId?: string | null;
      childSkus?: { id: string }[];
    }>
  >([]);
  const [formData, setFormData] = useState({
    skuId: "",
    trackingMode: "LOT" as "LOT" | "ITEM_UNIT",
    quantity: "",
    unitPrice: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

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
    } else if (
      formData.trackingMode === "ITEM_UNIT" &&
      !Number.isInteger(Number(formData.quantity))
    ) {
      newErrors.quantity = "一物一单商品的数量必须是整数";
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
    setSubmitError(null);
    if (!validateForm()) return;

    setLoading(true);
    try {
      const result = await addPurchaseLineAction({
        purchaseOrderId,
        skuId: formData.skuId,
        trackingMode: formData.trackingMode,
        quantity: formData.quantity,
        unitPrice: formData.unitPrice,
      });
      if (!result.success) {
        setSubmitError(result.error);
        return;
      }

      setFormData({ skuId: "", trackingMode: "LOT", quantity: "", unitPrice: "" });
      onSuccess?.();
      router.refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "添加商品失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="skuId">SKU *</Label>
          <Select
            id="skuId"
            value={formData.skuId}
            onChange={(e) => {
              setSubmitError(null);
              setFormData({ ...formData, skuId: e.target.value });
            }}
            required
          >
            <option value="">{t("inventory.select_sku")}</option>
            {(() => {
              const isGroup = (sku: (typeof skus)[number]) =>
                sku.catalogRole === "GROUP" ||
                (!sku.parentSkuId && skus.some((s) => s.parentSkuId === sku.id));
              const groups = skus.filter(isGroup);
              const standalone = skus.filter((sku) => !sku.parentSkuId && !isGroup(sku));

              return (
                <>
                  {groups.map((parent) => (
                    <optgroup key={parent.id} label={`${parent.code} · ${parent.name}`}>
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
          <Label htmlFor="trackingMode">库存管理方式 *</Label>
          <Select
            id="trackingMode"
            value={formData.trackingMode}
            onChange={(e) =>
              setFormData({
                ...formData,
                trackingMode: e.target.value as "LOT" | "ITEM_UNIT",
              })
            }
          >
            <option value="LOT">按数量管理</option>
            <option value="ITEM_UNIT">一物一单（逐件建档）</option>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="quantity">{t("common.quantity")} *</Label>
          <Input
            id="quantity"
            type="text"
            value={formData.quantity}
            onChange={(e) => {
              setSubmitError(null);
              setFormData({ ...formData, quantity: e.target.value });
            }}
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
          <Label htmlFor="unitPrice">
            {t("purchase.unit_price")} ({currency}) *
          </Label>
          <Input
            id="unitPrice"
            type="text"
            value={formData.unitPrice}
            onChange={(e) => {
              setSubmitError(null);
              setFormData({ ...formData, unitPrice: e.target.value });
            }}
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

      {submitError ? (
        <div
          role="alert"
          className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{submitError}</p>
        </div>
      ) : null}

      <Button type="submit" disabled={loading}>
        {loading ? t("common.saving") : t("purchase.add_line")}
      </Button>
    </form>
  );
}
