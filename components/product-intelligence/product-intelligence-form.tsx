"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addProductIntelligenceObservationAction,
  createProductIntelligenceAction,
  createProductIntelligenceVariantAction,
  updateProductIntelligenceAction,
} from "@/app/actions/product-intelligence";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProductCategoryPicker } from "@/components/inventory/product-category-picker";

type ParentOption = {
  id: string;
  title: string;
  brand: string | null;
  categoryId: string | null;
  category: string | null;
  _count: { childItems: number };
};

interface ProductIntelligenceFormProps {
  parentOptions?: ParentOption[];
  initialData?: {
    id: string;
    parentItemId: string | null;
    title: string;
    brand: string | null;
    categoryId: string | null;
    category: string | null;
    model: string | null;
    productKind: string;
    description: string | null;
    imageUrl: string | null;
    tags: string[];
    visibility: string;
    status: string;
  };
}

const PLATFORM_OPTIONS = [
  "Mercari",
  "Yahoo Auction",
  "SNKRDUNK",
  "得物",
  "闲鱼",
  "淘宝",
  "1688",
  "eBay",
  "线下店",
  "朋友报价",
  "其他",
];
const CURRENCY_OPTIONS = ["JPY", "CNY", "USD", "EUR"];
const CONDITION_OPTIONS = ["全新", "二手 S", "二手 A", "二手 B", "未标注"];

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function observedDate(value: string) {
  return new Date(`${value || todayInputValue()}T00:00:00.000`);
}

export function ProductIntelligenceForm({
  parentOptions = [],
  initialData,
}: ProductIntelligenceFormProps) {
  const router = useRouter();
  const isEditing = Boolean(initialData);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [itemType, setItemType] = useState<"GROUP" | "VARIANT">(
    initialData?.parentItemId ? "VARIANT" : "GROUP"
  );
  const [formData, setFormData] = useState({
    parentItemId: initialData?.parentItemId ?? "",
    title: initialData?.title ?? "",
    brand: initialData?.brand ?? "",
    categoryId: initialData?.categoryId ?? "",
    category: initialData?.category ?? "",
    model: initialData?.model ?? "",
    productKind: initialData?.productKind ?? "MIXED",
    description: initialData?.description ?? "",
    imageUrl: initialData?.imageUrl ?? "",
    tags: initialData?.tags.join(", ") ?? "",
    visibility: initialData?.visibility ?? "PUBLIC",
    status: initialData?.status ?? "ACTIVE",
  });
  const [firstSku, setFirstSku] = useState({
    title: "",
    imageUrl: "",
  });
  const [sale, setSale] = useState({
    amount: "",
    currency: "JPY",
    conditionGrade: "全新",
    platformName: "Mercari",
    observedAt: todayInputValue(),
    note: "",
  });

  const selectedParent = useMemo(
    () => parentOptions.find((item) => item.id === formData.parentItemId),
    [formData.parentItemId, parentOptions]
  );
  const skuTitle = itemType === "GROUP" ? firstSku.title.trim() : formData.title.trim();
  const canRecordSale = !isEditing && skuTitle.length > 0;

  const updateForm = (updates: Partial<typeof formData>) => {
    setError(null);
    setUploadError(null);
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const handleImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    target: "group" | "sku" = "group"
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setUploadError("仅支持 JPEG、PNG、GIF、WebP 图片。");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setUploadError("图片不能超过 5MB。");
      event.target.value = "";
      return;
    }

    setUploadingImage(true);
    setUploadError(null);
    try {
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);
      const response = await fetch("/api/upload", {
        method: "POST",
        body: uploadFormData,
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "上传失败");
      }
      const result = await response.json();
      if (target === "sku") {
        setFirstSku((prev) => ({ ...prev, imageUrl: result.url }));
      } else {
        updateForm({ imageUrl: result.url });
      }
    } catch (uploadErrorValue) {
      setUploadError(uploadErrorValue instanceof Error ? uploadErrorValue.message : "图片上传失败");
    } finally {
      setUploadingImage(false);
      event.target.value = "";
    }
  };

  const handleParentChange = (parentItemId: string) => {
    const parent = parentOptions.find((item) => item.id === parentItemId);
    updateForm({
      parentItemId,
      brand: formData.brand || parent?.brand || "",
      categoryId: formData.categoryId || parent?.categoryId || "",
      category: formData.category || parent?.category || "",
    });
  };

  const createSaleObservation = async (itemId: string) => {
    if (!sale.amount) return { success: true as const, id: "" };
    return addProductIntelligenceObservationAction({
      itemId,
      priceType: "SALE",
      sourceType: "MARKET_SEEN",
      amount: sale.amount,
      currency: sale.currency,
      conditionGrade: sale.conditionGrade,
      platformName: sale.platformName,
      sourceName: sale.platformName,
      observedAt: observedDate(sale.observedAt),
      note: sale.note,
      confidence: "MEDIUM",
      visibility: formData.visibility,
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const payload = {
      ...formData,
      parentItemId: itemType === "VARIANT" ? formData.parentItemId : null,
      model: itemType === "VARIANT" ? "" : formData.model,
    };

    if (initialData) {
      const result = await updateProductIntelligenceAction(initialData.id, payload);
      setLoading(false);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push(`/product-intelligence/${result.id}`);
      router.refresh();
      return;
    }

    let destinationId: string | null = null;
    if (itemType === "GROUP") {
      const groupResult = await createProductIntelligenceAction(payload);
      if (!groupResult.success) {
        setLoading(false);
        setError(groupResult.error);
        return;
      }
      const groupId = groupResult.id;
      destinationId = groupId;

      if (firstSku.title.trim()) {
        const skuResult = await createProductIntelligenceVariantAction({
          parentItemId: groupId,
          title: firstSku.title,
          imageUrl: firstSku.imageUrl,
          visibility: formData.visibility,
        });
        if (!skuResult.success) {
          setLoading(false);
          setError(skuResult.error);
          return;
        }
        const skuId = skuResult.id;
        destinationId = groupId;
        const saleResult = await createSaleObservation(skuId);
        if (!saleResult.success) {
          setLoading(false);
          setError(saleResult.error);
          return;
        }
      }
    } else {
      const skuResult = await createProductIntelligenceVariantAction({
        parentItemId: formData.parentItemId,
        title: formData.title,
        imageUrl: formData.imageUrl,
        tags: formData.tags,
        visibility: formData.visibility,
      });
      if (!skuResult.success) {
        setLoading(false);
        setError(skuResult.error);
        return;
      }
      const skuId = skuResult.id;
      destinationId = formData.parentItemId || skuId;
      const saleResult = await createSaleObservation(skuId);
      if (!saleResult.success) {
        setLoading(false);
        setError(saleResult.error);
        return;
      }
    }

    setLoading(false);
    router.push(`/product-intelligence/${destinationId}`);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-20">
      <Card>
        <CardHeader>
          <CardTitle>{itemType === "GROUP" ? "商品组资料" : "SKU 资料"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-[180px_1fr]">
            <div className="space-y-2">
              <Label>记录方式</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={itemType}
                disabled={isEditing}
                onChange={(event) => setItemType(event.target.value as "GROUP" | "VARIANT")}
              >
                <option value="GROUP">新建商品组</option>
                <option value="VARIANT">挂到已有商品组</option>
              </select>
            </div>
            {itemType === "VARIANT" ? (
              <div className="space-y-2">
                <Label>所属商品组 *</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.parentItemId}
                  onChange={(event) => handleParentChange(event.target.value)}
                >
                  <option value="">选择已有商品组</option>
                  {parentOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                      {item.category ? ` · ${item.category}` : ""}
                      {item._count.childItems > 0 ? ` (${item._count.childItems} 个 SKU)` : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                商品组只负责聚合同一个系列或款式，例如 AJ1 芝加哥
                2015。尺码、角色、长度、颜色尺码组合放到 SKU。
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-[132px_1fr_1fr]">
            <div className="space-y-2">
              <Label>{itemType === "GROUP" ? "商品组图片" : "SKU 图片"}</Label>
              <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md border bg-muted/20 text-xs text-muted-foreground">
                {formData.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={formData.imageUrl}
                    alt="商品图片预览"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  "暂无图片"
                )}
              </div>
            </div>
            <div className="space-y-4 lg:col-span-2">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label>{itemType === "GROUP" ? "商品组名称" : "SKU 名称"} *</Label>
                  <Input
                    value={formData.title}
                    onChange={(event) => updateForm({ title: event.target.value })}
                    placeholder={
                      itemType === "GROUP"
                        ? "例如：Nike AJ1 芝加哥 2015"
                        : "例如：42码 / 小南 / 10cm / 黑色 S"
                    }
                  />
                  {selectedParent ? (
                    <p className="text-xs text-muted-foreground">
                      当前 SKU 归属：{selectedParent.title}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label>品牌</Label>
                  <Input
                    value={formData.brand}
                    onChange={(event) => updateForm({ brand: event.target.value })}
                    placeholder="例如：Nike"
                  />
                </div>
                <div className="space-y-2">
                  <Label>品类{itemType === "GROUP" ? " *" : ""}</Label>
                  <ProductCategoryPicker
                    value={formData.categoryId}
                    legacyValue={formData.category}
                    onChange={(categoryId, category) =>
                      updateForm({
                        categoryId: categoryId ?? "",
                        category,
                      })
                    }
                    placeholder="搜索或选择商品品类"
                    inheritedHint={
                      itemType === "VARIANT" && selectedParent?.categoryId === formData.categoryId
                        ? "已从商品组继承"
                        : undefined
                    }
                  />
                </div>
                {itemType === "GROUP" ? (
                  <div className="space-y-2">
                    <Label>货号/款号</Label>
                    <Input
                      value={formData.model}
                      onChange={(event) => updateForm({ model: event.target.value })}
                      placeholder="例如：555088-101"
                    />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label>图片</Label>
                  <Input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                    disabled={uploadingImage}
                    onChange={(event) => handleImageUpload(event)}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>图片 URL</Label>
                  <Input
                    value={formData.imageUrl}
                    onChange={(event) => updateForm({ imageUrl: event.target.value })}
                    placeholder="也可以粘贴图片 URL"
                  />
                  {uploadError ? <p className="text-xs text-destructive">{uploadError}</p> : null}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {!isEditing && itemType === "GROUP" ? (
        <Card>
          <CardHeader>
            <CardTitle>首个 SKU 和售价观察</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[1fr_160px]">
              <div className="space-y-2">
                <Label>首个 SKU</Label>
                <Input
                  value={firstSku.title}
                  onChange={(event) =>
                    setFirstSku((prev) => ({ ...prev, title: event.target.value }))
                  }
                  placeholder="可空，例如：42码 / 小南 / 10cm / 黑色 S"
                />
              </div>
              <div className="space-y-2">
                <Label>SKU 图片</Label>
                <Input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                  disabled={uploadingImage}
                  onChange={(event) => handleImageUpload(event, "sku")}
                />
              </div>
            </div>
            <PriceObservationFields disabled={!canRecordSale} sale={sale} onChange={setSale} />
            <p className="text-xs text-muted-foreground">
              只想先建商品组可以不填 SKU；填写 SKU 后可以顺手记录一条看到的售价。
            </p>
          </CardContent>
        </Card>
      ) : null}

      {!isEditing && itemType === "VARIANT" ? (
        <Card>
          <CardHeader>
            <CardTitle>看到的售价</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <PriceObservationFields sale={sale} onChange={setSale} />
            <p className="text-xs text-muted-foreground">
              可先只建 SKU，稍后在详情页补充售价；看到时间默认今天。
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>发布设置</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>可见范围</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={formData.visibility}
              onChange={(event) => updateForm({ visibility: event.target.value })}
            >
              <option value="PUBLIC">公开</option>
              <option value="ORGANIZATION">组织内</option>
              <option value="PRIVATE">仅自己</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>状态</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={formData.status}
              onChange={(event) => updateForm({ status: event.target.value })}
            >
              <option value="ACTIVE">展示中</option>
              <option value="HIDDEN">隐藏</option>
              <option value="ARCHIVED">归档</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <details className="rounded-lg border bg-card">
        <summary className="cursor-pointer px-6 py-4 text-sm font-medium">更多信息</summary>
        <div className="grid gap-4 border-t px-6 py-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>默认新旧范围</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={formData.productKind}
              onChange={(event) => updateForm({ productKind: event.target.value })}
            >
              <option value="MIXED">新旧都可能</option>
              <option value="NEW">主要看全新</option>
              <option value="USED">主要看中古/二手</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>标签</Label>
            <Input
              value={formData.tags}
              onChange={(event) => updateForm({ tags: event.target.value })}
              placeholder="逗号分隔，例如：高周转, 日本行情"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>说明</Label>
            <Textarea
              value={formData.description}
              onChange={(event) => updateForm({ description: event.target.value })}
              rows={3}
              placeholder="记录你对这个商品组的经验、风险、适合看的平台等。"
            />
          </div>
        </div>
      </details>

      <div className="sticky bottom-0 z-30 -mx-1 flex items-center justify-between gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        {error ? <p className="min-w-0 text-sm text-destructive">{error}</p> : <span />}
        <div className="flex shrink-0 justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            取消
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function PriceObservationFields({
  sale,
  disabled = false,
  onChange,
}: {
  sale: {
    amount: string;
    currency: string;
    conditionGrade: string;
    platformName: string;
    observedAt: string;
    note: string;
  };
  disabled?: boolean;
  onChange: React.Dispatch<
    React.SetStateAction<{
      amount: string;
      currency: string;
      conditionGrade: string;
      platformName: string;
      observedAt: string;
      note: string;
    }>
  >;
}) {
  return (
    <div className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_110px_130px_150px_150px_1fr]">
      <div className="space-y-1">
        <Label>售价</Label>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={sale.amount}
          disabled={disabled}
          onChange={(event) => onChange((prev) => ({ ...prev, amount: event.target.value }))}
          placeholder="可空"
        />
      </div>
      <div className="space-y-1">
        <Label>币种</Label>
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={sale.currency}
          disabled={disabled}
          onChange={(event) => onChange((prev) => ({ ...prev, currency: event.target.value }))}
        >
          {CURRENCY_OPTIONS.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label>成色</Label>
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={sale.conditionGrade}
          disabled={disabled}
          onChange={(event) =>
            onChange((prev) => ({ ...prev, conditionGrade: event.target.value }))
          }
        >
          {CONDITION_OPTIONS.map((condition) => (
            <option key={condition} value={condition}>
              {condition}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label>平台/来源</Label>
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={sale.platformName}
          disabled={disabled}
          onChange={(event) => onChange((prev) => ({ ...prev, platformName: event.target.value }))}
        >
          {PLATFORM_OPTIONS.map((platform) => (
            <option key={platform} value={platform}>
              {platform}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label>看到时间</Label>
        <Input
          type="date"
          value={sale.observedAt}
          disabled={disabled}
          onChange={(event) => onChange((prev) => ({ ...prev, observedAt: event.target.value }))}
        />
      </div>
      <div className="space-y-1">
        <Label>备注</Label>
        <Input
          value={sale.note}
          disabled={disabled}
          onChange={(event) => onChange((prev) => ({ ...prev, note: event.target.value }))}
          placeholder="可空"
        />
      </div>
    </div>
  );
}
