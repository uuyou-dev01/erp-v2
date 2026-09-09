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
import { createClientId } from "@/lib/client-id";

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
  const [createIdempotencyKey] = useState(() => createClientId("resale-create"));
  const sourceOffer = supplyOffer ?? initialData?.supplyOffer;
  const offerItems = sourceOffer?.items ?? [];
  const initialOfferItem =
    offerItems.find((item) => item.id === initialData?.supplyOfferItemId) ?? offerItems[0];
  const initialPlatform =
    platforms.find((platform) => platform.id === initialData?.platformId) ?? platforms[0];
  const sourceAgreementRule =
    sourceOffer?.agreementRule && typeof sourceOffer.agreementRule === "object"
      ? (sourceOffer.agreementRule as { kind?: string; profitDeductions?: string[] })
      : null;
  const waitsForActualShippingFee =
    sourceAgreementRule?.kind === "PROFIT_PERCENT" &&
    sourceAgreementRule.profitDeductions?.includes("SHIPPING_FEE");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    supplyOfferItemId: initialData?.supplyOfferItemId ?? initialOfferItem?.id ?? "",
    platformId: initialData?.platformId ?? initialPlatform?.id ?? "",
    title: initialData?.title ?? initialOfferItem?.title ?? sourceOffer?.title ?? "",
    externalListingNo: initialData?.externalListingNo ?? "",
    targetPrice: initialData?.targetPrice ?? "",
    currency:
      initialData?.currency ?? initialPlatform?.defaultCurrency ?? sourceOffer?.currency ?? "JPY",
    quantityPlanned: initialData?.quantityPlanned ?? "1",
    supplyUnitPrice:
      initialData?.supplyUnitPrice ?? initialOfferItem?.unitPrice ?? sourceOffer?.unitPrice ?? "",
    supplyCurrency:
      initialData?.supplyCurrency ?? initialOfferItem?.currency ?? sourceOffer?.currency ?? "",
    commissionRate: initialData?.commissionRate ?? sourceOffer?.commissionRate ?? "",
    commissionType: initialData?.commissionType ?? sourceOffer?.commissionType ?? "MARGIN",
    commissionFixedAmount:
      initialData?.commissionFixedAmount ?? sourceOffer?.commissionFixedAmount ?? "",
    dropshipFee: initialData?.dropshipFee ?? sourceOffer?.dropshipFee ?? "",
    platformFeeRate: initialData?.platformFeeRate ?? initialPlatform?.defaultFeeRate ?? "",
    fulfillmentMode:
      initialData?.fulfillmentMode ?? sourceOffer?.fulfillmentMode ?? "SUPPLIER_SHIPS",
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
        supplyOfferItemId: formData.supplyOfferItemId || undefined,
        platformId: formData.platformId,
        title: formData.title,
        externalListingNo: formData.externalListingNo || undefined,
        targetPrice: formData.targetPrice,
        currency: formData.currency || undefined,
        quantityPlanned: formData.quantityPlanned || undefined,
        supplyUnitPrice: formData.supplyUnitPrice || undefined,
        supplyCurrency: formData.supplyCurrency || undefined,
        commissionRate: formData.commissionRate || undefined,
        commissionType: formData.commissionType || undefined,
        commissionFixedAmount: formData.commissionFixedAmount || undefined,
        dropshipFee: formData.dropshipFee || undefined,
        platformFeeRate: formData.platformFeeRate || undefined,
        fulfillmentMode: formData.fulfillmentMode || undefined,
        notes: formData.notes || undefined,
        idempotencyKey: initialData ? undefined : createIdempotencyKey,
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
            经营主体共享库存 · 供货价 {sourceOffer.currency ?? ""} {sourceOffer.unitPrice ?? "-"} ·
            货盘总余量{" "}
            {Math.max(
              Number(sourceOffer.availableQty) -
                Number("reservedQty" in sourceOffer ? (sourceOffer.reservedQty ?? 0) : 0),
              0
            )}
          </div>
          <div className="mt-2 rounded bg-blue-50 px-3 py-2 text-xs text-blue-800">
            创建上架不会占用库存；实际成交时才原子锁货，因此同一商品可以在多个账号同时曝光。
          </div>
        </div>
      )}

      {offerItems.length > 0 ? (
        <div className="space-y-2">
          <Label htmlFor="supplyOfferItemId">代卖商品</Label>
          <Select
            id="supplyOfferItemId"
            value={formData.supplyOfferItemId}
            onChange={(event) => {
              const item = offerItems.find((candidate) => candidate.id === event.target.value);
              updateField({
                supplyOfferItemId: event.target.value,
                title: item?.title ?? formData.title,
                supplyUnitPrice: item?.unitPrice ?? sourceOffer?.unitPrice ?? "",
                supplyCurrency: item?.currency ?? sourceOffer?.currency ?? "",
              });
            }}
            required
          >
            <option value="">请选择货盘商品</option>
            {offerItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} · 明细总余量{" "}
                {Math.max(Number(item.quantityAvailable) - Number(item.quantityReserved), 0)}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            代卖记录会绑定到这一条货盘明细，成交时只锁定对应标准商品或指定单件。
          </p>
        </div>
      ) : null}

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

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="targetPrice">代卖售价</Label>
          <Input
            id="targetPrice"
            type="number"
            min="0"
            step="0.01"
            value={formData.targetPrice}
            onChange={(event) => updateField({ targetPrice: event.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">销售币种</Label>
          <Input
            id="currency"
            value={formData.currency}
            onChange={(event) => updateField({ currency: event.target.value.toUpperCase() })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quantityPlanned">计划数量</Label>
          <Input
            id="quantityPlanned"
            type="number"
            min="0"
            step="0.01"
            value={formData.quantityPlanned}
            onChange={(event) => updateField({ quantityPlanned: event.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="externalListingNo">外部编号</Label>
          <Input
            id="externalListingNo"
            value={formData.externalListingNo}
            onChange={(event) => updateField({ externalListingNo: event.target.value })}
            placeholder="平台 Listing ID"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="supplyUnitPrice">双方已确认的供货单价</Label>
          <Input id="supplyUnitPrice" type="number" value={formData.supplyUnitPrice} disabled />
        </div>
        <div className="space-y-2">
          <Label htmlFor="supplyCurrency">供货币种</Label>
          <Input id="supplyCurrency" value={formData.supplyCurrency} disabled />
        </div>
        <div className="space-y-2">
          <Label htmlFor="platformFeeRate">平台费率</Label>
          <Input
            id="platformFeeRate"
            type="number"
            min="0"
            max="1"
            step="0.0001"
            value={formData.platformFeeRate}
            onChange={(event) => updateField({ platformFeeRate: event.target.value })}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium text-blue-950">
              合作约定（版本 {sourceOffer?.agreementVersion ?? "-"}）
            </p>
            <p className="mt-1 text-xs text-blue-800">
              创建代卖上架表示接受这一版本；系统模板只用于试算。
            </p>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs text-blue-800">
            {formData.commissionType === "MANUAL" ? "成交后双方确认" : "可由系统试算"}
          </span>
        </div>
        <p className="whitespace-pre-wrap text-sm text-blue-950">
          {sourceOffer?.agreementTerms || "货盘尚未写明合作约定"}
        </p>
        {formData.dropshipFee ? (
          <p className="text-xs text-blue-800">
            约定代发服务费：{sourceOffer?.dropshipFeeCurrency || sourceOffer?.currency || ""}{" "}
            {formData.dropshipFee} / 件
          </p>
        ) : null}
        {waitsForActualShippingFee ? (
          <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-900">
            约定包含“扣本单实际运费”。运费尚未发生，本页不会把 0
            当成实际运费计算精确分成；发货后按实际金额结算。
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="fulfillmentMode">卖出后谁发货（沿用货盘约定）</Label>
          <Select id="fulfillmentMode" value={formData.fulfillmentMode} disabled>
            <option value="SUPPLIER_SHIPS">货主负责发货</option>
            <option value="THIRD_PARTY_SHIPS">指定服务方负责发货</option>
            <option value="RESELLER_SHIPS">代卖方拿货后发货</option>
            <option value="CONTACT_ONLY">成交后双方确认</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">备注</Label>
          <Textarea
            id="notes"
            rows={3}
            value={formData.notes}
            onChange={(event) => updateField({ notes: event.target.value })}
          />
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
