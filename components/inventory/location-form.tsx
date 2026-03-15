"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createLocation,
  updateLocation,
  type LocationType,
} from "@/app/actions/locations";

interface LocationFormProps {
  storeId: string;
  initialData?: {
    id: string;
    code: string;
    name: string;
    type: LocationType;
    isSellableDefault: boolean;
  };
}

export function LocationForm({ storeId, initialData }: LocationFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    code: initialData?.code || "",
    name: initialData?.name || "",
    type: (initialData?.type || "WAREHOUSE") as LocationType,
    isSellableDefault: initialData?.isSellableDefault ?? true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (initialData) {
        await updateLocation({
          id: initialData.id,
          storeId,
          ...formData,
        });
      } else {
        await createLocation({
          storeId,
          ...formData,
        });
      }
      router.push("/inventory/locations");
      router.refresh();
    } catch (error) {
      console.error("Failed to save location:", error);
      alert("Failed to save location. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>{initialData ? "Edit Location" : "New Location"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">Code *</Label>
            <Input
              id="code"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              placeholder="e.g., CN_STOCK, JP_WAREHOUSE"
              required
            />
            <p className="text-xs text-muted-foreground">
              Unique identifier for this location
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., China Main Warehouse"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Type *</Label>
            <Select
              id="type"
              value={formData.type}
              onChange={(e) =>
                setFormData({ ...formData, type: e.target.value as LocationType })
              }
              required
            >
              <option value="WAREHOUSE">Warehouse</option>
              <option value="FORWARDER">Freight Forwarder</option>
              <option value="PERSON">Person (Friend/Consignment)</option>
              <option value="TRANSIT">In Transit</option>
            </Select>
            <p className="text-xs text-muted-foreground">
              Type of location for inventory management
            </p>
          </div>

          <div className="space-y-2">
            <Checkbox
              id="isSellableDefault"
              checked={formData.isSellableDefault}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  isSellableDefault: e.currentTarget.checked,
                })
              }
              label="Sellable by default"
            />
            <p className="text-xs text-muted-foreground">
              Whether inventory at this location is available for sale by default
            </p>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : initialData ? "Update" : "Create"}
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
        </CardContent>
      </Card>
    </form>
  );
}
