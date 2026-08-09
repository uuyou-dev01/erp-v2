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
import {
  itemFunctionStatusOptions,
  itemRequiresIssueEvidence,
  normalizeItemConditionType,
  normalizeItemFunctionStatus,
  normalizeUsedItemGrade,
  usedItemGradeOptions,
} from "@/lib/inventory/item-condition";

interface ItemUnitFormProps {
  storeId: string;
  initialData?: {
    id: string;
    conditionType?: string | null;
    conditionGrade?: string | null;
    functionStatus?: string | null;
    photos?: string[];
    ownerId?: string | null;
    holderId?: string | null;
    notes?: string | null;
  };
  mode: "create" | "edit";
}

interface ItemUnitFormState {
  skuId: string;
  locationId: string;
  unitCost: string;
  costCurrency: string;
  conditionType: string;
  conditionGrade: string;
  functionStatus: string;
  photos: string[];
  ownerId: string;
  holderId: string;
  notes: string;
}

export function ItemUnitForm({ storeId, initialData, mode }: ItemUnitFormProps) {
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
  const [locations, setLocations] = useState<
    Array<{ id: string; code: string; name: string; region: string | null }>
  >([]);
  const initialConditionType = initialData
    ? normalizeItemConditionType(initialData.conditionType)
    : "USED";
  const [formData, setFormData] = useState<ItemUnitFormState>({
    skuId: "",
    locationId: "",
    unitCost: "",
    costCurrency: "CNY",
    conditionType: initialConditionType,
    conditionGrade: normalizeUsedItemGrade(initialData?.conditionGrade) ?? "UNASSESSED",
    functionStatus: normalizeItemFunctionStatus(initialData?.functionStatus, initialConditionType),
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

    if (formData.conditionType === "USED" && !formData.conditionGrade) {
      newErrors.conditionGrade = "请选择中古品级或待评级";
    }
    if (itemRequiresIssueEvidence(formData) && !formData.notes.trim()) {
      newErrors.notes = "C/D 级或功能异常时必须填写瑕疵或异常说明";
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
              conditionType: formData.conditionType,
              conditionGrade:
                formData.conditionType === "USED" ? formData.conditionGrade : undefined,
              functionStatus: formData.functionStatus,
              photos: formData.photos,
              ownerId: formData.ownerId || undefined,
              holderId: formData.holderId || undefined,
              notes: formData.notes || undefined,
            })
          : await updateItemUnitAction(initialData!.id, {
              conditionType: formData.conditionType,
              conditionGrade:
                formData.conditionType === "USED" ? formData.conditionGrade : undefined,
              functionStatus: formData.functionStatus,
              photos: formData.photos,
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
                .filter(
                  (sku) =>
                    sku.catalogRole !== "GROUP" && (sku.parentSkuId || !sku.childSkus?.length)
                )
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
                  {location.region ? ` · ${formatLocationRegion(location.region)}` : ""}
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
                  <AlertCircle className="h-3 w-3" />
                  {errors.unitCost}
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
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </>
      )}

      <div className="space-y-4 border-y py-5">
        <div>
          <h3 className="text-sm font-semibold">单件状态</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            全新不评级；中古需要记录品级和功能状态。
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="conditionType">商品状态</Label>
            <Select
              id="conditionType"
              value={formData.conditionType}
              onChange={(e) => {
                const conditionType = e.target.value as "NEW" | "USED";
                updateFormData({
                  conditionType,
                  conditionGrade: conditionType === "USED" ? "UNASSESSED" : "",
                  functionStatus: conditionType === "NEW" ? "NORMAL" : "UNTESTED",
                });
              }}
            >
              <option value="NEW">全新</option>
              <option value="USED">中古 / 二手</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="functionStatus">功能状态</Label>
            <Select
              id="functionStatus"
              value={formData.functionStatus}
              onChange={(e) => updateFormData({ functionStatus: e.target.value })}
              disabled={formData.conditionType === "NEW"}
            >
              {itemFunctionStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {formData.conditionType === "USED" ? (
          <div className="space-y-2">
            <Label>中古品级</Label>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {usedItemGradeOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={formData.conditionGrade === option.value ? "default" : "outline"}
                  className="h-auto min-h-12 flex-col px-2 py-2"
                  onClick={() => updateFormData({ conditionGrade: option.value })}
                  title={option.description}
                >
                  <span className="font-semibold">{option.label}</span>
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {usedItemGradeOptions.find((option) => option.value === formData.conditionGrade)
                ?.description ?? "请选择品级"}
            </p>
            {errors.conditionGrade ? (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" />
                {errors.conditionGrade}
              </p>
            ) : null}
          </div>
        ) : null}

        {formData.conditionType === "USED" &&
        (formData.conditionGrade === "UNASSESSED" ||
          formData.functionStatus === "UNTESTED" ||
          (itemRequiresIssueEvidence(formData) && formData.photos.length === 0)) ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            该单件会先暂停销售；完成评级、功能确认，并为 C/D 级或异常商品补图后才恢复可售。
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label>商品照片</Label>
        <p className="text-xs text-muted-foreground">
          优先上传正面、背面和瑕疵细节；创建后也可以在单件详情通过手机继续补图。
        </p>
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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemovePhoto(index)}
                >
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
        {errors.notes ? (
          <p className="flex items-center gap-1 text-xs text-destructive">
            <AlertCircle className="h-3 w-3" />
            {errors.notes}
          </p>
        ) : null}
      </div>

      {submitError && (
        <p className="flex items-center gap-1 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {submitError}
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
