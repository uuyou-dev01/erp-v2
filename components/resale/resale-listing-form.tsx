"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createResaleListingAction,
  updateResaleListingAction,
  type SerializedResaleListing,
} from "@/app/actions/resale-listings";
import type { SerializedSupplyOffer } from "@/app/actions/supply-offers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type PlatformOption = {
  id: string;
  code: string;
  name: string;
  defaultCurrency: string | null;
  defaultFeeRate: string | null;
};

export function ResaleListingForm({
  storeId,
  platforms,
  supplyOffer,
  initialData,
}: {
  storeId: string;
  platforms: PlatformOption[];
  supplyOffer?: SerializedSupplyOffer;
  initialData?: SerializedResaleListing;
}) {
  const router = useRouter();
  const sourceOffer = supplyOffer ?? initialData?.supplyOffer;
  const initialPlatform =
    platforms.find((platform) => platform.id === initialData?.platformId) ?? platforms[0];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    platformId: initialData?.platformId ?? initialPlatform?.id ?? "",
    title: initialData?.title ?? sourceOffer?.title ?? "",
    externalListingNo: initialData?.externalListingNo ?? "",
    targetPrice: initialData?.targetPrice ?? "",
    currency: initialData?.currency ?? initialPlatform?.defaultCurrency ?? sourceOffer?.currency ?? "JPY",
    quantityPlanned: initialData?.quantityPlanned ?? "1",
    supplyUnitPrice: initialData?.supplyUnitPrice ?? sourceOffer?.unitPrice ?? "",
    supplyCurrency: initialData?.supplyCurrency ?? sourceOffer?.currency ?? "",
    commissionRate: initialData?.commissionRate ?? sourceOffer?.commissionRate ?? "",
    platformFeeRate: initialData?.platformFeeRate ?? initialPlatform?.defaultFeeRate ?? "",
    fulfillmentMode: initialData?.fulfillmentMode ?? sourceOffer?.fulfillmentMode ?? "SUPPLIER_SHIPS",
    notes: initialData?.notes ?? "",
  });

  const updateField = (updates: Partial<typeof formData>) => {
    setError(null);
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload = {
        storeId,
        platformId: formData.platformId,
        title: formData.title,
        externalListingNo: formData.externalListingNo || undefined,
        targetPrice: formData.targetPrice,
        currency: formData.currency || undefined,
        quantityPlanned: formData.quantityPlanned || undefined,
        supplyUnitPrice: formData.supplyUnitPrice || undefined,
        supplyCurrency: formData.supplyCurrency || undefined,
        commissionRate: formData.commissionRate || undefined,
        platformFeeRate: formData.platformFeeRate || undefined,
        fulfillmentMode: formData.fulfillmentMode || undefined,
        notes: formData.notes || undefined,
      };

      const result = initialData
        ? await updateResaleListingAction(initialData.id, payload)
        : await createResaleListingAction({
            ...payload,
            supplyOfferId: sourceOffer?.id ?? "",
          });

      if (!result.success) {
        setError(result.error);
        return;
      }

      router.push(`/resale/${result.id}`);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "保存代卖上架失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      {sourceOffer && (
        <div className="rounded-md border border-border/60 bg-muted/30 p-4 text-sm">
          <div className="font-medium">来源货盘：{sourceOffer.title}</div>
          <div className="mt-1 text-muted-foreground">
            供给方 {sourceOffer.ownerPartner?.name ?? "本店自有"} · 供货价 {sourceOffer.currency ?? ""} {sourceOffer.unitPrice ?? "-"} · 可供 {sourceOffer.availableQty}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="platformId">销售平台</Label>
          <Select
            id="platformId"
            value={formData.platformId}
            onChange={(event) => {
              const nextPlatform = platforms.find((platform) => platform.id === event.target.value);
              updateField({
                platformId: event.target.value,
                currency: nextPlatform?.defaultCurrency || formData.currency,
                platformFeeRate: nextPlatform?.defaultFeeRate || formData.platformFeeRate,
              });
            }}
            required
          >
            {platforms.map((platform) => (
              <option key={platform.id} value={platform.id}>
                {platform.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="title">代卖标题</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(event) => updateField({ title: event.target.value })}
            required
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="targetPrice">代卖售价</Label>
          <Input id="targetPrice" type="number" min="0" step="0.01" value={formData.targetPrice} onChange={(event) => updateField({ targetPrice: event.target.value })} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">销售币种</Label>
          <Input id="currency" value={formData.currency} onChange={(event) => updateField({ currency: event.target.value.toUpperCase() })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quantityPlanned">计划数量</Label>
          <Input id="quantityPlanned" type="number" min="0" step="0.01" value={formData.quantityPlanned} onChange={(event) => updateField({ quantityPlanned: event.target.value })} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="externalListingNo">外部编号</Label>
          <Input id="externalListingNo" value={formData.externalListingNo} onChange={(event) => updateField({ externalListingNo: event.target.value })} placeholder="平台 Listing ID" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="supplyUnitPrice">供货单价</Label>
          <Input id="supplyUnitPrice" type="number" min="0" step="0.01" value={formData.supplyUnitPrice} onChange={(event) => updateField({ supplyUnitPrice: event.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="supplyCurrency">供货币种</Label>
          <Input id="supplyCurrency" value={formData.supplyCurrency} onChange={(event) => updateField({ supplyCurrency: event.target.value.toUpperCase() })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="commissionRate">佣金比例</Label>
          <Input id="commissionRate" type="number" min="0" max="1" step="0.0001" value={formData.commissionRate} onChange={(event) => updateField({ commissionRate: event.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="platformFeeRate">平台费率</Label>
          <Input id="platformFeeRate" type="number" min="0" max="1" step="0.0001" value={formData.platformFeeRate} onChange={(event) => updateField({ platformFeeRate: event.target.value })} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="fulfillmentMode">履约方式</Label>
          <Select id="fulfillmentMode" value={formData.fulfillmentMode} onChange={(event) => updateField({ fulfillmentMode: event.target.value })}>
            <option value="SUPPLIER_SHIPS">供给方代发</option>
            <option value="PLATFORM_SHIPS">平台仓代发</option>
            <option value="SELF_PICKUP">自提/线下交接</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">备注</Label>
          <Textarea id="notes" rows={3} value={formData.notes} onChange={(event) => updateField({ notes: event.target.value })} />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          取消
        </Button>
        <Button type="submit" disabled={loading || platforms.length === 0}>
          {loading ? "保存中..." : initialData ? "保存代卖" : "创建代卖草稿"}
        </Button>
      </div>
    </form>
  );
}
