"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { receivePurchaseOrder } from "@/app/actions/purchase-orders";
import { Zap } from "lucide-react";

interface QuickReceiveButtonProps {
  purchaseOrderId: string;
  locations: Array<{ id: string; code: string; name: string }>;
  destinationLocationId?: string | null;
}

export function QuickReceiveButton({
  purchaseOrderId,
  locations,
  destinationLocationId,
}: QuickReceiveButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const targetLocationId =
    destinationLocationId ??
    (locations.length === 1 ? locations[0].id : null);

  const targetLocation = targetLocationId
    ? locations.find((l) => l.id === targetLocationId)
    : null;

  const handleQuickReceive = async () => {
    if (!targetLocationId) {
      alert("有多个仓库可选，请使用下方表单手动选择仓库后收货");
      return;
    }

    const confirmed = window.confirm(
      `将所有商品收货到「${targetLocation?.name ?? targetLocation?.code ?? "默认仓库"}」，确认继续？`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      await receivePurchaseOrder({
        purchaseOrderId,
        locationId: targetLocationId,
        receivedAt: new Date(),
      });
      router.push("/procurement");
      router.refresh();
    } catch (err) {
      console.error("Quick receive failed:", err);
      alert("一键收货失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleQuickReceive}
      disabled={loading}
      variant="outline"
      className="border-green-500/50 text-green-700 hover:bg-green-500/10"
    >
      <Zap className="mr-2 h-4 w-4" />
      {loading ? "收货中..." : "一键收货"}
    </Button>
  );
}
