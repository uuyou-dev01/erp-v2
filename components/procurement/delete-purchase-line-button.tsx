"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deletePurchaseLineAction } from "@/app/actions/purchase-orders";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";

interface DeletePurchaseLineButtonProps {
  lineId: string;
  orderId: string;
  skuName: string;
}

export function DeletePurchaseLineButton({
  lineId,
  orderId,
  skuName,
}: DeletePurchaseLineButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await deletePurchaseLineAction(lineId, orderId);
      if (!result.success) {
        setError(result.error);
        return;
      }

      setConfirming(false);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "删除商品失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-destructive hover:text-destructive"
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
      >
        <Trash2 className="mr-1.5 h-4 w-4" />
        删除
      </Button>

      {confirming ? (
        <ConfirmDialog
          open={confirming}
          title="确认删除采购商品"
          description={`确认要从采购单中删除「${skuName}」吗？删除后采购单金额会重新计算。`}
          confirmText="确认删除"
          cancelText="取消"
          loading={loading}
          tone="danger"
          error={error}
          onConfirm={handleDelete}
          onCancel={() => {
            setError(null);
            setConfirming(false);
          }}
        />
      ) : null}
    </>
  );
}
