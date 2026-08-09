"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductCategoryPicker } from "@/components/inventory/product-category-picker";
import { createSKUAction, updateSKUAction } from "@/app/actions/skus";
import {
  mergeSkuCatalogAttributes,
  parseSkuCatalogMeta,
  resolveCoverImageUrl,
  type CatalogStatus,
  type SkuCatalogImage,
} from "@/lib/application/sku-catalog";
import type { SkuCatalogRole, SkuIdentitySource } from "@/lib/application/sku-identity";
import { AlertCircle, X, Plus, Upload, Link as LinkIcon, Star } from "lucide-react";
import { t } from "@/lib/i18n";

export interface ParentOption {
  id: string;
  code: string;
  name: string;
  catalogRole?: string | null;
  manufacturerCode?: string | null;
  variantAxes?: unknown;
  categoryId?: string | null;
  category: string | null;
  brand: string | null;
  _count: { childSkus: number };
}

interface SKUFormProps {
  storeId: string;
  parentOptions?: ParentOption[];
  defaultCatalogRole?: SkuCatalogRole;
  defaultParentSkuId?: string;
  /** 新建成功后进入下一步，而不是直接结束在详情页 */
  continueAfterCreate?: boolean;
  /** 紧凑布局，用于详情页编辑弹层 */
  compact?: boolean;
  /** 保存成功后回调；提供时不再跳转到列表页 */
  onSaved?: (skuId: string) => void;
  onCancel?: () => void;
  initialData?: {
    id: string;
    code: string;
    name: string;
    catalogRole?: string | null;
    manufacturerCode?: string | null;
    variantLabel?: string | null;
    variantAxes?: unknown;
    variantValues?: unknown;
    nameSource?: string | null;
    codeSource?: string | null;
    parentSkuId?: string | null;
    categoryId?: string | null;
    category?: string | null;
    brand?: string | null;
    attributes?: Record<string, unknown> | null;
    description?: string | null;
    imageUrl?: string | null;
  };
}

const PARENT_PRESET_ATTRIBUTES = [
  { key: "材质", value: "" },
  { key: "风格", value: "" },
  { key: "产地", value: "" },
  { key: "重量", value: "" },
];

const VARIANT_AXIS_PRESETS = [
  { label: "尺码", value: "尺码" },
  { label: "颜色", value: "颜色" },
  { label: "容量", value: "容量" },
  { label: "人物 / 角色", value: "角色" },
  { label: "款式", value: "款式" },
];

const CHILD_PRESET_ATTRIBUTES = [
  { key: "厂商色号", value: "" },
  { key: "尺寸参数", value: "" },
  { key: "型号后缀", value: "" },
  { key: "包装规格", value: "" },
];

function normalizeCatalogRole(value: unknown, fallback: SkuCatalogRole): SkuCatalogRole {
  return value === "GROUP" || value === "VARIANT" || value === "SIMPLE" ? value : fallback;
}

function initialRole(
  initialData: SKUFormProps["initialData"],
  defaultCatalogRole: SkuCatalogRole
): SkuCatalogRole {
  if (initialData) {
    return normalizeCatalogRole(
      initialData.catalogRole,
      initialData.parentSkuId ? "VARIANT" : "SIMPLE"
    );
  }
  return defaultCatalogRole;
}

function stringArrayFromUnknown(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function stringRecordFromUnknown(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => [key.trim(), String(val ?? "").trim()] as const)
      .filter(([key, val]) => key && val)
  );
}

function splitVariantAxes(value: string) {
  return value
    .split(/[,，/、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function labelForRole(role: SkuCatalogRole) {
  if (role === "GROUP") return "商品组";
  if (role === "VARIANT") return "规格 SKU";
  return "独立 SKU";
}

function initialCatalogState(initialData?: SKUFormProps["initialData"]) {
  const parsed = initialData?.attributes
    ? parseSkuCatalogMeta(initialData.attributes, initialData.imageUrl)
    : null;
  return {
    catalogStatus: (parsed?.catalogStatus ?? "active") as CatalogStatus,
    barcode: parsed?.barcode ?? "",
    referencePrice: parsed?.referencePrice ?? "",
    referenceCost: parsed?.referenceCost ?? "",
    currency: parsed?.currency ?? "CNY",
    series: parsed?.series ?? "",
    notes: parsed?.notes ?? "",
    tagsInput: (parsed?.tags ?? []).join(", "),
    images:
      parsed?.images && parsed.images.length > 0
        ? parsed.images
        : initialData?.imageUrl
          ? [{ url: initialData.imageUrl, isCover: true }]
          : ([] as SkuCatalogImage[]),
    variantEntries: parsed
      ? Object.entries(parsed.variantAttributes).map(([key, value]) => ({
          key,
          value: String(value),
        }))
      : [],
  };
}

export function SKUForm({
  storeId,
  parentOptions = [],
  defaultCatalogRole = "GROUP",
  defaultParentSkuId = "",
  continueAfterCreate = false,
  initialData,
  compact = false,
  onSaved,
  onCancel,
}: SKUFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [uploadMode, setUploadMode] = useState<"url" | "file">("url");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [catalog, setCatalog] = useState(() => initialCatalogState(initialData));
  const resolvedInitialRole = initialRole(initialData, defaultCatalogRole);
  const initialVariantValues = stringRecordFromUnknown(initialData?.variantValues);
  const [formData, setFormData] = useState({
    catalogRole: resolvedInitialRole,
    parentSkuId: initialData?.parentSkuId || defaultParentSkuId,
    code: initialData?.code || "",
    name: initialData?.name || "",
    manufacturerCode: initialData?.manufacturerCode || "",
    variantLabel:
      initialData?.variantLabel ||
      Object.values(initialVariantValues).filter(Boolean).join(" / ") ||
      "",
    variantAxesInput: stringArrayFromUnknown(initialData?.variantAxes).join(", "),
    nameSource: (initialData?.nameSource === "MANUAL" ? "MANUAL" : "AUTO") as SkuIdentitySource,
    codeSource: (initialData?.codeSource === "MANUAL" ? "MANUAL" : "AUTO") as SkuIdentitySource,
    categoryId: initialData?.categoryId || "",
    category: initialData?.category || "",
    brand: initialData?.brand || "",
    description: initialData?.description || "",
    imageUrl: initialData?.imageUrl || "",
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [attributes, setAttributes] = useState<Array<{ key: string; value: string }>>(
    () => initialCatalogState(initialData).variantEntries
  );

  const isGroup = formData.catalogRole === "GROUP";
  const isVariant = formData.catalogRole === "VARIANT";
  const selectedVariantAxes = useMemo(
    () => splitVariantAxes(formData.variantAxesInput),
    [formData.variantAxesInput]
  );
  const selectedParent = useMemo(
    () => parentOptions.find((p) => p.id === formData.parentSkuId),
    [parentOptions, formData.parentSkuId]
  );
  const selectedParentAxes = useMemo(
    () => stringArrayFromUnknown(selectedParent?.variantAxes),
    [selectedParent]
  );

  const presetAttributes = isVariant ? CHILD_PRESET_ATTRIBUTES : PARENT_PRESET_ATTRIBUTES;
  const selectedVariantAxis = selectedVariantAxes[0] ?? "";
  const selectedVariantAxisPreset = VARIANT_AXIS_PRESETS.some(
    (preset) => preset.value === selectedVariantAxis
  );

  const handleParentChange = (parentId: string) => {
    setSubmitError(null);
    const parent = parentOptions.find((option) => option.id === parentId);
    setFormData((prev) => ({
      ...prev,
      parentSkuId: parentId,
      categoryId: parent?.categoryId || prev.categoryId,
      category: parent?.category || prev.category,
      brand: parent?.brand || prev.brand,
    }));
  };

  const updateFormData = (updates: Partial<typeof formData>) => {
    setSubmitError(null);
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setUploadError("不支持的文件类型。仅支持 JPEG、PNG、GIF 和 WebP 格式。");
      e.target.value = "";
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadError("文件过大。最大允许 5MB。");
      e.target.value = "";
      return;
    }

    setUploadError(null);
    setUploading(true);
    try {
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: uploadFormData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "上传失败");
      }

      const { url } = await response.json();
      setCatalog((prev) => ({
        ...prev,
        images: [...prev.images, { url, isCover: prev.images.length === 0 }],
      }));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "图片上传失败");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setLoading(true);

    try {
      const variantObj = attributes.reduce(
        (acc, attr) => {
          if (attr.key.trim()) {
            acc[attr.key.trim()] = attr.value;
          }
          return acc;
        },
        {} as Record<string, string>
      );

      const tags = catalog.tagsInput
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean);

      const merged = mergeSkuCatalogAttributes(initialData?.attributes, {
        catalogStatus: catalog.catalogStatus,
        barcode: catalog.barcode || null,
        referencePrice: catalog.referencePrice || null,
        referenceCost: catalog.referenceCost || null,
        currency: catalog.currency || null,
        series: isVariant ? undefined : catalog.series || null,
        notes: catalog.notes || null,
        tags,
        images: catalog.images.length > 0 ? catalog.images : undefined,
      });

      const attributesPayload = { ...merged, ...variantObj };
      const coverUrl = resolveCoverImageUrl(
        parseSkuCatalogMeta(attributesPayload),
        formData.imageUrl
      );
      const variantAxes = splitVariantAxes(formData.variantAxesInput).slice(0, 1);
      const variantValues =
        formData.catalogRole === "VARIANT" &&
        selectedParentAxes.length === 1 &&
        formData.variantLabel.trim()
          ? { [selectedParentAxes[0]]: formData.variantLabel.trim() }
          : undefined;

      const data = {
        storeId,
        catalogRole: formData.catalogRole,
        code: formData.code || undefined,
        name:
          formData.catalogRole === "VARIANT" && formData.nameSource === "AUTO"
            ? undefined
            : formData.name || undefined,
        manufacturerCode: formData.manufacturerCode || undefined,
        variantLabel:
          formData.catalogRole === "VARIANT" ? formData.variantLabel || undefined : undefined,
        variantAxes:
          formData.catalogRole === "GROUP" && variantAxes.length > 0 ? variantAxes : undefined,
        variantValues,
        nameSource: formData.name.trim() ? formData.nameSource : "AUTO",
        codeSource: formData.code.trim() ? formData.codeSource : "AUTO",
        parentSkuId:
          formData.catalogRole === "VARIANT" ? formData.parentSkuId || undefined : undefined,
        categoryId: formData.categoryId || null,
        category: formData.category || undefined,
        brand: formData.brand || undefined,
        attributes: attributesPayload,
        description: formData.description || undefined,
        imageUrl: coverUrl || undefined,
      };

      let skuId: string;
      if (initialData) {
        const result = await updateSKUAction({ id: initialData.id, ...data });
        if (!result.success) {
          setSubmitError(result.error);
          return;
        }
        skuId = result.id;
      } else {
        const result = await createSKUAction(data);
        if (!result.success) {
          setSubmitError(result.error);
          return;
        }
        skuId = result.id;
      }

      if (onSaved) {
        onSaved(skuId);
      } else if (!initialData && continueAfterCreate) {
        router.push(`/inventory/skus/${skuId}/created`);
      } else {
        router.push(`/inventory/skus/${skuId}`);
      }
      router.refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "保存失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const addAttribute = () => {
    setAttributes([...attributes, { key: "", value: "" }]);
  };

  const addPresetAttribute = (preset: { key: string; value: string }) => {
    if (!attributes.find((a) => a.key === preset.key)) {
      setAttributes([...attributes, { ...preset }]);
    }
  };

  const removeAttribute = (index: number) => {
    setAttributes(attributes.filter((_, i) => i !== index));
  };

  const updateAttribute = (index: number, field: "key" | "value", value: string) => {
    const newAttributes = [...attributes];
    newAttributes[index][field] = value;
    setAttributes(newAttributes);
  };

  const sectionGap = compact ? "space-y-3" : "space-y-6";
  const cardHeaderClass = compact ? "py-3" : undefined;
  const cardTitleClass = compact ? "text-sm font-medium" : undefined;
  const submitLabel = initialData
    ? t("sku.update")
    : isGroup
      ? "创建商品组"
      : isVariant
        ? "创建规格 SKU"
        : "创建独立 SKU";

  return (
    <form onSubmit={handleSubmit} className={sectionGap}>
      {isVariant ? (
        <Card>
          <CardHeader className={cardHeaderClass}>
            <CardTitle className={cardTitleClass}>规格归属</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(180px,0.6fr)]">
              <div className="space-y-1.5">
                <Label htmlFor="parentSkuId" className={compact ? "text-xs" : undefined}>
                  归属商品组 *
                </Label>
                <Select
                  id="parentSkuId"
                  value={formData.parentSkuId}
                  onChange={(e) => handleParentChange(e.target.value)}
                  required={isVariant}
                >
                  <option value="">选择商品组</option>
                  {parentOptions.map((sku) => (
                    <option key={sku.id} value={sku.id}>
                      {sku.name}
                      {sku.manufacturerCode ? ` · ${sku.manufacturerCode}` : ""}
                      {sku._count.childSkus > 0 ? ` (${sku._count.childSkus} 个规格)` : ""}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="variantLabel" className={compact ? "text-xs" : undefined}>
                  规格名称 *
                </Label>
                <Input
                  id="variantLabel"
                  value={formData.variantLabel}
                  onChange={(e) => updateFormData({ variantLabel: e.target.value })}
                  placeholder={
                    selectedParentAxes[0]
                      ? `例如：42码（${selectedParentAxes[0]}）`
                      : "例如：42码 / 小南 / 10cm"
                  }
                  required={isVariant}
                />
              </div>
              {!compact ? (
                <p className="text-xs text-muted-foreground md:col-span-2">
                  只写规格本身即可。系统会按「商品组 · 规格」生成展示名，例如 「AJ1 芝加哥 2015 ·
                  42码」。
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!isGroup ? (
        <Card>
          <CardHeader className={cardHeaderClass}>
            <CardTitle className={cardTitleClass}>价格与识别</CardTitle>
            {!compact ? (
              <p className="text-sm text-muted-foreground">
                这里填写这个规格共用的信息；全新、中古和品相在入库或期初库存时记录。
              </p>
            ) : null}
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>参考售价</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={catalog.referencePrice}
                onChange={(e) => setCatalog((c) => ({ ...c, referencePrice: e.target.value }))}
                placeholder="可选"
              />
            </div>
            <div className="space-y-2">
              <Label>目标进货价</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={catalog.referenceCost}
                onChange={(e) => setCatalog((c) => ({ ...c, referenceCost: e.target.value }))}
                placeholder="仅供采购参考，不写入库存成本"
              />
            </div>
            <div className="space-y-2">
              <Label>币种</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={catalog.currency}
                onChange={(e) => setCatalog((c) => ({ ...c, currency: e.target.value }))}
              >
                <option value="CNY">人民币 (CNY)</option>
                <option value="JPY">日元 (JPY)</option>
                <option value="USD">美元 (USD)</option>
                <option value="EUR">欧元 (EUR)</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="barcode">商品条码</Label>
              <Input
                id="barcode"
                value={catalog.barcode}
                onChange={(e) =>
                  setCatalog((current) => ({
                    ...current,
                    barcode: e.target.value,
                  }))
                }
                placeholder="EAN / UPC / JAN，可选"
              />
              <p className="text-xs text-muted-foreground">
                同一规格通用的商品条码，不用于记录单件品相。
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!isVariant ? (
        <Card>
          <CardHeader className={cardHeaderClass}>
            <CardTitle className={cardTitleClass}>商品基础信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">
                  {isVariant ? "自定义展示名" : `${labelForRole(formData.catalogRole)}名称 *`}
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    updateFormData({
                      name: e.target.value,
                      nameSource:
                        isVariant && e.target.value.trim() ? "MANUAL" : formData.nameSource,
                    })
                  }
                  placeholder={
                    isVariant && selectedParent
                      ? `${selectedParent.name} · ${formData.variantLabel || "42码"}`
                      : isGroup
                        ? "例如：AJ1 芝加哥 2015"
                        : "例如：竹筐"
                  }
                  required={!isVariant}
                />
                <p className="text-xs text-muted-foreground">
                  {isVariant
                    ? "通常不用填；留空时系统会用「商品组 · 规格名称」。"
                    : "填写用户最自然会记住的商品名称。"}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="manufacturerCode">官方货号 / 型号</Label>
                <Input
                  id="manufacturerCode"
                  value={formData.manufacturerCode}
                  onChange={(e) => updateFormData({ manufacturerCode: e.target.value })}
                  placeholder="例如：555088-101"
                />
                <p className="text-xs text-muted-foreground">
                  这是品牌或平台识别商品的原始货号，不等于我们系统里的 SKU 编码。
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>{t("sku.category")}</Label>
                <ProductCategoryPicker
                  value={formData.categoryId}
                  legacyValue={formData.category}
                  onChange={(categoryId, category) =>
                    updateFormData({
                      categoryId: categoryId ?? "",
                      category,
                    })
                  }
                  placeholder="搜索鞋服、首饰、生活用品等"
                  compact={compact}
                  inheritedHint={
                    isVariant &&
                    selectedParent?.category &&
                    formData.categoryId === selectedParent.categoryId
                      ? "已从商品组继承"
                      : undefined
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="brand">{t("sku.brand")}</Label>
                <Input
                  id="brand"
                  value={formData.brand}
                  onChange={(e) => updateFormData({ brand: e.target.value })}
                  placeholder={t("sku.brand_placeholder")}
                />
                {isVariant && selectedParent?.brand && formData.brand === selectedParent.brand && (
                  <p className="text-xs text-green-600">已从商品组继承</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="series">系列</Label>
                <Input
                  id="series"
                  value={catalog.series}
                  onChange={(e) => setCatalog((c) => ({ ...c, series: e.target.value }))}
                  placeholder="例如：晓组织、AJ1"
                />
              </div>
            </div>

            {isGroup ? (
              <div className="space-y-3 border-t pt-4">
                <div>
                  <Label>规格类型（可选）</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    只选择一种主要区分方式。以后添加的每个具体规格将分别管理库存和销售。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="选择一种规格类型">
                  {VARIANT_AXIS_PRESETS.map((preset) => {
                    const selected = selectedVariantAxis === preset.value;
                    return (
                      <Button
                        key={preset.value}
                        type="button"
                        variant={selected ? "secondary" : "outline"}
                        size="sm"
                        aria-pressed={selected}
                        onClick={() =>
                          updateFormData({
                            variantAxesInput: selected ? "" : preset.value,
                          })
                        }
                      >
                        {preset.label}
                      </Button>
                    );
                  })}
                </div>
                <div className="grid gap-2 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)] md:items-end">
                  <div className="space-y-1.5">
                    <Label htmlFor="customVariantAxis">其他规格类型</Label>
                    <Input
                      id="customVariantAxis"
                      value={selectedVariantAxisPreset ? "" : selectedVariantAxis}
                      onChange={(event) => updateFormData({ variantAxesInput: event.target.value })}
                      placeholder="例如：版本、香型"
                    />
                  </div>
                  <p className="pb-2 text-xs text-muted-foreground">
                    例如选择“尺码”后，再创建 41码、42码、43码等具体规格。
                  </p>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="description">{t("sku.description")}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => updateFormData({ description: e.target.value })}
                placeholder={t("sku.description_placeholder")}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>图片（多图，可设封面）</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                <Button
                  type="button"
                  variant={uploadMode === "url" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setUploadError(null);
                    setUploadMode("url");
                  }}
                >
                  <LinkIcon className="mr-2 h-4 w-4" />
                  网址
                </Button>
                <Button
                  type="button"
                  variant={uploadMode === "file" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setUploadError(null);
                    setUploadMode("file");
                  }}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  上传
                </Button>
              </div>

              {uploadMode === "url" ? (
                <div className="flex gap-2">
                  <Input
                    value={imageUrlInput}
                    onChange={(e) => setImageUrlInput(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (!imageUrlInput.trim()) return;
                      setUploadError(null);
                      setCatalog((c) => ({
                        ...c,
                        images: [
                          ...c.images,
                          {
                            url: imageUrlInput.trim(),
                            isCover: c.images.length === 0,
                          },
                        ],
                      }));
                      setImageUrlInput("");
                    }}
                  >
                    添加
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                    onChange={handleFileChange}
                    disabled={uploading}
                  />
                  <p className="text-xs text-muted-foreground">
                    {uploading ? t("sku.image_uploading") : t("sku.image_upload_hint")}
                  </p>
                  {uploadError ? (
                    <p role="alert" className="text-xs text-destructive">
                      {uploadError}
                    </p>
                  ) : null}
                </>
              )}

              {catalog.images.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-3">
                  {catalog.images.map((img, index) => (
                    <div key={`${img.url}-${index}`} className="relative rounded-lg border p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt="" className="h-24 w-24 rounded object-cover" />
                      {img.isCover ? (
                        <Badge className="absolute left-2 top-2 text-[10px]">封面</Badge>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="absolute left-2 top-2 h-7 px-2 text-[10px]"
                          onClick={() =>
                            setCatalog((c) => ({
                              ...c,
                              images: c.images.map((item, i) => ({
                                ...item,
                                isCover: i === index,
                              })),
                            }))
                          }
                        >
                          <Star className="mr-0.5 h-3 w-3" />
                          封面
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1 h-7 w-7"
                        onClick={() =>
                          setCatalog((c) => {
                            const next = c.images.filter((_, i) => i !== index);
                            if (next.length > 0 && !next.some((n) => n.isCover)) {
                              next[0] = { ...next[0], isCover: true };
                            }
                            return { ...c, images: next };
                          })
                        }
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <details className="rounded-md border bg-muted/20 px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium">
                更多信息
                <span className="ml-2 font-normal text-muted-foreground">
                  状态、标签、备注和内部编码
                </span>
              </summary>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="catalogStatus">档案状态</Label>
                  <Select
                    id="catalogStatus"
                    value={catalog.catalogStatus}
                    onChange={(e) =>
                      setCatalog((c) => ({
                        ...c,
                        catalogStatus: e.target.value as CatalogStatus,
                      }))
                    }
                  >
                    <option value="active">启用</option>
                    <option value="disabled">停用</option>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    停用后保留历史记录，但不再用于新的业务单据。
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="code">系统 SKU 编码</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) =>
                      updateFormData({
                        code: e.target.value,
                        codeSource: e.target.value.trim() ? "MANUAL" : "AUTO",
                      })
                    }
                    placeholder={
                      isVariant ? "留空自动生成，例如 NIKE-555088-101-42" : "留空自动生成"
                    }
                  />
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={formData.nameSource === "MANUAL" ? "secondary" : "outline"}>
                      名称{formData.nameSource === "MANUAL" ? "手动" : "自动"}
                    </Badge>
                    <Badge variant={formData.codeSource === "MANUAL" ? "secondary" : "outline"}>
                      编码{formData.codeSource === "MANUAL" ? "手动" : "自动"}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="catalogTags">标签</Label>
                  <Input
                    id="catalogTags"
                    value={catalog.tagsInput}
                    onChange={(e) =>
                      setCatalog((c) => ({
                        ...c,
                        tagsInput: e.target.value,
                      }))
                    }
                    placeholder="多个标签用逗号分隔"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="catalogNotes">内部备注</Label>
                  <Textarea
                    id="catalogNotes"
                    value={catalog.notes}
                    onChange={(e) => setCatalog((c) => ({ ...c, notes: e.target.value }))}
                    rows={2}
                    placeholder="仅用于内部补充说明"
                  />
                </div>
              </div>
            </details>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className={cardHeaderClass}>
            <CardTitle className={cardTitleClass}>继承商品信息</CardTitle>
            {!compact ? (
              <p className="text-sm text-muted-foreground">
                商品名称、货号、分类、品牌、系列、描述和图片默认使用所属商品组的信息。
              </p>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedParent ? (
              <div className="grid gap-3 rounded-md border bg-muted/20 px-3 py-3 text-sm md:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">商品组</p>
                  <p className="mt-1 font-medium">{selectedParent.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">官方货号 / 型号</p>
                  <p className="mt-1">{selectedParent.manufacturerCode || "未填写"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">品牌</p>
                  <p className="mt-1">{selectedParent.brand || "未填写"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">分类</p>
                  <p className="mt-1">{selectedParent.category || "未填写"}</p>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
                选择上方商品组后，这里会显示将要继承的公共信息。
              </div>
            )}

            <details className="rounded-md border bg-muted/20 px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium">
                规格档案设置
                <span className="ml-2 font-normal text-muted-foreground">
                  仅在本规格确实不同时填写
                </span>
              </summary>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="variantNameOverride">自定义展示名</Label>
                  <Input
                    id="variantNameOverride"
                    value={formData.name}
                    onChange={(e) =>
                      updateFormData({
                        name: e.target.value,
                        nameSource: e.target.value.trim() ? "MANUAL" : "AUTO",
                      })
                    }
                    placeholder={
                      selectedParent
                        ? `${selectedParent.name} · ${formData.variantLabel || "42码"}`
                        : "留空自动生成"
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    通常留空，系统会自动使用「商品组 · 规格名称」。
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="variantManufacturerCode">本规格专属货号 / 型号</Label>
                  <Input
                    id="variantManufacturerCode"
                    value={formData.manufacturerCode}
                    onChange={(e) => updateFormData({ manufacturerCode: e.target.value })}
                    placeholder="留空继承商品组"
                  />
                </div>

                <div className="space-y-2">
                  <Label>本规格品类</Label>
                  <ProductCategoryPicker
                    value={formData.categoryId}
                    legacyValue={formData.category}
                    onChange={(categoryId, category) =>
                      updateFormData({
                        categoryId: categoryId ?? "",
                        category,
                      })
                    }
                    placeholder={selectedParent?.category || "留空继承商品组"}
                    compact
                    inheritedHint={
                      selectedParent?.category && formData.categoryId === selectedParent.categoryId
                        ? "已从商品组继承"
                        : undefined
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="variantBrand">本规格品牌</Label>
                  <Input
                    id="variantBrand"
                    value={formData.brand}
                    onChange={(e) => updateFormData({ brand: e.target.value })}
                    placeholder={selectedParent?.brand || "留空继承商品组"}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="catalogStatus">档案状态</Label>
                  <Select
                    id="catalogStatus"
                    value={catalog.catalogStatus}
                    onChange={(e) =>
                      setCatalog((current) => ({
                        ...current,
                        catalogStatus: e.target.value as CatalogStatus,
                      }))
                    }
                  >
                    <option value="active">启用</option>
                    <option value="disabled">停用</option>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="code">系统 SKU 编码</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) =>
                      updateFormData({
                        code: e.target.value,
                        codeSource: e.target.value.trim() ? "MANUAL" : "AUTO",
                      })
                    }
                    placeholder="留空自动生成，例如 NIKE-555088-101-42"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="catalogTags">本规格标签</Label>
                  <Input
                    id="catalogTags"
                    value={catalog.tagsInput}
                    onChange={(e) =>
                      setCatalog((current) => ({
                        ...current,
                        tagsInput: e.target.value,
                      }))
                    }
                    placeholder="多个标签用逗号分隔"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="catalogNotes">内部备注</Label>
                  <Textarea
                    id="catalogNotes"
                    value={catalog.notes}
                    onChange={(e) =>
                      setCatalog((current) => ({
                        ...current,
                        notes: e.target.value,
                      }))
                    }
                    rows={2}
                    placeholder="仅用于这个规格的内部说明"
                  />
                </div>
              </div>
            </details>
          </CardContent>
        </Card>
      )}

      <details className="rounded-lg border bg-background" data-testid="supplemental-attributes">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <div>
            <p className="text-sm font-semibold">
              {isVariant ? "规格属性（可选）" : "商品属性（可选）"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isVariant
                ? "补充这个规格自身的描述信息，不会改变库存管理方式。"
                : isGroup
                  ? "补充所有规格共同拥有的材质、产地、风格等；不会生成规格或拆分库存。"
                  : "补充商品的材质、产地、风格等描述信息；不会拆分库存。"}
            </p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {attributes.length > 0 ? `已填写 ${attributes.length} 项` : "展开填写"}
          </span>
        </summary>
        <div className="space-y-4 border-t px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {presetAttributes.map((preset) => (
                <Button
                  key={preset.key}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => addPresetAttribute(preset)}
                  disabled={attributes.some((attribute) => attribute.key === preset.key)}
                >
                  + {preset.key}
                </Button>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addAttribute}>
              <Plus className="mr-2 h-4 w-4" />
              {t("sku.add_attribute")}
            </Button>
          </div>

          {attributes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isGroup
                ? "尚未添加。这里只填写所有规格共同拥有的描述信息。"
                : "尚未添加；没有补充信息时可以保持为空。"}
            </p>
          ) : (
            <div className="space-y-3">
              {attributes.map((attr, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder={t("sku.attribute_key_placeholder")}
                    value={attr.key}
                    onChange={(e) => updateAttribute(index, "key", e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder={
                      isVariant ? "属性值（如：红白配色）" : t("sku.attribute_value_placeholder")
                    }
                    value={attr.value}
                    onChange={(e) => updateAttribute(index, "value", e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`删除第 ${index + 1} 个属性`}
                    onClick={() => removeAttribute(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

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
        <Button type="submit" disabled={loading || uploading}>
          {loading ? t("common.saving") : submitLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => (onCancel ? onCancel() : router.back())}
          disabled={loading || uploading}
        >
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
