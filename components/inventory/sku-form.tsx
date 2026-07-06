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
import { createSKUAction, updateSKUAction } from "@/app/actions/skus";
import {
  mergeSkuCatalogAttributes,
  parseSkuCatalogMeta,
  resolveCoverImageUrl,
  type CatalogStatus,
  type ProductKind,
  type SkuCatalogImage,
  type SkuNewFields,
  type SkuUsedFields,
} from "@/lib/application/sku-catalog";
import type { SkuCatalogRole, SkuIdentitySource } from "@/lib/application/sku-identity";
import { AlertCircle, X, Plus, Upload, Link as LinkIcon, GitBranch, Star } from "lucide-react";
import { t } from "@/lib/i18n";

export interface ParentOption {
  id: string;
  code: string;
  name: string;
  catalogRole?: string | null;
  manufacturerCode?: string | null;
  variantAxes?: unknown;
  category: string | null;
  brand: string | null;
  _count: { childSkus: number };
}

interface SKUFormProps {
  storeId: string;
  parentOptions?: ParentOption[];
  defaultCatalogRole?: SkuCatalogRole;
  defaultParentSkuId?: string;
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
  { label: "角色", value: "角色" },
  { label: "规格", value: "规格" },
  { label: "容量", value: "容量" },
];

const CHILD_PRESET_ATTRIBUTES = [
  { key: "颜色", value: "" },
  { key: "尺寸", value: "" },
  { key: "型号", value: "" },
  { key: "款式", value: "" },
];

function normalizeCatalogRole(value: unknown, fallback: SkuCatalogRole): SkuCatalogRole {
  return value === "GROUP" || value === "VARIANT" || value === "SIMPLE"
    ? value
    : fallback;
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
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
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
    productKind: (parsed?.productKind ?? "NEW") as ProductKind,
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
    newFields: (parsed?.newFields ?? {}) as SkuNewFields,
    usedFields: (parsed?.usedFields ?? {}) as SkuUsedFields,
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
  const selectedParent = useMemo(
    () => parentOptions.find((p) => p.id === formData.parentSkuId),
    [parentOptions, formData.parentSkuId]
  );
  const selectedParentAxes = useMemo(
    () => stringArrayFromUnknown(selectedParent?.variantAxes),
    [selectedParent]
  );

  const presetAttributes = isVariant ? CHILD_PRESET_ATTRIBUTES : PARENT_PRESET_ATTRIBUTES;

  const handleRoleChange = (role: SkuCatalogRole) => {
    setSubmitError(null);
    setFormData((prev) => ({
      ...prev,
      catalogRole: role,
      parentSkuId: role === "VARIANT" ? prev.parentSkuId : "",
      variantLabel: role === "VARIANT" ? prev.variantLabel : "",
      nameSource: role === "VARIANT" ? "AUTO" : prev.nameSource,
      codeSource: "AUTO",
    }));
  };

  const handleParentChange = (parentId: string) => {
    setSubmitError(null);
    const parent = parentOptions.find((p) => p.id === parentId);
    if (parent) {
      setFormData((prev) => ({
        ...prev,
        parentSkuId: parentId,
        category: prev.category || parent.category || "",
        brand: prev.brand || parent.brand || "",
        manufacturerCode: prev.manufacturerCode || parent.manufacturerCode || "",
      }));
    } else {
      setFormData((prev) => ({ ...prev, parentSkuId: "" }));
    }
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
        productKind: catalog.productKind,
        referencePrice: catalog.referencePrice || null,
        referenceCost: catalog.referenceCost || null,
        currency: catalog.currency || null,
        series: catalog.series || null,
        notes: catalog.notes || null,
        tags,
        images: catalog.images.length > 0 ? catalog.images : undefined,
        newFields: catalog.productKind === "NEW" ? catalog.newFields : undefined,
        usedFields: catalog.productKind === "USED" ? catalog.usedFields : undefined,
      });

      const attributesPayload = { ...merged, ...variantObj };
      const coverUrl = resolveCoverImageUrl(
        parseSkuCatalogMeta(attributesPayload),
        formData.imageUrl
      );
      const variantAxes = splitVariantAxes(formData.variantAxesInput);
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
          formData.catalogRole === "VARIANT"
            ? formData.variantLabel || undefined
            : undefined,
        variantAxes:
          formData.catalogRole === "GROUP" && variantAxes.length > 0
            ? variantAxes
            : undefined,
        variantValues,
        nameSource: formData.name.trim() ? formData.nameSource : "AUTO",
        codeSource: formData.code.trim() ? formData.codeSource : "AUTO",
        parentSkuId:
          formData.catalogRole === "VARIANT"
            ? formData.parentSkuId || undefined
            : undefined,
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

  return (
    <form onSubmit={handleSubmit} className={sectionGap}>
      <Card>
        <CardHeader className={cardHeaderClass}>
          <CardTitle className={`flex items-center gap-2 ${cardTitleClass ?? ""}`}>
            <GitBranch className="h-4 w-4" />
            档案层级
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            {(["GROUP", "VARIANT", "SIMPLE"] as SkuCatalogRole[]).map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => handleRoleChange(role)}
                className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  formData.catalogRole === role
                    ? "border-primary bg-primary/5 text-primary"
                    : "hover:bg-muted/60"
                }`}
              >
                <span className="font-medium">{labelForRole(role)}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {role === "GROUP"
                    ? "SPU/系列壳子，不承接库存"
                    : role === "VARIANT"
                      ? "挂在商品组下，承接业务"
                      : "没有规格拆分，直接承接业务"}
                </span>
              </button>
            ))}
          </div>

          {isVariant ? (
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
                  只写规格本身即可。系统会按「商品组 · 规格」生成展示名，例如
                  「AJ1 芝加哥 2015 · 42码」。
                </p>
              ) : null}
            </div>
          ) : null}

          {isGroup ? (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <div className="flex flex-wrap gap-2">
                {VARIANT_AXIS_PRESETS.map((preset) => (
                  <Button
                    key={preset.value}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      const axes = splitVariantAxes(formData.variantAxesInput);
                      if (!axes.includes(preset.value)) {
                        updateFormData({
                          variantAxesInput: [...axes, preset.value].join(", "),
                        });
                      }
                    }}
                  >
                    + {preset.label}
                  </Button>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="variantAxes">默认规格维度</Label>
                <Input
                  id="variantAxes"
                  value={formData.variantAxesInput}
                  onChange={(e) => updateFormData({ variantAxesInput: e.target.value })}
                  placeholder="例如：尺码 / 角色 / 规格"
                />
              </div>
              {!compact ? (
                <p className="text-xs text-muted-foreground">
                  商品组类似 SPU：只负责承载系列信息和规格结构，采购、入库、上架、销售时选择下面的规格 SKU。
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className={cardHeaderClass}>
          <CardTitle className={cardTitleClass}>商品类型与状态</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>商品类型</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={catalog.productKind}
              onChange={(e) =>
                setCatalog((c) => ({
                  ...c,
                  productKind: e.target.value as ProductKind,
                }))
              }
            >
              <option value="NEW">全新</option>
              <option value="USED">中古</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>档案状态</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
            </select>
          </div>
          <div className="space-y-2">
            <Label>参考售价</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={catalog.referencePrice}
              onChange={(e) =>
                setCatalog((c) => ({ ...c, referencePrice: e.target.value }))
              }
              placeholder="可选"
            />
          </div>
          <div className="space-y-2">
            <Label>参考成本</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={catalog.referenceCost}
              onChange={(e) =>
                setCatalog((c) => ({ ...c, referenceCost: e.target.value }))
              }
              placeholder="可选"
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
            <Label>系列</Label>
            <Input
              value={catalog.series}
              onChange={(e) => setCatalog((c) => ({ ...c, series: e.target.value }))}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>标签（逗号分隔）</Label>
            <Input
              value={catalog.tagsInput}
              onChange={(e) => setCatalog((c) => ({ ...c, tagsInput: e.target.value }))}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>备注</Label>
            <Textarea
              value={catalog.notes}
              onChange={(e) => setCatalog((c) => ({ ...c, notes: e.target.value }))}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {catalog.productKind === "NEW" ? (
        <Card>
          <CardHeader className={cardHeaderClass}>
            <CardTitle className={cardTitleClass}>全新商品字段</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(catalog.newFields.isSealed)}
                onChange={(e) =>
                  setCatalog((c) => ({
                    ...c,
                    newFields: { ...c.newFields, isSealed: e.target.checked },
                  }))
                }
              />
              未拆封
            </label>
            <div className="space-y-2">
              <Label>条码</Label>
              <Input
                value={catalog.newFields.barcode ?? ""}
                onChange={(e) =>
                  setCatalog((c) => ({
                    ...c,
                    newFields: { ...c.newFields, barcode: e.target.value },
                  }))
                }
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className={cardHeaderClass}>
            <CardTitle className={cardTitleClass}>中古商品字段</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>默认品相</Label>
              <Input
                value={catalog.usedFields.defaultConditionGrade ?? ""}
                onChange={(e) =>
                  setCatalog((c) => ({
                    ...c,
                    usedFields: {
                      ...c.usedFields,
                      defaultConditionGrade: e.target.value,
                    },
                  }))
                }
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(catalog.usedFields.hasBox)}
                onChange={(e) =>
                  setCatalog((c) => ({
                    ...c,
                    usedFields: { ...c.usedFields, hasBox: e.target.checked },
                  }))
                }
              />
              含原盒
            </label>
          </CardContent>
        </Card>
      )}

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

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category">{t("sku.category")}</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => updateFormData({ category: e.target.value })}
                placeholder={t("sku.category_placeholder")}
              />
              {isVariant && selectedParent?.category && formData.category === selectedParent.category && (
                <p className="text-xs text-green-600">已从商品组继承</p>
              )}
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
          </div>

          <details className="rounded-md border bg-muted/20 px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">
              内部编码与高级命名
            </summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
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
                    isVariant
                      ? "留空自动生成，例如 NIKE-555088-101-42"
                      : "留空自动生成"
                  }
                />
                <p className="text-xs text-muted-foreground">
                  用于导入、对账和内部追踪；日常录入可以留空。
                </p>
              </div>
              <div className="space-y-2">
                <Label>当前生成方式</Label>
                <div className="flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm">
                  <Badge variant={formData.nameSource === "MANUAL" ? "secondary" : "outline"}>
                    名称 {formData.nameSource === "MANUAL" ? "手动" : "自动"}
                  </Badge>
                  <Badge variant={formData.codeSource === "MANUAL" ? "secondary" : "outline"}>
                    编码 {formData.codeSource === "MANUAL" ? "手动" : "自动"}
                  </Badge>
                </div>
              </div>
            </div>
          </details>

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
        </CardContent>
      </Card>

      {/* Step 3: Attributes */}
      <Card>
        <CardHeader className={cardHeaderClass}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className={cardTitleClass}>
                {isVariant ? "规格属性" : "商品属性"}
              </CardTitle>
              {!compact ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {isVariant
                    ? "规格 SKU 自己的补充属性"
                    : isGroup
                      ? "商品组共同特征（材质、产地等）"
                      : "独立 SKU 的补充属性"}
                </p>
              ) : null}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addAttribute}>
              <Plus className="mr-2 h-4 w-4" />
              {t("sku.add_attribute")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {presetAttributes.map((preset) => (
              <Button
                key={preset.key}
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => addPresetAttribute(preset)}
                disabled={attributes.some((a) => a.key === preset.key)}
              >
                + {preset.key}
              </Button>
            ))}
          </div>

          {attributes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("sku.no_attributes")}</p>
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
                      isVariant
                        ? "具体值（如：白色、M码）"
                        : t("sku.attribute_value_placeholder")
                    }
                    value={attr.value}
                    onChange={(e) => updateAttribute(index, "value", e.target.value)}
                    className="flex-1"
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeAttribute(index)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
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
        <Button type="submit" disabled={loading || uploading}>
          {loading ? t("common.saving") : initialData ? t("sku.update") : t("sku.create")}
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
