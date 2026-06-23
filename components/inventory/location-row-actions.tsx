"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteLocationAction } from "@/app/actions/locations";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

interface LocationRowActionsProps {
  id: string;
  name: string;
  storeId: string;
}

export function LocationRowActions({ id, name, storeId }: LocationRowActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await deleteLocationAction(id, storeId);
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
        <Link href={`/inventory/locations/${id}`}>
          <Button variant="ghost" size="sm">
            查看
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
          title="确认删除仓库位置"
          description={`确认要删除位置「${name}」吗？删除后不可恢复。若该位置仍有关联库存或流水，系统会阻止删除并提示原因。`}
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
