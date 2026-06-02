"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createPurchaseOrder } from "@/app/actions/purchase-orders";
import { isValidDecimal } from "@/lib/decimal";
import { AlertCircle } from "lucide-react";
import { t, CURRENCIES } from "@/lib/i18n";

interface PurchaseOrderFormProps {
  storeId: string;
}

export function PurchaseOrderForm({ storeId }: PurchaseOrderFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    orderNo: "",
    supplierName: "",
    currency: "CNY",
    fxRate: "",
    orderedAt: new Date().toISOString().split("T")[0],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.orderNo) newErrors.orderNo = "采购单号为必填项";
    if (formData.fxRate && !isValidDecimal(formData.fxRate)) {
      newErrors.fxRate = "汇率格式无效";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      const order = await createPurchaseOrder({
        storeId,
        orderNo: formData.orderNo,
        supplierName: formData.supplierName || undefined,
        currency: formData.currency,
        fxRate: formData.fxRate || undefined,
        orderedAt: new Date(formData.orderedAt),
      });

      router.push(`/procurement/${order.id}`);
      router.refresh();
    } catch (error) {
      console.error("Failed to create purchase order:", error);
      alert("创建采购订单失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>{t("purchase.info")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="orderNo">{t("purchase.order_no")} *</Label>
              <Input
                id="orderNo"
                value={formData.orderNo}
                onChange={(e) => setFormData({ ...formData, orderNo: e.target.value })}
                placeholder={t("purchase.order_no_placeholder")}
                required
              />
              {errors.orderNo && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {errors.orderNo}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplierName">{t("purchase.supplier")}</Label>
              <Input
                id="supplierName"
                value={formData.supplierName}
                onChange={(e) => setFormData({ ...formData, supplierName: e.target.value })}
                placeholder={t("purchase.supplier_placeholder")}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="currency">{t("purchase.currency")} *</Label>
              <Select
                id="currency"
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                required
              >
                {CURRENCIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fxRate">{t("purchase.fx_rate")}</Label>
              <Input
                id="fxRate"
                type="text"
                value={formData.fxRate}
                onChange={(e) => setFormData({ ...formData, fxRate: e.target.value })}
                placeholder={t("purchase.fx_rate_placeholder")}
              />
              {errors.fxRate && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {errors.fxRate}
                </p>
              )}
              <p className="text-xs text-muted-foreground">{t("purchase.fx_rate_hint")}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="orderedAt">{t("purchase.order_date")} *</Label>
            <Input
              id="orderedAt"
              type="date"
              value={formData.orderedAt}
              onChange={(e) => setFormData({ ...formData, orderedAt: e.target.value })}
              required
            />
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? t("common.creating") : t("purchase.create")}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
