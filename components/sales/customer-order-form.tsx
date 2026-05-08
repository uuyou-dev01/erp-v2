"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createCustomerOrder } from "@/app/actions/customer-orders";
import { getPlatforms } from "@/app/actions/platforms";
import { t, CURRENCIES, COUNTRY_FLOWS } from "@/lib/i18n";

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
    orderDate: new Date().toISOString().split("T")[0],
    externalOrderNo: "",
    currency: "JPY",
    countryFlow: "CN_TO_JP",
  });

  useEffect(() => {
    getPlatforms(storeId).then((list) => setPlatforms(list as Platform[]));
  }, [storeId]);

  const handlePlatformChange = (platformId: string) => {
    const platform = platforms.find((p) => p.id === platformId);
    setFormData((prev) => ({
      ...prev,
      platformId,
      currency: platform?.defaultCurrency || prev.currency,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.platformId) {
      alert("请选择销售平台");
      return;
    }
    setLoading(true);

    try {
      const orderNumber = `ORD-${Date.now()}`;

      const order = await createCustomerOrder({
        storeId,
        orderNumber,
        platformId: formData.platformId,
        customerName: formData.customerName,
        customerEmail: formData.customerEmail || undefined,
        customerPhone: formData.customerPhone || undefined,
        shippingAddress: formData.shippingAddress || undefined,
        orderDate: new Date(formData.orderDate),
        externalOrderNo: formData.externalOrderNo || undefined,
        currency: formData.currency,
        countryFlow: formData.countryFlow || undefined,
      });

      router.push(`/sales/${order.id}`);
      router.refresh();
    } catch (error) {
      console.error("Failed to create customer order:", error);
      alert("创建订单失败，请重试");
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
              onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
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
                onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
                placeholder="customer@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customerPhone">{t("sales.customer_phone")}</Label>
              <Input
                id="customerPhone"
                type="tel"
                value={formData.customerPhone}
                onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                placeholder="+81 90-1234-5678"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="shippingAddress">{t("sales.shipping_address")}</Label>
            <Textarea
              id="shippingAddress"
              value={formData.shippingAddress}
              onChange={(e) => setFormData({ ...formData, shippingAddress: e.target.value })}
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
                onChange={(e) => setFormData({ ...formData, orderDate: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">{t("common.currency")} *</Label>
              <Select
                id="currency"
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                required
              >
                {CURRENCIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
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
                onChange={(e) => setFormData({ ...formData, countryFlow: e.target.value })}
              >
                {COUNTRY_FLOWS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="externalOrderNo">{t("sales.external_order_no")}</Label>
              <Input
                id="externalOrderNo"
                value={formData.externalOrderNo}
                onChange={(e) => setFormData({ ...formData, externalOrderNo: e.target.value })}
                placeholder={t("sales.external_order_no_placeholder")}
              />
              <p className="text-xs text-muted-foreground">{t("sales.external_order_no_hint")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

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
