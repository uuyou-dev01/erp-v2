"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createPartnerAction,
  updatePartnerAction,
  upsertTradingRelationshipAction,
} from "@/app/actions/partners";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type InitialPartner = {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  defaultCurrency: string | null;
  notes: string | null;
  organization: { id: string; name: string; code: string } | null;
  tradingRelationships: Array<{
    relationshipType: string;
    visibilityScope: string;
    status: string;
    commissionRate: string | null;
    serviceFeeRate: string | null;
    settlementCurrency: string | null;
    notes: string | null;
  }>;
};

export function PartnerForm({
  storeId,
  initialData,
}: {
  storeId: string;
  initialData?: InitialPartner;
}) {
  const router = useRouter();
  const primaryRelationship = initialData?.tradingRelationships[0];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    code: initialData?.code ?? "",
    name: initialData?.name ?? "",
    type: initialData?.type ?? "SUPPLIER",
    status: initialData?.status ?? "ACTIVE",
    contactName: initialData?.contactName ?? "",
    contactEmail: initialData?.contactEmail ?? "",
    contactPhone: initialData?.contactPhone ?? "",
    defaultCurrency: initialData?.defaultCurrency ?? "JPY",
    notes: initialData?.notes ?? "",
    organizationCode: initialData?.organization?.code ?? "",
    relationshipType: primaryRelationship?.relationshipType ?? "SUPPLY",
    visibilityScope: primaryRelationship?.visibilityScope ?? "PRIVATE",
    relationshipStatus: primaryRelationship?.status ?? "ACTIVE",
    commissionRate: primaryRelationship?.commissionRate ?? "",
    serviceFeeRate: primaryRelationship?.serviceFeeRate ?? "",
    settlementCurrency: primaryRelationship?.settlementCurrency ?? initialData?.defaultCurrency ?? "JPY",
    relationshipNotes: primaryRelationship?.notes ?? "",
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
      const partnerPayload = {
        storeId,
        code: formData.code,
        name: formData.name,
        type: formData.type,
        status: formData.status,
        contactName: formData.contactName || undefined,
        contactEmail: formData.contactEmail || undefined,
        contactPhone: formData.contactPhone || undefined,
        defaultCurrency: formData.defaultCurrency || undefined,
        notes: formData.notes || undefined,
        organizationCode: formData.organizationCode || undefined,
      };

      const partnerResult = initialData
        ? await updatePartnerAction(initialData.id, partnerPayload)
        : await createPartnerAction({
            ...partnerPayload,
            relationshipType: formData.relationshipType,
            visibilityScope: formData.visibilityScope,
            commissionRate: formData.commissionRate || undefined,
            serviceFeeRate: formData.serviceFeeRate || undefined,
            settlementCurrency: formData.settlementCurrency || undefined,
            relationshipNotes: formData.relationshipNotes || undefined,
          });

      if (!partnerResult.success) {
        setError(partnerResult.error);
        return;
      }

      if (initialData) {
        const relationshipResult = await upsertTradingRelationshipAction({
          storeId,
          partnerId: initialData.id,
          relationshipType: formData.relationshipType,
          visibilityScope: formData.visibilityScope,
          status: formData.relationshipStatus,
          commissionRate: formData.commissionRate || undefined,
          serviceFeeRate: formData.serviceFeeRate || undefined,
          settlementCurrency: formData.settlementCurrency || undefined,
          notes: formData.relationshipNotes || undefined,
        });
        if (!relationshipResult.success) {
          setError(relationshipResult.error);
          return;
        }
      }

      router.push("/settings/partners");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "保存合作方失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="partner-code">代码</Label>
          <Input
            id="partner-code"
            value={formData.code}
            onChange={(event) => updateField({ code: event.target.value.toUpperCase() })}
            placeholder="SUP-JP-001"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="partner-name">名称</Label>
          <Input
            id="partner-name"
            value={formData.name}
            onChange={(event) => updateField({ name: event.target.value })}
            placeholder="合作方名称"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="partner-organization-code">关联经营主体代码（可选）</Label>
          <Input
            id="partner-organization-code"
            value={formData.organizationCode}
            onChange={(event) =>
              updateField({ organizationCode: event.target.value.toUpperCase() })
            }
            placeholder="由合作方提供，例如 FRIEND-B"
          />
          <p className="text-xs text-muted-foreground">关联后，定向货盘才能被对方账号看到；供应商无需登录时可留空。</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="partner-type">类型</Label>
          <Select id="partner-type" value={formData.type} onChange={(event) => updateField({ type: event.target.value })}>
            <option value="SUPPLIER">供货方</option>
            <option value="RESELLER">代卖方</option>
            <option value="FULFILLER">代发方</option>
            <option value="CHANNEL">渠道方</option>
            <option value="OTHER">其他</option>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="contact-name">联系人</Label>
          <Input id="contact-name" value={formData.contactName} onChange={(event) => updateField({ contactName: event.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-email">邮箱</Label>
          <Input id="contact-email" type="email" value={formData.contactEmail} onChange={(event) => updateField({ contactEmail: event.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-phone">电话</Label>
          <Input id="contact-phone" value={formData.contactPhone} onChange={(event) => updateField({ contactPhone: event.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="default-currency">默认币种</Label>
          <Input id="default-currency" value={formData.defaultCurrency} onChange={(event) => updateField({ defaultCurrency: event.target.value.toUpperCase() })} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <div className="space-y-2">
          <Label htmlFor="relationship-type">关系</Label>
          <Select id="relationship-type" value={formData.relationshipType} onChange={(event) => updateField({ relationshipType: event.target.value })}>
            <option value="SUPPLY">供货</option>
            <option value="RESELL">代卖</option>
            <option value="FULFILLMENT">代发</option>
            <option value="CHANNEL">渠道</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="visibility-scope">默认可见性</Label>
          <Select id="visibility-scope" value={formData.visibilityScope} onChange={(event) => updateField({ visibilityScope: event.target.value })}>
            <option value="PRIVATE">私有</option>
            <option value="PARTNER_ONLY">合作方可见</option>
            <option value="PUBLIC">公开</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="commission-rate">佣金比例</Label>
          <Input id="commission-rate" type="number" step="0.0001" min="0" max="1" value={formData.commissionRate} onChange={(event) => updateField({ commissionRate: event.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="service-rate">服务费比例</Label>
          <Input id="service-rate" type="number" step="0.0001" min="0" max="1" value={formData.serviceFeeRate} onChange={(event) => updateField({ serviceFeeRate: event.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="settlement-currency">结算币种</Label>
          <Input id="settlement-currency" value={formData.settlementCurrency} onChange={(event) => updateField({ settlementCurrency: event.target.value.toUpperCase() })} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="partner-notes">备注</Label>
        <Textarea id="partner-notes" rows={3} value={formData.notes} onChange={(event) => updateField({ notes: event.target.value })} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          取消
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "保存中..." : "保存合作方"}
        </Button>
      </div>
    </form>
  );
}
