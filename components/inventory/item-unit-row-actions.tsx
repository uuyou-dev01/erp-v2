"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteItemUnit } from "@/app/actions/item-units";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatShortEntityId } from "@/lib/format-id";

interface ItemUnitRowActionsProps {
  id: string;
  skuCode: string;
  storeId: string;
}

export function ItemUnitRowActions({ id, skuCode, storeId }: ItemUnitRowActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      await deleteItemUnit(id, storeId);
      setConfirming(false);
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
      <div className="flex items-center justify-end gap-2">
        <Link href={`/inventory/items/${id}`}>
          <Button variant="ghost" size="sm">
            查看
          </Button>
        </Link>

        <Link href={`/inventory/items/${id}#item-edit`}>
          <Button variant="outline" size="sm">
            编辑
          </Button>
        </Link>

        <Button
          variant="outline"
          size="sm"
          className="text-red-600 hover:text-red-700"
          onClick={() => setConfirming(true)}
        >
          删除
        </Button>
      </div>

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
