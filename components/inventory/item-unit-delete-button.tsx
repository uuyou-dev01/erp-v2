"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteItemUnitAction } from "@/app/actions/item-units";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatShortEntityId } from "@/lib/format-id";

interface ItemUnitDeleteButtonProps {
  id: string;
  skuCode: string;
  storeId: string;
}

export function ItemUnitDeleteButton({ id, skuCode, storeId }: ItemUnitDeleteButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await deleteItemUnitAction(id, storeId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      router.push("/inventory/items");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "删除失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-red-600 hover:text-red-700"
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
      >
        <Trash2 className="mr-2 h-4 w-4" />
        删除单品
      </Button>

      {confirming && (
        <ConfirmDialog
          open={confirming}
          title="确认删除单品"
          description={`确认要删除单品 ${formatShortEntityId(id)}（${skuCode}）吗？若仍有关联上架、订单分配或库存流水，系统会阻止删除。`}
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
      )}
    </>
  );
}
