"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { updatePurchaseOrderStatus } from "@/app/actions/purchase-orders";
import { MarkShippedDialog } from "@/components/procurement/mark-shipped-dialog";

interface PurchaseOrderActionsProps {
  order: {
    id: string;
    status: string;
    lines: unknown[];
    trackingNo?: string | null;
    carrier?: string | null;
    etaDate?: string | Date | null;
    shipmentNote?: string | null;
  };
}

export function PurchaseOrderActions({ order }: PurchaseOrderActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleMarkAsOrdered = async () => {
    if (order.lines.length === 0) {
      alert("无法标记为已下单：采购单中没有商品");
      return;
    }

    setLoading(true);
    try {
      await updatePurchaseOrderStatus(order.id, "ORDERED", new Date());
      router.refresh();
    } catch (error) {
      console.error("Failed to update status:", error);
      alert("更新状态失败");
    } finally {
      setLoading(false);
    }
  };

  if (order.status === "DRAFT") {
    return (
      <Button onClick={handleMarkAsOrdered} disabled={loading}>
        {loading ? "更新中..." : "标记为已下单"}
      </Button>
    );
  }

  if (order.status === "ORDERED" || order.status === "SHIPPED") {
    return (
      <MarkShippedDialog
        purchaseOrderId={order.id}
        defaultTrackingNo={order.trackingNo}
        defaultCarrier={order.carrier}
        defaultEtaDate={
          order.etaDate ? new Date(order.etaDate).toISOString() : null
        }
        defaultShipmentNote={order.shipmentNote}
        isResubmit={order.status === "SHIPPED"}
      />
    );
  }

  return null;
}
