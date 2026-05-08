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

  return null;
}
