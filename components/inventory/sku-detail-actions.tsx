"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SKUForm, type ParentOption } from "@/components/inventory/sku-form";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteSKUAction } from "@/app/actions/skus";

interface SKUDetailActionsProps {
  storeId: string;
  parentOptions: ParentOption[];
  returnHref?: string;
  initialEditOpen?: boolean;
  sku: {
    id: string;
    code: string;
    name: string;
    catalogRole?: string | null;
    manufacturerCode?: string | null;
    variantLabel?: string | null;
    variantAxes?: unknown;
    variantValues?: unknown;
    nameSource?: string | null;
    codeSource?: string | null;
    parentSkuId?: string | null;
    category?: string | null;
    brand?: string | null;
    attributes?: Record<string, unknown> | null;
    description?: string | null;
    imageUrl?: string | null;
  };
}

export function SKUDetailActions({
  storeId,
  parentOptions,
  sku,
  returnHref = "/inventory/skus",
  initialEditOpen = false,
}: SKUDetailActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(initialEditOpen);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (initialEditOpen) setEditOpen(true);
  }, [initialEditOpen]);

  const closeEdit = () => {
    setEditOpen(false);
    if (initialEditOpen) {
      router.replace(`/inventory/skus/${sku.id}`);
    }
  };

  const handleDelete = async () => {
    setDeleteError(null);
    setDeleteLoading(true);
    try {
      const result = await deleteSKUAction(sku.id);
      if (!result.success) {
        setDeleteError(result.error);
        return;
      }
      router.push(returnHref);
      router.refresh();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "删除失败，请重试");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="mr-1 h-3.5 w-3.5" />
          编辑
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-red-600 hover:text-red-700"
          onClick={() => {
            setDeleteError(null);
            setDeleteOpen(true);
          }}
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          删除
        </Button>
      </div>

      {editOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={closeEdit} />
            <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border bg-background shadow-lg">
              <div className="flex shrink-0 items-center justify-between border-b px-4 py-2.5">
                <h2 className="text-sm font-semibold">编辑商品档案</h2>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeEdit}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="overflow-y-auto px-4 py-3">
                <SKUForm
                  compact
                  storeId={storeId}
                  parentOptions={parentOptions}
                  initialData={sku}
                  onSaved={() => {
                    closeEdit();
                    router.refresh();
                  }}
                  onCancel={closeEdit}
                />
              </div>
            </div>
          </div>,
          document.body
        )}

      <ConfirmDialog
        open={deleteOpen}
        title="确认删除 SKU"
        description={`确认删除「${sku.name}（${sku.code}）」？若已有库存、采购、销售、刊登或规格 SKU，系统将阻止删除。`}
        confirmText="确认删除"
        cancelText="取消"
        loading={deleteLoading}
        tone="danger"
        error={deleteError}
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteError(null);
          setDeleteOpen(false);
        }}
      />
    </>
  );
}
