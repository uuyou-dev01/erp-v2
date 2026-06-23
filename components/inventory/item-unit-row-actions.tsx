"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteItemUnitAction } from "@/app/actions/item-units";
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
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "删除失败，请重试");
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
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
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
