"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SKUForm, type ParentOption } from "@/components/inventory/sku-form";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteSKU } from "@/app/actions/skus";

interface SKUDetailActionsProps {
  storeId: string;
  parentOptions: ParentOption[];
  sku: {
    id: string;
    code: string;
    name: string;
    parentSkuId?: string | null;
    category?: string | null;
    brand?: string | null;
    attributes?: Record<string, unknown> | null;
    description?: string | null;
    imageUrl?: string | null;
  };
}

export function SKUDetailActions({ storeId, parentOptions, sku }: SKUDetailActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await deleteSKU(sku.id);
      router.push("/inventory/skus");
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "删除失败，请重试");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
        <Pencil className="mr-1.5 h-4 w-4" />
        编辑
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="text-red-600 hover:text-red-700"
        onClick={() => setDeleteOpen(true)}
      >
        <Trash2 className="mr-1.5 h-4 w-4" />
        删除
      </Button>

      {editOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[5vh]">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setEditOpen(false)}
            />
            <div className="relative z-10 w-full max-w-2xl pb-10">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">
                  编辑基础资料
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white hover:text-white/80"
                  onClick={() => setEditOpen(false)}
                >
                  关闭
                </Button>
              </div>
              <SKUForm storeId={storeId} parentOptions={parentOptions} initialData={sku} />
            </div>
          </div>,
          document.body
        )}

      <ConfirmDialog
        open={deleteOpen}
        title="确认删除SKU"
        description={`确认要删除「${sku.name}（${sku.code}）」吗？若该SKU已有库存、采购、销售或刊登记录，系统会阻止删除。`}
        confirmText="确认删除"
        cancelText="取消"
        loading={deleteLoading}
        tone="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  );
}
