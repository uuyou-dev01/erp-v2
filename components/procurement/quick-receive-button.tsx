"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { receivePurchaseOrderAction } from "@/app/actions/purchase-orders";
import { AlertCircle, Zap } from "lucide-react";

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
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const targetLocationId =
    destinationLocationId ??
    (locations.length === 1 ? locations[0].id : null);

  const targetLocation = targetLocationId
    ? locations.find((l) => l.id === targetLocationId)
    : null;

  const handleQuickReceive = async () => {
    setConfirmOpen(false);
    setError(null);
    if (!targetLocationId) {
      setError("有多个仓库可选，请使用下方表单手动选择仓库后收货");
      return;
    }

    setLoading(true);
    try {
      const result = await receivePurchaseOrderAction({
        purchaseOrderId,
        locationId: targetLocationId,
        receivedAt: new Date(),
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push("/procurement");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "一键收货失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const openConfirm = () => {
    setError(null);
    if (!targetLocationId) {
      setError("有多个仓库可选，请使用下方表单手动选择仓库后收货");
      return;
    }
    setConfirmOpen(true);
  };

  return (
    <div className="flex flex-col items-end gap-2">
      {error ? (
        <div
          role="alert"
          className="flex max-w-sm gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-left text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}
      <Button
        onClick={openConfirm}
        disabled={loading}
        variant="outline"
        className="border-green-500/50 text-green-700 hover:bg-green-500/10"
      >
        <Zap className="mr-2 h-4 w-4" />
        {loading ? "收货中..." : "一键收货"}
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        title="确认一键收货"
        description={`将所有商品收货到「${targetLocation?.name ?? targetLocation?.code ?? "默认仓库"}」，确认继续？`}
        confirmText="确认收货"
        cancelText="返回"
        loading={loading}
        onConfirm={handleQuickReceive}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
