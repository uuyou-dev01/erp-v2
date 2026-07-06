"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createSupplyOfferAction,
  updateSupplyOfferAction,
  type SupplyOfferItemInput,
  type SupplyOfferVisibilityStoreOption,
} from "@/app/actions/supply-offers";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";

type PartnerOption = {
  id: string;
  name: string;
  defaultCurrency: string | null;
};

type InitialOffer = {
  id: string;
  title: string;
  description: string | null;
  ownerPartnerId: string | null;
  visibility: string;
  unitPrice: string | null;
  currency: string | null;
  commissionRate: string | null;
  fulfillmentMode: string;
  shipFromLocation: string | null;
  etaDays: number | null;
  minOrderQty: string | null;
  maxOrderQty: string | null;
  visibilityRules: Array<{
    viewerStoreId: string | null;
  }>;
  items: Array<{
    id: string;
    title: string;
    variantCode: string | null;
    quantityAvailable: string;
    unitPrice: string | null;
    currency: string | null;
    notes: string | null;
  }>;
};

function emptyItem(currency = "JPY"): SupplyOfferItemInput {
  return {
    title: "",
    variantCode: "",
    quantityAvailable: "1",
    unitPrice: "",
    currency,
    notes: "",
  };
}

export function SupplyOfferForm({
  storeId,
  partners,
  visibilityStoreOptions,
  initialData,
}: {
  storeId: string;
  partners: PartnerOption[];
  visibilityStoreOptions: SupplyOfferVisibilityStoreOption[];
  initialData?: InitialOffer;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: initialData?.title ?? "",
    description: initialData?.description ?? "",
    ownerPartnerId: initialData?.ownerPartnerId ?? "",
    visibility: initialData?.visibility ?? "PRIVATE",
    unitPrice: initialData?.unitPrice ?? "",
    currency: initialData?.currency ?? "JPY",
    commissionRate: initialData?.commissionRate ?? "",
    fulfillmentMode: initialData?.fulfillmentMode ?? "SUPPLIER_SHIPS",
    shipFromLocation: initialData?.shipFromLocation ?? "",
    etaDays: initialData?.etaDays?.toString() ?? "",
    minOrderQty: initialData?.minOrderQty ?? "",
    maxOrderQty: initialData?.maxOrderQty ?? "",
  });
  const [items, setItems] = useState<SupplyOfferItemInput[]>(
    initialData?.items.length
      ? initialData.items.map((item) => ({
          id: item.id,
          title: item.title,
          variantCode: item.variantCode ?? "",
          quantityAvailable: item.quantityAvailable,
          unitPrice: item.unitPrice ?? "",
          currency: item.currency ?? initialData.currency ?? "JPY",
          notes: item.notes ?? "",
        }))
      : [emptyItem(initialData?.currency ?? "JPY")]
  );
  const [viewerStoreIds, setViewerStoreIds] = useState<string[]>(
    initialData?.visibilityRules
      .map((rule) => rule.viewerStoreId)
      .filter((id): id is string => Boolean(id)) ?? []
  );

  const updateField = (updates: Partial<typeof formData>) => {
    setError(null);
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const updateItem = (index: number, updates: Partial<SupplyOfferItemInput>) => {
    setError(null);
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...updates } : item)));
  };

  const toggleViewerStore = (storeOptionId: string, checked: boolean) => {
    setError(null);
    setViewerStoreIds((prev) =>
      checked
        ? [...new Set([...prev, storeOptionId])]
        : prev.filter((id) => id !== storeOptionId)
    );
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload = {
        storeId,
        ...formData,
        ownerPartnerId: formData.ownerPartnerId || undefined,
        description: formData.description || undefined,
        unitPrice: formData.unitPrice || undefined,
        currency: formData.currency || undefined,
        commissionRate: formData.commissionRate || undefined,
        shipFromLocation: formData.shipFromLocation || undefined,
        etaDays: formData.etaDays || undefined,
        minOrderQty: formData.minOrderQty || undefined,
        maxOrderQty: formData.maxOrderQty || undefined,
        viewerStoreIds: formData.visibility === "PARTNER_ONLY" ? viewerStoreIds : [],
        items: items.map((item) => ({
          ...item,
          currency: item.currency || formData.currency || undefined,
          unitPrice: item.unitPrice || formData.unitPrice || undefined,
        })),
      };

      const result = initialData
        ? await updateSupplyOfferAction(initialData.id, payload)
        : await createSupplyOfferAction(payload);

      if (!result.success) {
        setError(result.error);
        return;
      }

      router.push(`/marketplace/my-offers/${result.id}`);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "保存货盘失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">货盘标题</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(event) => updateField({ title: event.target.value })}
            placeholder="例如：日本中古相机一批"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ownerPartnerId">供给方</Label>
          <Select
            id="ownerPartnerId"
            value={formData.ownerPartnerId}
            onChange={(event) => updateField({ ownerPartnerId: event.target.value })}
          >
            <option value="">本店自有供给</option>
            {partners.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="visibility">可见范围</Label>
          <Select
            id="visibility"
            value={formData.visibility}
            onChange={(event) => updateField({ visibility: event.target.value })}
          >
            <option value="PRIVATE">私有</option>
            <option value="PARTNER_ONLY">合作方可见</option>
            <option value="PUBLIC">公开</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="fulfillmentMode">履约方式</Label>
          <Select
            id="fulfillmentMode"
            value={formData.fulfillmentMode}
            onChange={(event) => updateField({ fulfillmentMode: event.target.value })}
          >
            <option value="SUPPLIER_SHIPS">供给方代发</option>
            <option value="PLATFORM_SHIPS">平台仓代发</option>
            <option value="SELF_PICKUP">自提/线下交接</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">结算币种</Label>
          <Input
            id="currency"
            value={formData.currency}
            onChange={(event) => updateField({ currency: event.target.value.toUpperCase() })}
            placeholder="JPY"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="unitPrice">默认供货价</Label>
          <Input
            id="unitPrice"
            type="number"
            step="0.01"
            min="0"
            value={formData.unitPrice}
            onChange={(event) => updateField({ unitPrice: event.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="commissionRate">默认佣金比例</Label>
          <Input
            id="commissionRate"
            type="number"
            step="0.0001"
            min="0"
            max="1"
            value={formData.commissionRate}
            onChange={(event) => updateField({ commissionRate: event.target.value })}
            placeholder="0.10"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="shipFromLocation">发货地</Label>
          <Input
            id="shipFromLocation"
            value={formData.shipFromLocation}
            onChange={(event) => updateField({ shipFromLocation: event.target.value })}
            placeholder="东京仓 / 上海仓"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="etaDays">预计发货天数</Label>
          <Input
            id="etaDays"
            type="number"
            min="0"
            value={formData.etaDays}
            onChange={(event) => updateField({ etaDays: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="minOrderQty">起订量</Label>
          <Input
            id="minOrderQty"
            type="number"
            step="0.01"
            min="0"
            value={formData.minOrderQty}
            onChange={(event) => updateField({ minOrderQty: event.target.value })}
          />
        </div>
      </div>

      {formData.visibility === "PARTNER_ONLY" && (
        <div className="space-y-3 rounded-lg border border-border/60 p-4">
          <div>
            <Label>指定可见店铺</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              只有被授权的店铺可以在货盘市场看到这条供给。
            </p>
          </div>
          {visibilityStoreOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              当前账号没有其他可授权店铺。可以先在店铺管理中添加店铺并分配访问权限。
            </p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {visibilityStoreOptions.map((storeOption) => (
                <Checkbox
                  key={storeOption.id}
                  id={`viewer-store-${storeOption.id}`}
                  label={`${storeOption.name} (${storeOption.code})`}
                  checked={viewerStoreIds.includes(storeOption.id)}
                  onChange={(event) => toggleViewerStore(storeOption.id, event.target.checked)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="description">货盘说明</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(event) => updateField({ description: event.target.value })}
          placeholder="描述品类、成色、履约限制、结算说明"
          rows={4}
        />
      </div>

      <div className="space-y-3 rounded-lg border border-border/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label>货盘明细</Label>
            <p className="mt-1 text-xs text-muted-foreground">至少保留一条明细；后续阶段这里会连接本店库存或外部供给 SKU。</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setItems((prev) => [...prev, emptyItem(formData.currency)])}>
            <Plus className="h-4 w-4" />
            添加
          </Button>
        </div>

        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={index} className="grid gap-3 rounded-md border border-border/60 p-3 md:grid-cols-[1.4fr_0.8fr_0.7fr_0.8fr_auto]">
              <Input
                value={item.title}
                onChange={(event) => updateItem(index, { title: event.target.value })}
                placeholder="商品名称"
                required
              />
              <Input
                value={item.variantCode || ""}
                onChange={(event) => updateItem(index, { variantCode: event.target.value })}
                placeholder="规格/货号"
              />
              <Input
                type="number"
                step="0.01"
                min="0"
                value={item.quantityAvailable}
                onChange={(event) => updateItem(index, { quantityAvailable: event.target.value })}
                placeholder="数量"
                required
              />
              <Input
                type="number"
                step="0.01"
                min="0"
                value={item.unitPrice || ""}
                onChange={(event) => updateItem(index, { unitPrice: event.target.value })}
                placeholder="单价"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={items.length === 1}
                onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                aria-label="删除明细"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          取消
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "保存中..." : initialData ? "保存货盘" : "创建草稿"}
        </Button>
      </div>
    </form>
  );
}
