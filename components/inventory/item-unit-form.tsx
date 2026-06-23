"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createItemUnitAction, updateItemUnitAction } from "@/app/actions/item-units";
import { getSKUs } from "@/app/actions/skus";
import { getLocations } from "@/app/actions/locations";
import { isValidDecimal } from "@/lib/decimal";
import { AlertCircle, Plus, X } from "lucide-react";
import { t, CURRENCIES } from "@/lib/i18n";
import { formatLocationRegion } from "@/lib/inventory/location-regions";

interface ItemUnitFormProps {
  storeId: string;
  initialData?: {
    id: string;
    conditionGrade?: string | null;
    photos?: string[];
    ownerId?: string | null;
    holderId?: string | null;
    notes?: string | null;
  };
  mode: "create" | "edit";
}

export function ItemUnitForm({ storeId, initialData, mode }: ItemUnitFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [skus, setSKUs] = useState<
    Array<{ id: string; code: string; name: string; parentSkuId?: string | null; childSkus?: { id: string }[] }>
  >([]);
  const [locations, setLocations] = useState<
    Array<{ id: string; code: string; name: string; region: string | null }>
  >([]);
  const [formData, setFormData] = useState({
    skuId: "",
    locationId: "",
    unitCost: "",
    costCurrency: "CNY",
    conditionGrade: initialData?.conditionGrade || "",
    photos: initialData?.photos || [],
    ownerId: initialData?.ownerId || "",
    holderId: initialData?.holderId || "",
    notes: initialData?.notes || "",
  });
  const [photoInput, setPhotoInput] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getSKUs(storeId), getLocations(storeId)]).then(([skuData, locationData]) => {
      setSKUs(skuData);
      setLocations(locationData);
    });
  }, [storeId]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (mode === "create") {
      if (!formData.skuId) newErrors.skuId = "请选择SKU";
      if (!formData.locationId) newErrors.locationId = "请选择仓库位置";
      if (!formData.unitCost) {
        newErrors.unitCost = "单位成本为必填项";
      } else if (!isValidDecimal(formData.unitCost)) {
        newErrors.unitCost = "成本格式无效";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddPhoto = () => {
    if (photoInput.trim()) {
      updateFormData({ photos: [...formData.photos, photoInput.trim()] });
      setPhotoInput("");
    }
  };

  const handleRemovePhoto = (index: number) => {
    updateFormData({ photos: formData.photos.filter((_, i) => i !== index) });
  };

  const updateFormData = (updates: Partial<typeof formData>) => {
    setSubmitError(null);
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!validateForm()) return;

    setLoading(true);
    try {
      const result =
        mode === "create"
          ? await createItemUnitAction({
              storeId,
              skuId: formData.skuId,
              locationId: formData.locationId,
              unitCost: formData.unitCost,
              costCurrency: formData.costCurrency,
              conditionGrade: formData.conditionGrade || undefined,
              photos: formData.photos.length > 0 ? formData.photos : undefined,
              ownerId: formData.ownerId || undefined,
              holderId: formData.holderId || undefined,
              notes: formData.notes || undefined,
            })
          : await updateItemUnitAction(initialData!.id, {
              conditionGrade: formData.conditionGrade || undefined,
              photos: formData.photos.length > 0 ? formData.photos : undefined,
              ownerId: formData.ownerId || undefined,
              holderId: formData.holderId || undefined,
              notes: formData.notes || undefined,
            });

      if (!result.success) {
        setSubmitError(result.error);
        return;
      }

      if (mode === "create") {
        router.push("/inventory/items");
      } else {
        router.refresh();
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : mode === "create"
            ? "创建单品失败，请重试"
            : "保存单品失败，请重试"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {mode === "create" && (
        <>
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
                  {location.region ? ` · ${formatLocationRegion(location.region)}` : ""}
                </option>
              ))}
            </Select>
            {errors.locationId && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" />{errors.locationId}
              </p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="unitCost">{t("inventory.unit_cost")} *</Label>
              <Input
                id="unitCost"
                type="text"
                value={formData.unitCost}
                onChange={(e) => updateFormData({ unitCost: e.target.value })}
                placeholder="例如：100.00"
                required
              />
              {errors.unitCost && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" />{errors.unitCost}
                </p>
              )}
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
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="conditionGrade">成色等级</Label>
        <Select
          id="conditionGrade"
          value={formData.conditionGrade}
          onChange={(e) => updateFormData({ conditionGrade: e.target.value })}
        >
          <option value="">选择成色</option>
          <option value="NEW">全新</option>
          <option value="LIKE_NEW">几乎全新</option>
          <option value="EXCELLENT">优秀</option>
          <option value="GOOD">良好</option>
          <option value="FAIR">一般</option>
          <option value="POOR">较差</option>
          <option value="DEFECTIVE">有瑕疵</option>
        </Select>
        <p className="text-xs text-muted-foreground">用于二手或瑕疵商品的成色等级</p>
      </div>

      <div className="space-y-2">
        <Label>商品照片</Label>
        <div className="flex gap-2">
          <Input
            type="text"
            value={photoInput}
            onChange={(e) => setPhotoInput(e.target.value)}
            placeholder="图片URL"
          />
          <Button type="button" onClick={handleAddPhoto} variant="outline">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {formData.photos.length > 0 && (
          <div className="space-y-2">
            {formData.photos.map((photo, index) => (
              <div key={index} className="flex items-center gap-2 rounded-lg border p-2">
                <span className="flex-1 truncate text-sm">{photo}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => handleRemovePhoto(index)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ownerId">所有者ID</Label>
          <Input
            id="ownerId"
            type="text"
            value={formData.ownerId}
            onChange={(e) => updateFormData({ ownerId: e.target.value })}
            placeholder="例如：user_123"
          />
          <p className="text-xs text-muted-foreground">该商品的所有者</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="holderId">持有者ID</Label>
          <Input
            id="holderId"
            type="text"
            value={formData.holderId}
            onChange={(e) => updateFormData({ holderId: e.target.value })}
            placeholder="例如：user_456"
          />
          <p className="text-xs text-muted-foreground">当前持有/代卖该商品的人</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">{t("common.notes")}</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => updateFormData({ notes: e.target.value })}
          placeholder="关于该商品的备注信息..."
          rows={3}
        />
      </div>

      {submitError && (
        <p className="flex items-center gap-1 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />{submitError}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? t("common.saving") : mode === "create" ? "创建单品" : "更新单品"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
