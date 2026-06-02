"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deletePlatform } from "@/app/actions/platforms";
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

  const handleDelete = async () => {
    setLoading(true);
    try {
      await deletePlatform(id, storeId);
      setConfirming(false);
      router.push("/listing/platforms");
      router.refresh();
    } catch (error) {
      console.error("Failed to delete platform:", error);
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
          onConfirm={handleDelete}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
