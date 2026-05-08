"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createPlatform, updatePlatform } from "@/app/actions/platforms";
import { COUNTRIES, CURRENCIES } from "@/lib/i18n";
import { Plus, Trash2 } from "lucide-react";

interface PlatformFormProps {
  storeId: string;
  initialData?: {
    id: string;
    code: string;
    name: string;
    country: string | null;
    defaultFeeRate: string | null;
    defaultCurrency: string | null;
    shippingRules: unknown;
    notes: string | null;
  };
}

interface ShippingRuleForm {
  name: string;
  carrier: string;
  sizeClass: string;
  maxWeightKg: string;
  fee: string;
  currency: string;
  notes: string;
}

function createEmptyShippingRule(currency = "JPY"): ShippingRuleForm {
  return {
    name: "",
    carrier: "",
    sizeClass: "",
    maxWeightKg: "",
    fee: "",
    currency,
    notes: "",
  };
}

export function PlatformForm({ storeId, initialData }: PlatformFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    code: initialData?.code || "",
    name: initialData?.name || "",
    country: initialData?.country || "",
    defaultFeeRate: initialData?.defaultFeeRate || "",
    defaultCurrency: initialData?.defaultCurrency || "",
    notes: initialData?.notes || "",
  });
  const [shippingRules, setShippingRules] = useState<ShippingRuleForm[]>(() => {
    const existingRules = Array.isArray(initialData?.shippingRules)
      ? (initialData.shippingRules as Array<Partial<ShippingRuleForm>>)
      : [];

    if (existingRules.length === 0) {
      return [createEmptyShippingRule(initialData?.defaultCurrency || "JPY")];
    }

    return existingRules.map((rule) => ({
      name: rule.name || "",
      carrier: rule.carrier || "",
      sizeClass: rule.sizeClass || "",
      maxWeightKg: rule.maxWeightKg || "",
      fee: rule.fee || "",
      currency: rule.currency || initialData?.defaultCurrency || "JPY",
      notes: rule.notes || "",
    }));
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        storeId,
        code: formData.code,
        name: formData.name,
        country: formData.country || undefined,
        defaultFeeRate: formData.defaultFeeRate || undefined,
        defaultCurrency: formData.defaultCurrency || undefined,
        shippingRules: shippingRules
          .filter((rule) =>
            [rule.name, rule.carrier, rule.sizeClass, rule.fee, rule.notes].some((value) => value.trim())
          )
          .map((rule) => ({
            ...rule,
            currency: rule.currency || formData.defaultCurrency || "JPY",
          })),
        notes: formData.notes || undefined,
      };

      if (initialData) {
        await updatePlatform(initialData.id, payload);
      } else {
        await createPlatform(payload);
      }

      router.push("/listing/platforms");
      router.refresh();
    } catch (error) {
      console.error("Failed to create platform:", error);
      alert("创建平台失败");
    } finally {
      setLoading(false);
    }
  };

  const feeRatePercent = formData.defaultFeeRate
    ? (parseFloat(formData.defaultFeeRate) * 100).toFixed(1)
    : null;

  const updateShippingRule = (
    index: number,
    field: keyof ShippingRuleForm,
    value: string
  ) => {
    setShippingRules((prev) =>
      prev.map((rule, i) => (i === index ? { ...rule, [field]: value } : rule))
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="code">平台代码</Label>
          <Input
            id="code"
            placeholder="例如：MERCARI, YAHOO, RAKUTEN"
            value={formData.code}
            onChange={(e) =>
              setFormData({ ...formData, code: e.target.value.toUpperCase() })
            }
            required
          />
          <p className="text-xs text-muted-foreground">
            平台的唯一标识符，建议使用大写字母
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">平台名称</Label>
          <Input
            id="name"
            placeholder="例如：Mercari、Yahoo拍卖、乐天"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="country">所属国家</Label>
          <Select
            id="country"
            value={formData.country}
            onChange={(e) =>
              setFormData({ ...formData, country: e.target.value })
            }
          >
            <option value="">选择国家（选填）</option>
            {COUNTRIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="defaultCurrency">默认币种</Label>
          <Select
            id="defaultCurrency"
            value={formData.defaultCurrency}
            onChange={(e) =>
              setFormData({ ...formData, defaultCurrency: e.target.value })
            }
          >
            <option value="">选择币种（选填）</option>
            {CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="defaultFeeRate">默认平台费率</Label>
          <Input
            id="defaultFeeRate"
            type="number"
            step="0.0001"
            min="0"
            max="1"
            placeholder="例如：0.10 (10%)"
            value={formData.defaultFeeRate}
            onChange={(e) =>
              setFormData({ ...formData, defaultFeeRate: e.target.value })
            }
          />
          {feeRatePercent && (
            <p className="text-xs text-muted-foreground">
              即 {feeRatePercent}% 的平台抽成
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Label>配送规则模板</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              日本平台通常按配送服务、尺寸、重量和平台合作快递计算运费；这里保存规则模板，上架时再按实际包装选择或填写固定运费。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setShippingRules((prev) => [
                ...prev,
                createEmptyShippingRule(formData.defaultCurrency || "JPY"),
              ])
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            添加规则
          </Button>
        </div>

        <div className="space-y-3">
          {shippingRules.map((rule, index) => (
            <div key={index} className="rounded-lg border bg-white/40 p-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium">规则 {index + 1}</p>
                {shippingRules.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() =>
                      setShippingRules((prev) => prev.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    删除
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor={`rule-name-${index}`}>规则名称</Label>
                  <Input
                    id={`rule-name-${index}`}
                    placeholder="例如：ネコポス / 60尺寸"
                    value={rule.name}
                    onChange={(e) => updateShippingRule(index, "name", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`rule-carrier-${index}`}>配送方式/快递</Label>
                  <Input
                    id={`rule-carrier-${index}`}
                    placeholder="例如：Yamato / 日本邮政"
                    value={rule.carrier}
                    onChange={(e) => updateShippingRule(index, "carrier", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`rule-size-${index}`}>尺寸/规格</Label>
                  <Input
                    id={`rule-size-${index}`}
                    placeholder="例如：60尺寸 / A4厚3cm"
                    value={rule.sizeClass}
                    onChange={(e) => updateShippingRule(index, "sizeClass", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`rule-weight-${index}`}>重量上限</Label>
                  <Input
                    id={`rule-weight-${index}`}
                    placeholder="例如：2kg"
                    value={rule.maxWeightKg}
                    onChange={(e) => updateShippingRule(index, "maxWeightKg", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`rule-fee-${index}`}>参考运费</Label>
                  <Input
                    id={`rule-fee-${index}`}
                    type="number"
                    step="1"
                    min="0"
                    placeholder="例如：750"
                    value={rule.fee}
                    onChange={(e) => updateShippingRule(index, "fee", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`rule-currency-${index}`}>币种</Label>
                  <Select
                    id={`rule-currency-${index}`}
                    value={rule.currency}
                    onChange={(e) => updateShippingRule(index, "currency", e.target.value)}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="mt-3 space-y-1">
                <Label htmlFor={`rule-notes-${index}`}>适用条件/备注</Label>
                <Input
                  id={`rule-notes-${index}`}
                  placeholder="例如：三边合计 60cm 内；匿名配送；买家/卖家承担均可"
                  value={rule.notes}
                  onChange={(e) => updateShippingRule(index, "notes", e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">备注</Label>
        <Textarea
          id="notes"
          placeholder="平台的额外信息、注意事项..."
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={3}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? "保存中..." : initialData ? "保存平台" : "创建平台"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
        >
          取消
        </Button>
      </div>
    </form>
  );
}
