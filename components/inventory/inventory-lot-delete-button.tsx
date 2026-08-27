"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert, Trash2 } from "lucide-react";
import {
  deleteInventoryLotAction,
  getInventoryLotDeletionImpactAction,
  type InventoryLotDeletionImpact,
} from "@/app/actions/inventory-lots";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface InventoryLotDeleteButtonProps {
  id: string;
  skuCode: string;
  storeId: string;
  redirectAfterDelete?: string;
  compact?: boolean;
}

export function InventoryLotDeleteButton({
  id,
  skuCode,
  storeId,
  redirectAfterDelete,
  compact = false,
}: InventoryLotDeleteButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [impact, setImpact] = useState<InventoryLotDeletionImpact | null>(null);

  const inspectBeforeDelete = async () => {
    setOpen(true);
    setChecking(true);
    setError(null);
    setImpact(null);
    try {
      const result = await getInventoryLotDeletionImpactAction(id, storeId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setImpact(result.impact);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法检查关联数据，请重试");
    } finally {
      setChecking(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const result = await deleteInventoryLotAction(id, storeId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setOpen(false);
      if (redirectAfterDelete) router.push(redirectAfterDelete);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除失败，请重试");
    } finally {
      setDeleting(false);
    }
  };

  const blocked = Boolean(impact && !impact.canDelete);

  return (
    <>
      <Button
        type="button"
        variant={compact ? "ghost" : "outline"}
        size={compact ? "icon" : "sm"}
        className={
          compact ? "h-8 w-8 text-red-600 hover:text-red-700" : "text-red-600 hover:text-red-700"
        }
        title="删除库存批次"
        aria-label={`删除库存批次 ${skuCode}`}
        onClick={inspectBeforeDelete}
      >
        <Trash2 className={compact ? "h-4 w-4" : "mr-2 h-4 w-4"} />
        {!compact ? "删除批次" : null}
      </Button>

      <ConfirmDialog
        open={open}
        title={blocked ? "该库存批次不能删除" : "确认删除库存批次"}
        description={
          blocked
            ? `批次「${skuCode}」已经形成库存或业务历史。`
            : `确认删除批次「${skuCode}」？系统只会删除未进入业务流程的误建批次。`
        }
        confirmText="确认删除"
        cancelText={blocked ? "知道了" : "取消"}
        loading={deleting}
        tone="danger"
        error={error}
        confirmDisabled={checking || !impact?.canDelete}
        hideConfirm={blocked}
        onConfirm={handleDelete}
        onCancel={() => {
          setOpen(false);
          setImpact(null);
          setError(null);
        }}
      >
        {checking ? (
          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在检查库存流水和业务引用…
          </div>
        ) : null}

        {blocked && impact ? (
          <div className="space-y-3">
            <div className="rounded-md border border-amber-200 bg-amber-50/70 p-3">
              <div className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div>
                  <p className="text-sm font-medium text-amber-950">为什么不能删除</p>
                  <p className="mt-1 text-xs leading-5 text-amber-900/80">
                    删除历史批次会让库存、成本和订单失去来源。即使当前数量为 0，也必须保留历史流水。
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {impact.blockers.map((blocker) => (
                <div key={blocker.key} className="rounded-md border px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{blocker.label}</span>
                    <Badge variant="secondary">{blocker.count}</Badge>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {blocker.description}
                  </p>
                </div>
              ))}
            </div>

            <Link href={`/inventory/skus/${impact.skuId}`} className="block">
              <Button type="button" variant="outline" className="w-full">
                返回商品档案并停用 SKU
              </Button>
            </Link>
          </div>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
