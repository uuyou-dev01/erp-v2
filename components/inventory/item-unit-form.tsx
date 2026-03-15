"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createItemUnit, updateItemUnit } from "@/app/actions/item-units";
import { getSKUs } from "@/app/actions/skus";
import { getLocations } from "@/app/actions/locations";
import { isValidDecimal } from "@/lib/decimal";
import { AlertCircle, Plus, X } from "lucide-react";

interface ItemUnitFormProps {
  storeId: string;
  initialData?: {
    id: string;
    conditionGrade?: string | null;
    photos?: string[];
    ownerId?: string | null;
    holderId?: string | null;
    notes?: string | null;
  };
  mode: "create" | "edit";
}

export function ItemUnitForm({ storeId, initialData, mode }: ItemUnitFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [skus, setSKUs] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [locations, setLocations] = useState<
    Array<{ id: string; code: string; name: string }>
  >([]);
  const [formData, setFormData] = useState({
    skuId: "",
    locationId: "",
    unitCost: "",
    costCurrency: "USD",
    conditionGrade: initialData?.conditionGrade || "",
    photos: initialData?.photos || [],
    ownerId: initialData?.ownerId || "",
    holderId: initialData?.holderId || "",
    notes: initialData?.notes || "",
  });
  const [photoInput, setPhotoInput] = useState("");
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

    if (mode === "create") {
      if (!formData.skuId) newErrors.skuId = "SKU is required";
      if (!formData.locationId) newErrors.locationId = "Location is required";
      if (!formData.unitCost) {
        newErrors.unitCost = "Unit cost is required";
      } else if (!isValidDecimal(formData.unitCost)) {
        newErrors.unitCost = "Invalid cost format";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddPhoto = () => {
    if (photoInput.trim()) {
      setFormData({
        ...formData,
        photos: [...formData.photos, photoInput.trim()],
      });
      setPhotoInput("");
    }
  };

  const handleRemovePhoto = (index: number) => {
    setFormData({
      ...formData,
      photos: formData.photos.filter((_, i) => i !== index),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);

    try {
      if (mode === "create") {
        await createItemUnit({
          storeId,
          skuId: formData.skuId,
          locationId: formData.locationId,
          unitCost: formData.unitCost,
          costCurrency: formData.costCurrency,
          conditionGrade: formData.conditionGrade || undefined,
          photos: formData.photos.length > 0 ? formData.photos : undefined,
          ownerId: formData.ownerId || undefined,
          holderId: formData.holderId || undefined,
          notes: formData.notes || undefined,
        });
        router.push("/inventory/items");
      } else {
        await updateItemUnit(initialData!.id, {
          conditionGrade: formData.conditionGrade || undefined,
          photos: formData.photos.length > 0 ? formData.photos : undefined,
          ownerId: formData.ownerId || undefined,
          holderId: formData.holderId || undefined,
          notes: formData.notes || undefined,
        });
        router.refresh();
      }
    } catch (error) {
      console.error("Failed to save item unit:", error);
      alert("Failed to save item unit. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {mode === "create" && (
        <>
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

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="unitCost">Unit Cost *</Label>
              <Input
                id="unitCost"
                type="text"
                value={formData.unitCost}
                onChange={(e) => setFormData({ ...formData, unitCost: e.target.value })}
                placeholder="e.g., 100.00"
                required
              />
              {errors.unitCost && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {errors.unitCost}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="costCurrency">Currency *</Label>
              <Select
                id="costCurrency"
                value={formData.costCurrency}
                onChange={(e) => setFormData({ ...formData, costCurrency: e.target.value })}
                required
              >
                <option value="USD">USD</option>
                <option value="CNY">CNY</option>
                <option value="JPY">JPY</option>
                <option value="EUR">EUR</option>
              </Select>
            </div>
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="conditionGrade">Condition Grade</Label>
        <Select
          id="conditionGrade"
          value={formData.conditionGrade}
          onChange={(e) => setFormData({ ...formData, conditionGrade: e.target.value })}
        >
          <option value="">Select Condition</option>
          <option value="NEW">New</option>
          <option value="LIKE_NEW">Like New</option>
          <option value="EXCELLENT">Excellent</option>
          <option value="GOOD">Good</option>
          <option value="FAIR">Fair</option>
          <option value="POOR">Poor</option>
          <option value="DEFECTIVE">Defective</option>
        </Select>
        <p className="text-xs text-muted-foreground">
          Condition grade for used or defective items
        </p>
      </div>

      <div className="space-y-2">
        <Label>Photos</Label>
        <div className="flex gap-2">
          <Input
            type="text"
            value={photoInput}
            onChange={(e) => setPhotoInput(e.target.value)}
            placeholder="Photo URL"
          />
          <Button type="button" onClick={handleAddPhoto} variant="outline">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {formData.photos.length > 0 && (
          <div className="space-y-2">
            {formData.photos.map((photo, index) => (
              <div key={index} className="flex items-center gap-2 rounded-lg border p-2">
                <span className="flex-1 truncate text-sm">{photo}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemovePhoto(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ownerId">Owner ID</Label>
          <Input
            id="ownerId"
            type="text"
            value={formData.ownerId}
            onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}
            placeholder="e.g., user_123"
          />
          <p className="text-xs text-muted-foreground">Who owns this item</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="holderId">Holder ID</Label>
          <Input
            id="holderId"
            type="text"
            value={formData.holderId}
            onChange={(e) => setFormData({ ...formData, holderId: e.target.value })}
            placeholder="e.g., user_456"
          />
          <p className="text-xs text-muted-foreground">Who currently holds/sells this item</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Additional notes about this item..."
          rows={3}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : mode === "create" ? "Create Item Unit" : "Update Item Unit"}
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
