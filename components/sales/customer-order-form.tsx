"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createCustomerOrderAction } from "@/app/actions/customer-orders";
import { getPlatforms } from "@/app/actions/platforms";
import { AlertCircle } from "lucide-react";
import { t, CURRENCIES, COUNTRY_FLOWS } from "@/lib/i18n";
import { FULFILLMENT_DESTINATIONS } from "@/lib/inventory/location-fulfillment";

interface Platform {
  id: string;
  code: string;
  name: string;
  defaultFeeRate: unknown;
  defaultCurrency: string | null;
  country: string | null;
}

interface CustomerOrderFormProps {
  storeId: string;
}

export function CustomerOrderForm({ storeId }: CustomerOrderFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [formData, setFormData] = useState({
    platformId: "",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    shippingAddress: "",
    shippingCountry: "JP",
    orderDate: new Date().toISOString().split("T")[0],
    externalOrderNo: "",
    currency: "JPY",
    countryFlow: "CN_TO_JP",
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    getPlatforms(storeId).then((list) => setPlatforms(list as Platform[]));
  }, [storeId]);

  const updateFormData = (updates: Partial<typeof formData>) => {
    setSubmitError(null);
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const handlePlatformChange = (platformId: string) => {
    const platform = platforms.find((p) => p.id === platformId);
    setSubmitError(null);
    updateFormData({
      platformId,
      currency: platform?.defaultCurrency || formData.currency,
      shippingCountry:
        platform?.country && ["CN", "JP", "US", "EU"].includes(platform.country)
          ? platform.country
          : formData.shippingCountry,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!formData.platformId) {
      setSubmitError("请选择销售平台");
      return;
    }
    setLoading(true);

    try {
      const orderNumber = `ORD-${Date.now()}`;

      const result = await createCustomerOrderAction({
        storeId,
        orderNumber,
        platformId: formData.platformId,
        customerName: formData.customerName,
        customerEmail: formData.customerEmail || undefined,
        customerPhone: formData.customerPhone || undefined,
        shippingAddress: formData.shippingAddress || undefined,
        shippingCountry: formData.shippingCountry || undefined,
        orderDate: new Date(formData.orderDate),
        externalOrderNo: formData.externalOrderNo || undefined,
        currency: formData.currency,
        countryFlow: formData.countryFlow || undefined,
      });
      if (!result.success) {
        setSubmitError(result.error);
        return;
      }

      router.push(`/sales/${result.id}`);
      router.refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "创建订单失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("sales.platform")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="platformId">{t("sales.select_platform")} *</Label>
            <Select
              id="platformId"
              value={formData.platformId}
              onChange={(e) => handlePlatformChange(e.target.value)}
              required
            >
              <option value="">-- {t("sales.select_platform")} --</option>
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </Select>
          </div>
          {formData.platformId && (
            <p className="text-xs text-muted-foreground">
              平台抽成使用平台配置；实际发货费用请在订单产生发货信息后按配送方式记录。
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sales.customer_info")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="customerName">{t("sales.customer_name")} *</Label>
            <Input
              id="customerName"
              value={formData.customerName}
              onChange={(e) => updateFormData({ customerName: e.target.value })}
              placeholder={t("sales.customer_name_placeholder")}
              required
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="customerEmail">{t("sales.customer_email")}</Label>
              <Input
                id="customerEmail"
                type="email"
                value={formData.customerEmail}
                onChange={(e) => updateFormData({ customerEmail: e.target.value })}
                placeholder="customer@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customerPhone">{t("sales.customer_phone")}</Label>
              <Input
                id="customerPhone"
                type="tel"
                value={formData.customerPhone}
                onChange={(e) => updateFormData({ customerPhone: e.target.value })}
                placeholder="+81 90-1234-5678"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="shippingCountry">收货国家/地区 *</Label>
            <Select
              id="shippingCountry"
              value={formData.shippingCountry}
              onChange={(e) => updateFormData({ shippingCountry: e.target.value })}
              required
            >
              {FULFILLMENT_DESTINATIONS.filter((destination) => destination.code !== "GLOBAL").map(
                (destination) => (
                  <option key={destination.code} value={destination.code}>
                    {destination.label}
                  </option>
                )
              )}
            </Select>
            <p className="text-xs text-muted-foreground">
              系统根据实际收货地选择可履约仓库，销售平台不再决定发货国家。
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="shippingAddress">{t("sales.shipping_address")}</Label>
            <Textarea
              id="shippingAddress"
              value={formData.shippingAddress}
              onChange={(e) => updateFormData({ shippingAddress: e.target.value })}
              placeholder={t("sales.shipping_address_placeholder")}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sales.order_details")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="orderDate">{t("sales.order_date")} *</Label>
              <Input
                id="orderDate"
                type="date"
                value={formData.orderDate}
                onChange={(e) => updateFormData({ orderDate: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">{t("common.currency")} *</Label>
              <Select
                id="currency"
                value={formData.currency}
                onChange={(e) => updateFormData({ currency: e.target.value })}
                required
              >
                {CURRENCIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="countryFlow">{t("sales.country_flow")}</Label>
              <Select
                id="countryFlow"
                value={formData.countryFlow}
                onChange={(e) => updateFormData({ countryFlow: e.target.value })}
              >
                {COUNTRY_FLOWS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="externalOrderNo">{t("sales.external_order_no")}</Label>
              <Input
                id="externalOrderNo"
                value={formData.externalOrderNo}
                onChange={(e) => updateFormData({ externalOrderNo: e.target.value })}
                placeholder={t("sales.external_order_no_placeholder")}
              />
              <p className="text-xs text-muted-foreground">{t("sales.external_order_no_hint")}</p>
            </div>
          </div>
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
        <Button type="submit" disabled={loading}>
          {loading ? t("common.creating") : t("sales.create_order")}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
