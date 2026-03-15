"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { updatePurchaseOrderStatus } from "@/app/actions/purchase-orders";

interface PurchaseOrderActionsProps {
  order: {
    id: string;
    status: string;
    lines: unknown[];
  };
}

export function PurchaseOrderActions({ order }: PurchaseOrderActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleMarkAsOrdered = async () => {
    if (order.lines.length === 0) {
      alert("Cannot mark as ordered: No items in purchase order");
      return;
    }

    setLoading(true);
    try {
      await updatePurchaseOrderStatus(order.id, "ORDERED", new Date());
      router.refresh();
    } catch (error) {
      console.error("Failed to update status:", error);
      alert("Failed to update status");
    } finally {
      setLoading(false);
    }
  };

  if (order.status === "DRAFT") {
    return (
      <Button onClick={handleMarkAsOrdered} disabled={loading}>
        {loading ? "Updating..." : "Mark as Ordered"}
      </Button>
    );
  }

  return null;
}
