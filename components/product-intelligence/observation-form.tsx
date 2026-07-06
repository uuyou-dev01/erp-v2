"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addProductIntelligenceObservationAction,
  deleteProductIntelligenceObservationAction,
} from "@/app/actions/product-intelligence";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PLATFORM_OPTIONS = ["Mercari", "Yahoo Auction", "eBay", "闲鱼", "淘宝", "1688", "线下店", "朋友报价", "货盘", "其他"];
const CURRENCY_OPTIONS = ["JPY", "CNY", "USD", "EUR"];
const CONDITION_OPTIONS = ["全新", "二手 S", "二手 A", "二手 B", "二手 C", "瑕疵/维修", "未确认"];

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export function ObservationForm({
  itemId,
  variantOptions = [],
  defaultTargetItemId,
  baseItemLabel = "商品组本身",
  onCancel,
  onSuccess,
}: {
  itemId: string;
  variantOptions?: Array<{ id: string; title: string }>;
  defaultTargetItemId?: string;
  baseItemLabel?: string | null;
  onCancel?: () => void;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    targetItemId: defaultTargetItemId ?? variantOptions[0]?.id ?? itemId,
    priceType: "SALE",
    amount: "",
    currency: "JPY",
    conditionGrade: "全新",
    platformName: "Mercari",
    observedAt: todayInputValue(),
    note: "",
    visibility: "PUBLIC",
  });

  const updateForm = (updates: Partial<typeof formData>) => {
    setError(null);
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await addProductIntelligenceObservationAction({
      itemId: formData.targetItemId,
      priceType: formData.priceType,
      sourceType: "MARKET_SEEN",
      amount: formData.amount,
      currency: formData.currency,
      conditionGrade: formData.conditionGrade,
      platformName: formData.platformName,
      sourceName: formData.platformName,
      observedAt: new Date(`${formData.observedAt || todayInputValue()}T00:00:00.000`),
      confidence: "MEDIUM",
      visibility: formData.visibility,
      note: formData.note,
    });
    setLoading(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setFormData((prev) => ({ ...prev, amount: "", note: "", observedAt: todayInputValue() }));
    onSuccess?.();
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>记录到</Label>
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={formData.targetItemId}
          onChange={(event) => updateForm({ targetItemId: event.target.value })}
        >
          {baseItemLabel ? <option value={itemId}>{baseItemLabel}</option> : null}
          {variantOptions.map((variant) => (
            <option key={variant.id} value={variant.id}>
              {variant.title}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label>价格类型</Label>
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={formData.priceType}
          onChange={(event) => updateForm({ priceType: event.target.value })}
        >
          <option value="SALE">售价</option>
          <option value="RESALE">代卖挂牌价</option>
          <option value="OFFER">报价</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label>金额 *</Label>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={formData.amount}
          onChange={(event) => updateForm({ amount: event.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label>币种</Label>
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={formData.currency}
          onChange={(event) => updateForm({ currency: event.target.value })}
        >
          {CURRENCY_OPTIONS.map((currency) => (
            <option key={currency} value={currency}>{currency}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label>状态/成色</Label>
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={formData.conditionGrade}
          onChange={(event) => updateForm({ conditionGrade: event.target.value })}
        >
          {CONDITION_OPTIONS.map((condition) => (
            <option key={condition} value={condition}>{condition}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label>平台/来源</Label>
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={formData.platformName}
          onChange={(event) => updateForm({ platformName: event.target.value })}
        >
          {PLATFORM_OPTIONS.map((platform) => (
            <option key={platform} value={platform}>{platform}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label>看到时间</Label>
        <Input
          type="date"
          value={formData.observedAt}
          onChange={(event) => updateForm({ observedAt: event.target.value })}
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label>备注</Label>
        <Input
          value={formData.note}
          onChange={(event) => updateForm({ note: event.target.value })}
          placeholder="例如：无盒、轻微划痕、鞋底磨损、配件缺失"
        />
      </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t pt-4">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            取消
          </Button>
        ) : null}
        <Button type="submit" disabled={loading}>
          {loading ? "添加中..." : "添加观察"}
        </Button>
      </div>
    </form>
  );
}

export function DeleteObservationButton({
  id,
  isOwner,
}: {
  id: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!isOwner) return null;

  const handleDelete = async () => {
    if (!confirm("确认删除这条观察记录？")) return;
    setLoading(true);
    setError(null);
    const result = await deleteProductIntelligenceObservationAction(id);
    setLoading(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="ghost" size="sm" onClick={handleDelete} disabled={loading}>
        删除
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
