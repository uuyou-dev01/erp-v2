"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  ClipboardCheck,
  Layers3,
  MoreHorizontal,
  PackagePlus,
  Pencil,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SKUForm, type ParentOption } from "@/components/inventory/sku-form";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteSKUAction } from "@/app/actions/skus";
import { buildProductStocktakeHref } from "@/lib/application/inventory-dashboard";
import {
  SkuStructureDialog,
  type SkuStructureTarget,
} from "@/components/inventory/sku-structure-dialog";

interface SKUDetailActionsProps {
  storeId: string;
  parentOptions: ParentOption[];
  returnHref?: string;
  initialEditOpen?: boolean;
  groupImageEditHref?: string;
  structureSku?: SkuStructureTarget;
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
    categoryId?: string | null;
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
  groupImageEditHref,
  structureSku,
}: SKUDetailActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(initialEditOpen);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [structureOpen, setStructureOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
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
        {sku.catalogRole === "GROUP" ? (
          <Link href={`/inventory/skus/new?mode=variant&parentSkuId=${sku.id}`}>
            <Button size="sm">
              <Layers3 className="mr-1 h-3.5 w-3.5" />
              添加规格
            </Button>
          </Link>
        ) : (
          <Link href={buildProductStocktakeHref({ skuCode: sku.code })}>
            <Button size="sm">
              <ClipboardCheck className="mr-1 h-3.5 w-3.5" />
              调整库存
            </Button>
          </Link>
        )}
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="mr-1 h-3.5 w-3.5" />
          {sku.catalogRole === "VARIANT"
            ? "编辑当前变体"
            : sku.catalogRole === "GROUP"
              ? "编辑商品组"
              : "编辑档案"}
        </Button>
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
          >
            <MoreHorizontal className="mr-1 h-3.5 w-3.5" />
            更多
          </Button>
          {moreOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-full z-30 mt-1 w-48 rounded-md border bg-background p-1 shadow-lg"
            >
              {sku.catalogRole !== "GROUP" ? (
                <Link
                  href={`/inventory/opening-stock/new?skuIds=${sku.id}`}
                  className="flex items-center rounded-sm px-2.5 py-2 text-xs hover:bg-muted"
                  onClick={() => setMoreOpen(false)}
                >
                  <PackagePlus className="mr-2 h-3.5 w-3.5" />
                  录入期初库存
                </Link>
              ) : null}
              {groupImageEditHref ? (
                <Link
                  href={groupImageEditHref}
                  className="flex items-center rounded-sm px-2.5 py-2 text-xs hover:bg-muted"
                  onClick={() => setMoreOpen(false)}
                >
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  编辑商品组档案
                </Link>
              ) : null}
              {(structureSku?.catalogRole || sku.catalogRole) !== "VARIANT" ? (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center rounded-sm px-2.5 py-2 text-left text-xs hover:bg-muted"
                  onClick={() => {
                    setMoreOpen(false);
                    setStructureOpen(true);
                  }}
                >
                  <Workflow className="mr-2 h-3.5 w-3.5" />
                  调整商品结构
                </button>
              ) : null}
              <div className="my-1 border-t" />
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center rounded-sm px-2.5 py-2 text-left text-xs text-red-600 hover:bg-red-50"
                onClick={() => {
                  setMoreOpen(false);
                  setDeleteError(null);
                  setDeleteOpen(true);
                }}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                删除商品档案
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {editOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={closeEdit} />
            <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border bg-background shadow-lg">
              <div className="flex shrink-0 items-center justify-between border-b px-4 py-2.5">
                <h2 className="text-sm font-semibold">
                  {sku.catalogRole === "VARIANT"
                    ? "编辑当前变体"
                    : sku.catalogRole === "GROUP"
                      ? "编辑商品组档案"
                      : "编辑 SKU 档案"}
                </h2>
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
      <SkuStructureDialog
        open={structureOpen}
        target={structureSku || { ...sku, childSkus: [] }}
        onClose={() => setStructureOpen(false)}
      />

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
