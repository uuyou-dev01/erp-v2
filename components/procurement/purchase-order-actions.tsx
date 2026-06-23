"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { updatePurchaseOrderStatus } from "@/app/actions/purchase-orders";
import { MarkShippedDialog } from "@/components/procurement/mark-shipped-dialog";
import { AlertTriangle } from "lucide-react";

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
  const [error, setError] = useState<string | null>(null);

  const handleMarkAsOrdered = async () => {
    setError(null);
    if (order.lines.length === 0) {
      setError("无法标记为已下单：采购单中没有商品");
      return;
    }

    setLoading(true);
    try {
      const result = await updatePurchaseOrderStatus(order.id, "ORDERED", new Date());
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "更新状态失败");
    } finally {
      setLoading(false);
    }
  };

  if (order.status === "DRAFT") {
    return (
      <div className="flex flex-col items-end gap-2">
        {error ? (
          <div
            role="alert"
            className="flex max-w-sm gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-left text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}
        <Button onClick={handleMarkAsOrdered} disabled={loading}>
          {loading ? "更新中..." : "标记为已下单"}
        </Button>
      </div>
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
