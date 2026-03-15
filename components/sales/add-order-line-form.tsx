"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { addOrderLine } from "@/app/actions/customer-orders";
import { getSKUs } from "@/app/actions/skus";
import { isValidDecimal } from "@/lib/decimal";
import { AlertCircle } from "lucide-react";

interface AddOrderLineFormProps {
  orderId: string;
  currency: string;
  storeId: string;
}

export function AddOrderLineForm({ orderId, currency, storeId }: AddOrderLineFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [skus, setSKUs] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [formData, setFormData] = useState({
    skuId: "",
    quantity: "",
    unitPrice: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    getSKUs(storeId).then(setSKUs);
  }, [storeId]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.skuId) newErrors.skuId = "SKU is required";
    if (!formData.quantity) {
      newErrors.quantity = "Quantity is required";
    } else if (!isValidDecimal(formData.quantity) || parseFloat(formData.quantity) <= 0) {
      newErrors.quantity = "Invalid quantity";
    }
    if (formData.unitPrice && !isValidDecimal(formData.unitPrice)) {
      newErrors.unitPrice = "Invalid price format";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);

    try {
      await addOrderLine({
        orderId,
        skuId: formData.skuId,
        quantity: formData.quantity,
        unitPrice: formData.unitPrice || undefined,
      });

      setFormData({ skuId: "", quantity: "", unitPrice: "" });
      router.refresh();
    } catch (error) {
      console.error("Failed to add order line:", error);
      alert("Failed to add line. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="skuId">SKU *</Label>
          <Select
            id="skuId"
            value={formData.skuId}
            onChange={(e) => setFormData({ ...formData, skuId: e.target.value })}
            required
          >
            <option value="">Select SKU</option>
            {skus.map((sku) => (
              <option key={sku.id} value={sku.id}>
                {sku.code} - {sku.name}
              </option>
            ))}
          </Select>
          {errors.skuId && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {errors.skuId}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="quantity">Quantity *</Label>
          <Input
            id="quantity"
            type="text"
            value={formData.quantity}
            onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
            placeholder="e.g., 10"
            required
          />
          {errors.quantity && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {errors.quantity}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="unitPrice">Unit Price ({currency})</Label>
          <Input
            id="unitPrice"
            type="text"
            value={formData.unitPrice}
            onChange={(e) => setFormData({ ...formData, unitPrice: e.target.value })}
            placeholder="e.g., 149.99"
          />
          {errors.unitPrice && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {errors.unitPrice}
            </p>
          )}
          <p className="text-xs text-muted-foreground">Optional - can be set later</p>
        </div>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "Adding..." : "Add Line"}
      </Button>
    </form>
  );
}
