"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, Loader2, Pencil, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  deleteSKUAction,
  getSKUDeletionImpactAction,
  setSkuCatalogStatusAction,
  type SKUDeletionImpact,
} from "@/app/actions/skus";
import type { CatalogStatus, SkuCatalogListItem } from "@/lib/application/sku-catalog";

interface SkuCatalogRowActionsProps {
  item: SkuCatalogListItem;
}

export function SkuCatalogRowActions({ item }: SkuCatalogRowActionsProps) {
  const router = useRouter();
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteImpactLoading, setDeleteImpactLoading] = useState(false);
  const [deleteImpact, setDeleteImpact] = useState<SKUDeletionImpact | null>(null);

  const changeStatus = async (next: CatalogStatus) => {
    setToggleError(null);
    setToggling(true);
    try {
      const result = await setSkuCatalogStatusAction(item.id, next);
      if (!result.success) {
        setToggleError(result.error);
        return false;
      }
      setDisableOpen(false);
      router.refresh();
      return true;
    } catch (e) {
      setToggleError(e instanceof Error ? e.message : "操作失败");
      return false;
    } finally {
      setToggling(false);
    }
  };

  const openDeleteDialog = async () => {
    setDeleteError(null);
    setDeleteImpact(null);
    setDeleteOpen(true);
    setDeleteImpactLoading(true);
    try {
      const result = await getSKUDeletionImpactAction(item.id);
      if (!result.success) {
        setDeleteError(result.error);
        return;
      }
      setDeleteImpact(result.impact);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "无法检查关联数据，请重试");
    } finally {
      setDeleteImpactLoading(false);
    }
  };

  const disableFromDeleteDialog = async () => {
    const success = await changeStatus("disabled");
    if (success) {
      setDeleteOpen(false);
      setDeleteImpact(null);
    }
  };

  const toggleStatus = async () => {
    const next: CatalogStatus = item.catalogStatus === "active" ? "disabled" : "active";
    if (next === "disabled") {
      setToggleError(null);
      setDisableOpen(true);
      return;
    }
    await changeStatus(next);
  };

  const handleDelete = async () => {
    setDeleteError(null);
    setDeleteLoading(true);
    try {
      const result = await deleteSKUAction(item.id);
      if (!result.success) {
        setDeleteError(result.error);
        return;
      }
      setDeleteOpen(false);
      router.refresh();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <div className="space-y-1 text-right">
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
            onClick={openDeleteDialog}
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
        {toggleError && <p className="text-xs text-destructive">{toggleError}</p>}
      </div>

      <ConfirmDialog
        open={disableOpen}
        title="确认停用 SKU"
        description={`确认停用「${item.name}」？停用后仍可在列表中筛选查看。`}
        confirmText="确认停用"
        cancelText="取消"
        loading={toggling}
        tone="danger"
        error={toggleError}
        onConfirm={() => changeStatus("disabled")}
        onCancel={() => {
          setToggleError(null);
          setDisableOpen(false);
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        title={deleteImpact && !deleteImpact.canDelete ? "该 SKU 不能直接删除" : "确认删除 SKU"}
        description={
          deleteImpact && !deleteImpact.canDelete
            ? `「${item.name}（${item.code}）」仍被以下数据引用。`
            : `确认删除「${item.name}（${item.code}）」？删除后不可恢复。`
        }
        confirmText="确认删除"
        cancelText="取消"
        loading={deleteLoading || toggling}
        tone="danger"
        error={deleteError}
        confirmDisabled={deleteImpactLoading || !deleteImpact?.canDelete}
        hideConfirm={Boolean(deleteImpact && !deleteImpact.canDelete)}
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteError(null);
          setDeleteImpact(null);
          setDeleteOpen(false);
        }}
      >
        {deleteImpactLoading ? (
          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在检查库存和业务引用…
          </div>
        ) : null}

        {deleteImpact && !deleteImpact.canDelete ? (
          <div className="space-y-3">
            <div className="rounded-md border border-amber-200 bg-amber-50/70 p-3">
              <div className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-amber-950">为什么不能删除</p>
                  <p className="mt-1 text-xs leading-5 text-amber-900/80">
                    {deleteImpact.hasBusinessHistory
                      ? "采购和销售记录属于业务历史。强制删除会导致订单、成本与利润无法追溯，因此系统只允许停用。"
                      : "请先迁移规格 SKU，或处理仍在使用的库存与刊登；不再经营时可直接停用档案。"}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              {deleteImpact.references.map((reference) => (
                <Link
                  key={reference.key}
                  href={reference.href}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted/50"
                  onClick={() => setDeleteOpen(false)}
                >
                  <span className="flex items-center gap-2">
                    <span>{reference.label}</span>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      {reference.count}
                    </Badge>
                  </span>
                  <span className="flex items-center gap-1 text-xs text-primary">
                    查看
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              ))}
            </div>

            {item.catalogStatus === "active" ? (
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center"
                disabled={toggling}
                onClick={disableFromDeleteDialog}
              >
                {toggling ? "停用中..." : "改为停用 SKU"}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                该 SKU 已停用，无需删除；历史订单仍会保留并可正常查询。
              </p>
            )}
          </div>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
