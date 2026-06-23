"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deletePlatformAction } from "@/app/actions/platforms";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

interface PlatformDeleteButtonProps {
  id: string;
  name: string;
  storeId: string;
}

export function PlatformDeleteButton({ id, name, storeId }: PlatformDeleteButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await deletePlatformAction(id, storeId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      router.push("/listing/platforms");
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
        删除平台
      </Button>

      {confirming && (
        <ConfirmDialog
          open={confirming}
          title="确认删除销售平台"
          description={`确认要删除平台「${name}」吗？删除后不可恢复。若仍有关联上架或订单，系统会阻止删除并提示原因。`}
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
