"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteItemUnit } from "@/app/actions/item-units";
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

  const handleDelete = async () => {
    setLoading(true);
    try {
      await deleteItemUnit(id, storeId);
      setConfirming(false);
      router.push("/inventory/items");
      router.refresh();
    } catch (error) {
      console.error("Failed to delete item unit:", error);
      const message = error instanceof Error ? error.message : "删除失败，请重试";
      alert(message);
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
        onClick={() => setConfirming(true)}
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
          onConfirm={handleDelete}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
