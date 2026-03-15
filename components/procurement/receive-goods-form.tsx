"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { receivePurchaseOrder } from "@/app/actions/purchase-orders";
import { AlertCircle, Package } from "lucide-react";

interface ReceiveGoodsFormProps {
  purchaseOrderId: string;
  locations: Array<{ id: string; code: string; name: string }>;
  lineCount: number;
}

export function ReceiveGoodsForm({
  purchaseOrderId,
  locations,
  lineCount,
}: ReceiveGoodsFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    locationId: "",
    receivedAt: new Date().toISOString().split("T")[0],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.locationId) {
      setErrors({ locationId: "Location is required" });
      return;
    }

    setLoading(true);

    try {
      await receivePurchaseOrder({
        purchaseOrderId,
        locationId: formData.locationId,
        receivedAt: new Date(formData.receivedAt),
      });

      router.push("/procurement");
      router.refresh();
    } catch (error) {
      console.error("Failed to receive goods:", error);
      alert("Failed to receive goods. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex gap-3 rounded-lg border border-blue-500/50 bg-blue-500/10 p-4">
        <Package className="h-5 w-5 text-blue-500" />
        <div className="flex-1 space-y-1 text-sm">
          <p className="font-medium">Receiving {lineCount} items</p>
          <p className="text-muted-foreground">
            This will create {lineCount} inventory lot(s) and write to StockLedger automatically.
            The purchase order status will be set to RECEIVED.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="locationId">Destination Location *</Label>
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
          <Label htmlFor="receivedAt">Received Date *</Label>
          <Input
            id="receivedAt"
            type="date"
            value={formData.receivedAt}
            onChange={(e) => setFormData({ ...formData, receivedAt: e.target.value })}
            required
          />
        </div>
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Receiving..." : "Receive Goods & Create Inventory"}
      </Button>
    </form>
  );
}
