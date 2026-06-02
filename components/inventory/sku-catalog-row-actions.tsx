"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteSKU, setSkuCatalogStatus } from "@/app/actions/skus";
import type { CatalogStatus, SkuCatalogListItem } from "@/lib/application/sku-catalog";

interface SkuCatalogRowActionsProps {
  item: SkuCatalogListItem;
}

export function SkuCatalogRowActions({ item }: SkuCatalogRowActionsProps) {
  const router = useRouter();
  const [toggling, setToggling] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const toggleStatus = async () => {
    const next: CatalogStatus = item.catalogStatus === "active" ? "disabled" : "active";
    if (
      next === "disabled" &&
      !confirm(`确认停用「${item.name}」？停用后仍可在列表中筛选查看。`)
    ) {
      return;
    }
    setToggling(true);
    try {
      await setSkuCatalogStatus(item.id, next);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "操作失败");
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await deleteSKU(item.id);
      setDeleteOpen(false);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <div className="flex justify-end gap-0.5">
        <Link href={`/inventory/skus/${item.id}`} title="查看">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Eye className="h-4 w-4" />
          </Button>
        </Link>
        <Link href={`/inventory/skus/${item.id}?edit=1`} title="编辑">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Pencil className="h-4 w-4" />
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-red-600 hover:text-red-700"
          title="删除"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          disabled={toggling}
          onClick={toggleStatus}
        >
          {item.catalogStatus === "active" ? "停用" : "启用"}
        </Button>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="确认删除 SKU"
        description={`确认删除「${item.name}（${item.code}）」？若已有业务引用或子 SKU，将无法删除。`}
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
