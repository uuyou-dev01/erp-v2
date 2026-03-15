"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { allocateInventory } from "@/app/actions/customer-orders";
import { getInventoryLots, getAvailableQuantity } from "@/app/actions/inventory-lots";
import { isValidDecimal } from "@/lib/decimal";
import { formatCurrency, formatQuantity } from "@/lib/decimal";
import { AlertCircle, Package } from "lucide-react";

interface AllocateInventoryFormProps {
  orderLineId: string;
  skuId: string;
  skuCode: string;
  requiredQty: string;
  storeId: string;
}

export function AllocateInventoryForm({
  orderLineId,
  skuId,
  skuCode,
  requiredQty,
  storeId,
}: AllocateInventoryFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [lots, setLots] = useState<
    Array<{
      id: string;
      location: { code: string; name: string };
      unitCost: { toString: () => string };
      costCurrency: string;
      status: string;
      receivedAt: Date;
    }>
  >([]);
  const [availableQty, setAvailableQty] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    lotId: "",
    quantity: requiredQty,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    // Load lots for this SKU
    getInventoryLots(storeId).then((allLots) => {
      const skuLots = allLots.filter(
        (lot) => lot.skuId === skuId && lot.status === "ACTIVE"
      );
      setLots(skuLots);

      // Load available quantity for each lot
      skuLots.forEach((lot) => {
        getAvailableQuantity(lot.id).then((qty) => {
          setAvailableQty((prev) => ({ ...prev, [lot.id]: qty }));
        });
      });
    });
  }, [storeId, skuId]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.lotId) newErrors.lotId = "Please select an inventory lot";
    if (!formData.quantity) {
      newErrors.quantity = "Quantity is required";
    } else if (!isValidDecimal(formData.quantity) || parseFloat(formData.quantity) <= 0) {
      newErrors.quantity = "Invalid quantity";
    } else {
      const available = availableQty[formData.lotId];
      if (available && parseFloat(formData.quantity) > parseFloat(available)) {
        newErrors.quantity = `Only ${available} available`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);

    try {
      await allocateInventory({
        orderLineId,
        lotId: formData.lotId,
        quantity: formData.quantity,
      });

      router.refresh();
    } catch (error) {
      console.error("Failed to allocate inventory:", error);
      alert("Failed to allocate inventory. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex gap-3 rounded-lg border border-blue-500/50 bg-blue-500/10 p-4">
        <Package className="h-5 w-5 text-blue-500" />
        <div className="flex-1 space-y-1 text-sm">
          <p className="font-medium">Allocating for SKU: {skuCode}</p>
          <p className="text-muted-foreground">
            Required quantity: {formatQuantity(requiredQty)}
          </p>
        </div>
      </div>

      {lots.length === 0 ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
          <p className="font-medium text-destructive">No inventory available</p>
          <p className="text-muted-foreground">
            There are no active inventory lots for this SKU. Please receive goods first.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="lotId">Select Inventory Lot (FIFO) *</Label>
            <Select
              id="lotId"
              value={formData.lotId}
              onChange={(e) => setFormData({ ...formData, lotId: e.target.value })}
              required
            >
              <option value="">Select Lot</option>
              {lots.map((lot) => {
                const available = availableQty[lot.id] || "...";
                return (
                  <option key={lot.id} value={lot.id}>
                    {lot.location.code} | Available: {available} | Cost:{" "}
                    {formatCurrency(lot.unitCost.toString(), lot.costCurrency)} | Received:{" "}
                    {new Date(lot.receivedAt).toLocaleDateString()}
                  </option>
                );
              })}
            </Select>
            {errors.lotId && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" />
                {errors.lotId}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Lots are sorted by received date (FIFO - First In, First Out)
            </p>
          </div>

          {formData.lotId && availableQty[formData.lotId] && (
            <div className="rounded-lg border bg-muted p-3 text-sm">
              <p className="font-medium">Selected Lot Details:</p>
              <p className="text-muted-foreground">
                Available: {formatQuantity(availableQty[formData.lotId])} units
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity to Allocate *</Label>
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

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Allocating..." : "Allocate Inventory"}
          </Button>
        </>
      )}
    </form>
  );
}
