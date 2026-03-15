"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createInventoryLot } from "@/app/actions/inventory-lots";
import { getSKUs } from "@/app/actions/skus";
import { getLocations } from "@/app/actions/locations";
import { isValidDecimal } from "@/lib/decimal";
import { AlertCircle } from "lucide-react";

interface InventoryLotFormProps {
  storeId: string;
}

export function InventoryLotForm({ storeId }: InventoryLotFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [skus, setSKUs] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [locations, setLocations] = useState<
    Array<{ id: string; code: string; name: string }>
  >([]);
  const [formData, setFormData] = useState({
    skuId: "",
    locationId: "",
    quantity: "",
    unitCost: "",
    costCurrency: "USD",
    sourceId: "MANUAL_ENTRY",
    receivedAt: new Date().toISOString().split("T")[0],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    // Load SKUs and Locations
    Promise.all([getSKUs(storeId), getLocations(storeId)]).then(([skuData, locationData]) => {
      setSKUs(skuData);
      setLocations(locationData);
    });
  }, [storeId]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.skuId) newErrors.skuId = "SKU is required";
    if (!formData.locationId) newErrors.locationId = "Location is required";
    if (!formData.quantity) {
      newErrors.quantity = "Quantity is required";
    } else if (!isValidDecimal(formData.quantity)) {
      newErrors.quantity = "Invalid quantity format";
    } else if (parseFloat(formData.quantity) <= 0) {
      newErrors.quantity = "Quantity must be greater than 0";
    }
    if (!formData.unitCost) {
      newErrors.unitCost = "Unit cost is required";
    } else if (!isValidDecimal(formData.unitCost)) {
      newErrors.unitCost = "Invalid cost format";
    } else if (parseFloat(formData.unitCost) < 0) {
      newErrors.unitCost = "Unit cost cannot be negative";
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
      await createInventoryLot({
        storeId,
        skuId: formData.skuId,
        locationId: formData.locationId,
        quantity: formData.quantity,
        unitCost: formData.unitCost,
        costCurrency: formData.costCurrency,
        sourceType: "PURCHASE",
        sourceId: formData.sourceId,
        receivedAt: new Date(formData.receivedAt),
      });

      router.push("/inventory/lots");
      router.refresh();
    } catch (error) {
      console.error("Failed to create inventory lot:", error);
      alert("Failed to create inventory lot. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Lot Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
            <Label htmlFor="locationId">Location *</Label>
            <Select
              id="locationId"
              value={formData.locationId}
              onChange={(e) => setFormData({ ...formData, locationId: e.target.value })}
              required
            >
              <option value="">Select Location</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.code} - {location.name}
                </option>
              ))}
            </Select>
            {errors.locationId && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" />
                {errors.locationId}
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
              placeholder="e.g., 100, 50.5"
              required
            />
            {errors.quantity && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" />
                {errors.quantity}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Number of units in this lot (supports decimals)
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="unitCost">Unit Cost *</Label>
              <Input
                id="unitCost"
                type="text"
                value={formData.unitCost}
                onChange={(e) => setFormData({ ...formData, unitCost: e.target.value })}
                placeholder="e.g., 99.99"
                required
              />
              {errors.unitCost && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {errors.unitCost}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Cost per unit (immutable once set)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="costCurrency">Currency *</Label>
              <Select
                id="costCurrency"
                value={formData.costCurrency}
                onChange={(e) =>
                  setFormData({ ...formData, costCurrency: e.target.value })
                }
                required
              >
                <option value="USD">USD</option>
                <option value="CNY">CNY</option>
                <option value="JPY">JPY</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="receivedAt">Received Date *</Label>
            <Input
              id="receivedAt"
              type="date"
              value={formData.receivedAt}
              onChange={(e) => setFormData({ ...formData, receivedAt: e.target.value })}
              required
            />
            <p className="text-xs text-muted-foreground">
              Date when inventory was received
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-blue-500/50 bg-blue-500/5">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-blue-500" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">StockLedger Integration</p>
              <p className="text-muted-foreground">
                Creating this lot will automatically write an INBOUND_PURCHASE entry to the
                StockLedger. The unit cost is immutable once set.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create Inventory Lot"}
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
