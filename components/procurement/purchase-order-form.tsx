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

interface PurchaseOrderFormProps {
  storeId: string;
}

export function PurchaseOrderForm({ storeId }: PurchaseOrderFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    orderNo: "",
    supplierName: "",
    currency: "USD",
    fxRate: "",
    orderedAt: new Date().toISOString().split("T")[0],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.orderNo) newErrors.orderNo = "Order number is required";
    if (formData.fxRate && !isValidDecimal(formData.fxRate)) {
      newErrors.fxRate = "Invalid exchange rate format";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

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
      alert("Failed to create purchase order. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Purchase Order Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="orderNo">Order Number *</Label>
              <Input
                id="orderNo"
                value={formData.orderNo}
                onChange={(e) => setFormData({ ...formData, orderNo: e.target.value })}
                placeholder="e.g., PO-2024-001"
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
              <Label htmlFor="supplierName">Supplier Name</Label>
              <Input
                id="supplierName"
                value={formData.supplierName}
                onChange={(e) =>
                  setFormData({ ...formData, supplierName: e.target.value })
                }
                placeholder="e.g., ABC Trading Co."
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="currency">Currency *</Label>
              <Select
                id="currency"
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                required
              >
                <option value="USD">USD</option>
                <option value="CNY">CNY</option>
                <option value="JPY">JPY</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fxRate">Exchange Rate (Optional)</Label>
              <Input
                id="fxRate"
                type="text"
                value={formData.fxRate}
                onChange={(e) => setFormData({ ...formData, fxRate: e.target.value })}
                placeholder="e.g., 7.2345"
              />
              {errors.fxRate && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {errors.fxRate}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Exchange rate to base currency (if applicable)
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="orderedAt">Order Date *</Label>
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
          {loading ? "Creating..." : "Create Purchase Order"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
