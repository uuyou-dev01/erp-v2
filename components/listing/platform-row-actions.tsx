"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deletePlatform } from "@/app/actions/platforms";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

interface PlatformRowActionsProps {
  id: string;
  name: string;
  storeId: string;
}

export function PlatformRowActions({ id, name, storeId }: PlatformRowActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      await deletePlatform(id, storeId);
      setConfirming(false);
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
      <div className="flex items-center justify-end gap-2">
        <Link href={`/listing/platforms/${id}`}>
          <Button variant="ghost" size="sm">
            查看
          </Button>
        </Link>

        <Link href={`/listing/platforms/${id}#platform-edit`}>
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
