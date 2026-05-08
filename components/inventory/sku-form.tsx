"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createSKU, updateSKU } from "@/app/actions/skus";
import { X, Plus, Upload, Link as LinkIcon, GitBranch } from "lucide-react";
import { t } from "@/lib/i18n";

export interface ParentOption {
  id: string;
  code: string;
  name: string;
  category: string | null;
  brand: string | null;
  _count: { childSkus: number };
}

interface SKUFormProps {
  storeId: string;
  parentOptions?: ParentOption[];
  initialData?: {
    id: string;
    code: string;
    name: string;
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

const CHILD_PRESET_ATTRIBUTES = [
  { key: "颜色", value: "" },
  { key: "尺寸", value: "" },
  { key: "型号", value: "" },
  { key: "款式", value: "" },
];

export function SKUForm({ storeId, parentOptions = [], initialData }: SKUFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [uploadMode, setUploadMode] = useState<"url" | "file">("url");
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    parentSkuId: initialData?.parentSkuId || "",
    code: initialData?.code || "",
    name: initialData?.name || "",
    category: initialData?.category || "",
    brand: initialData?.brand || "",
    description: initialData?.description || "",
    imageUrl: initialData?.imageUrl || "",
  });

  const [attributes, setAttributes] = useState<Array<{ key: string; value: string }>>(
    initialData?.attributes
      ? Object.entries(initialData.attributes).map(([key, value]) => ({
          key,
          value: String(value),
        }))
      : []
  );

  const isChild = formData.parentSkuId !== "";
  const selectedParent = useMemo(
    () => parentOptions.find((p) => p.id === formData.parentSkuId),
    [parentOptions, formData.parentSkuId]
  );

  const presetAttributes = isChild ? CHILD_PRESET_ATTRIBUTES : PARENT_PRESET_ATTRIBUTES;

  const handleParentChange = (parentId: string) => {
    const parent = parentOptions.find((p) => p.id === parentId);
    if (parent) {
      const nextIndex = parent._count.childSkus + 1;
      const suffix = String(nextIndex).padStart(2, "0");
      const autoCode = initialData?.code || `${parent.code}-${suffix}`;
      setFormData((prev) => ({
        ...prev,
        parentSkuId: parentId,
        code: autoCode,
        category: prev.category || parent.category || "",
        brand: prev.brand || parent.brand || "",
      }));
    } else {
      setFormData((prev) => ({ ...prev, parentSkuId: "" }));
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      alert("不支持的文件类型。仅支持JPEG、PNG、GIF和WebP格式。");
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      alert("文件过大。最大允许5MB。");
      return;
    }

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
      setFormData({ ...formData, imageUrl: url });
    } catch (error) {
      console.error("Upload error:", error);
      alert(error instanceof Error ? error.message : "图片上传失败");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const attributesObj = attributes.reduce(
        (acc, attr) => {
          if (attr.key.trim()) {
            acc[attr.key.trim()] = attr.value;
          }
          return acc;
        },
        {} as Record<string, string>
      );

      const data = {
        storeId,
        code: formData.code,
        name: formData.name,
        parentSkuId: formData.parentSkuId || undefined,
        category: formData.category || undefined,
        brand: formData.brand || undefined,
        attributes: Object.keys(attributesObj).length > 0 ? attributesObj : undefined,
        description: formData.description || undefined,
        imageUrl: formData.imageUrl || undefined,
      };

      if (initialData) {
        await updateSKU({ id: initialData.id, ...data });
      } else {
        await createSKU(data);
      }

      router.push("/inventory/skus");
      router.refresh();
    } catch (error) {
      console.error("Failed to save SKU:", error);
      alert("保存失败，请重试");
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Step 1: Parent relationship */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            SKU 类型
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="parentSkuId">该 SKU 是否属于某个父 SKU？</Label>
            <select
              id="parentSkuId"
              value={formData.parentSkuId}
              onChange={(e) => handleParentChange(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">独立 SKU / 父 SKU（产品线）</option>
              {parentOptions.map((sku) => (
                <option key={sku.id} value={sku.id}>
                  {sku.code} · {sku.name}
                  {sku._count.childSkus > 0 ? ` (已有 ${sku._count.childSkus} 个子款)` : ""}
                </option>
              ))}
            </select>
          </div>

          {isChild && selectedParent ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4 text-sm space-y-2">
              <p className="font-medium text-blue-900">
                创建子 SKU — 属于「{selectedParent.name}」的一个变体
              </p>
              <p className="text-blue-700">
                子 SKU 代码已根据父 SKU 自动生成，你可以修改后缀。
                子 SKU 拥有独立的库存、成本和销售记录。
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-muted bg-muted/30 p-4 text-sm space-y-2">
              <p className="font-medium">
                独立 SKU 或父 SKU（产品线）
              </p>
              <p className="text-muted-foreground">
                父 SKU 代表一个产品系列（如「经典T恤」），它本身可以入库也可以不入库。
                后续可以在它下面创建多个子 SKU（如各尺码/颜色）。
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Basic info */}
      <Card>
        <CardHeader>
          <CardTitle>{t("sku.basic_info")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="code">{t("sku.code")} *</Label>
              <div className="flex items-center gap-2">
                {isChild && selectedParent && (
                  <Badge variant="outline" className="shrink-0 font-mono">
                    {selectedParent.code}-
                  </Badge>
                )}
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder={isChild ? "01, 02, RED-M ..." : t("sku.code_placeholder")}
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {isChild
                  ? "子 SKU 代码已自动生成，你也可以改成更有意义的后缀（如颜色-尺码）"
                  : t("sku.code_hint")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">{t("sku.name")} *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={
                  isChild && selectedParent
                    ? `${selectedParent.name} · 白色M码`
                    : t("sku.name_placeholder")
                }
                required
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category">{t("sku.category")}</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder={t("sku.category_placeholder")}
              />
              {isChild && selectedParent?.category && formData.category === selectedParent.category && (
                <p className="text-xs text-green-600">已从父 SKU 继承</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="brand">{t("sku.brand")}</Label>
              <Input
                id="brand"
                value={formData.brand}
                onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                placeholder={t("sku.brand_placeholder")}
              />
              {isChild && selectedParent?.brand && formData.brand === selectedParent.brand && (
                <p className="text-xs text-green-600">已从父 SKU 继承</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t("sku.description")}</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder={t("sku.description_placeholder")}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("sku.image")}</Label>
            <div className="flex gap-2 mb-2">
              <Button
                type="button"
                variant={uploadMode === "url" ? "default" : "outline"}
                size="sm"
                onClick={() => setUploadMode("url")}
              >
                <LinkIcon className="mr-2 h-4 w-4" />
                网址
              </Button>
              <Button
                type="button"
                variant={uploadMode === "file" ? "default" : "outline"}
                size="sm"
                onClick={() => setUploadMode("file")}
              >
                <Upload className="mr-2 h-4 w-4" />
                上传
              </Button>
            </div>

            {uploadMode === "url" ? (
              <>
                <Input
                  id="imageUrl"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  placeholder="https://example.com/image.jpg"
                />
                <p className="text-xs text-muted-foreground">{t("sku.image_url_hint")}</p>
              </>
            ) : (
              <>
                <Input
                  id="imageFile"
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                  onChange={handleFileChange}
                  disabled={uploading}
                />
                <p className="text-xs text-muted-foreground">
                  {uploading ? t("sku.image_uploading") : t("sku.image_upload_hint")}
                </p>
              </>
            )}

            {formData.imageUrl && (
              <div className="mt-2 border rounded-lg p-2 bg-muted/50 relative">
                <img
                  src={formData.imageUrl}
                  alt="预览"
                  className="max-h-32 rounded object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => setFormData({ ...formData, imageUrl: "" })}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Step 3: Attributes */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle>
                {isChild ? "变体规格" : "产品属性"}
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {isChild
                  ? "描述这个变体的具体规格（颜色、尺码等），用于区分同一产品线下的不同子款"
                  : "描述产品线的共同特征（材质、产地等），子 SKU 不需要重复填写这些"}
              </p>
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
                      isChild
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

      <div className="flex gap-2">
        <Button type="submit" disabled={loading || uploading}>
          {loading ? t("common.saving") : initialData ? t("sku.update") : t("sku.create")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading || uploading}
        >
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
