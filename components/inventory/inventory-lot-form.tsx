"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createInventoryLotAction } from "@/app/actions/inventory-lots";
import { getSKUs } from "@/app/actions/skus";
import { getLocations } from "@/app/actions/locations";
import { isValidDecimal } from "@/lib/decimal";
import { AlertCircle } from "lucide-react";
import { t, CURRENCIES } from "@/lib/i18n";

interface InventoryLotFormProps {
  storeId: string;
}

export function InventoryLotForm({ storeId }: InventoryLotFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [skus, setSKUs] = useState<
    Array<{ id: string; code: string; name: string; parentSkuId?: string | null; childSkus?: { id: string }[] }>
  >([]);
  const [locations, setLocations] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [formData, setFormData] = useState({
    skuId: "",
    locationId: "",
    quantity: "",
    unitCost: "",
    costCurrency: "CNY",
    sourceId: "MANUAL_ENTRY",
    receivedAt: new Date().toISOString().split("T")[0],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getSKUs(storeId), getLocations(storeId)]).then(([skuData, locationData]) => {
      setSKUs(skuData);
      setLocations(locationData);
    });
  }, [storeId]);

  const updateFormData = (updates: Partial<typeof formData>) => {
    setSubmitError(null);
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.skuId) newErrors.skuId = "请选择SKU";
    if (!formData.locationId) newErrors.locationId = "请选择仓库位置";
    if (!formData.quantity) {
      newErrors.quantity = "数量为必填项";
    } else if (!isValidDecimal(formData.quantity)) {
      newErrors.quantity = "数量格式无效";
    } else if (parseFloat(formData.quantity) <= 0) {
      newErrors.quantity = "数量必须大于0";
    }
    if (!formData.unitCost) {
      newErrors.unitCost = "单位成本为必填项";
    } else if (!isValidDecimal(formData.unitCost)) {
      newErrors.unitCost = "成本格式无效";
    } else if (parseFloat(formData.unitCost) < 0) {
      newErrors.unitCost = "成本不能为负数";
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
      const result = await createInventoryLotAction({
        storeId,
        skuId: formData.skuId,
        locationId: formData.locationId,
        quantity: formData.quantity,
        unitCost: formData.unitCost,
        costCurrency: formData.costCurrency,
        sourceType: "PURCHASE",
        sourceId: formData.sourceId,
        receivedAt: new Date(formData.receivedAt),
      });
      if (!result.success) {
        setSubmitError(result.error);
        return;
      }

      router.push("/inventory/lots");
      router.refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "创建入库库存失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("inventory.lot_info")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="skuId">SKU *</Label>
            <Select
              id="skuId"
              value={formData.skuId}
              onChange={(e) => updateFormData({ skuId: e.target.value })}
              required
            >
              <option value="">{t("inventory.select_sku")}</option>
              {skus
                .filter((sku) => sku.parentSkuId || !sku.childSkus?.length)
                .map((sku) => (
                <option key={sku.id} value={sku.id}>
                  {sku.code} - {sku.name}
                </option>
              ))}
            </Select>
            {errors.skuId && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" />
                {errors.skuId}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="locationId">{t("location.name")} *</Label>
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
            <Label htmlFor="quantity">{t("inventory.quantity")} *</Label>
            <Input
              id="quantity"
              type="text"
              value={formData.quantity}
              onChange={(e) => updateFormData({ quantity: e.target.value })}
              placeholder={t("inventory.quantity_placeholder")}
              required
            />
            {errors.quantity && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" />
                {errors.quantity}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{t("inventory.quantity_hint")}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="unitCost">{t("inventory.unit_cost")} *</Label>
              <Input
                id="unitCost"
                type="text"
                value={formData.unitCost}
                onChange={(e) => updateFormData({ unitCost: e.target.value })}
                placeholder={t("inventory.unit_cost_placeholder")}
                required
              />
              {errors.unitCost && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {errors.unitCost}
                </p>
              )}
              <p className="text-xs text-muted-foreground">{t("inventory.unit_cost_hint")}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="costCurrency">{t("common.currency")} *</Label>
              <Select
                id="costCurrency"
                value={formData.costCurrency}
                onChange={(e) => updateFormData({ costCurrency: e.target.value })}
                required
              >
                {CURRENCIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>
            </div>
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
            <p className="text-xs text-muted-foreground">{t("inventory.received_date_hint")}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-primary" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">{t("inventory.ledger_info")}</p>
              <p className="text-muted-foreground">{t("inventory.ledger_hint")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {submitError ? (
        <div
          role="alert"
          className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{submitError}</p>
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? t("common.creating") : t("inventory.create_lot")}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
