"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  changeResaleListingStatusAction,
  deleteDraftResaleListingAction,
} from "@/app/actions/resale-listings";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";

export function ResaleActions({ id, status, title }: { id: string; status: string; title: string }) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"DELISTED" | "DELETE" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const changeStatus = async (nextStatus: "ACTIVE" | "PAUSED" | "DELISTED" | "DRAFT") => {
    setError(null);
    setLoadingAction(nextStatus);
    try {
      const result = await changeResaleListingStatusAction(id, nextStatus);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setConfirmAction(null);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "更新状态失败，请重试");
    } finally {
      setLoadingAction(null);
    }
  };

  const deleteDraft = async () => {
    setError(null);
    setLoadingAction("DELETE");
    try {
      const result = await deleteDraftResaleListingAction(id);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setConfirmAction(null);
      router.push("/resale");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "删除草稿失败，请重试");
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link href={`/resale/${id}/edit`}>
          <Button variant="outline" size="sm">编辑</Button>
        </Link>
        {status === "DRAFT" && (
          <Button size="sm" disabled={loadingAction === "ACTIVE"} onClick={() => changeStatus("ACTIVE")}>
            启用
          </Button>
        )}
        {status === "ACTIVE" && (
          <Button variant="outline" size="sm" disabled={loadingAction === "PAUSED"} onClick={() => changeStatus("PAUSED")}>
            暂停
          </Button>
        )}
        {status === "PAUSED" && (
          <Button size="sm" disabled={loadingAction === "ACTIVE"} onClick={() => changeStatus("ACTIVE")}>
            恢复
          </Button>
        )}
        {(status === "ACTIVE" || status === "PAUSED") && (
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 hover:text-red-700"
            onClick={() => {
              setError(null);
              setConfirmAction("DELISTED");
            }}
          >
            下架
          </Button>
        )}
        {status === "DRAFT" && (
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 hover:text-red-700"
            onClick={() => {
              setError(null);
              setConfirmAction("DELETE");
            }}
          >
            删除草稿
          </Button>
        )}
      </div>

      {error && !confirmAction && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {confirmAction === "DELISTED" && (
        <ConfirmDialog
          open
          title="确认下架代卖"
          description={`确认下架「${title}」吗？下架后不会继续作为本店代卖商品展示。`}
          confirmText="确认下架"
          cancelText="取消"
          loading={loadingAction === "DELISTED"}
          tone="danger"
          error={error}
          onConfirm={() => changeStatus("DELISTED")}
          onCancel={() => {
            setError(null);
            setConfirmAction(null);
          }}
        />
      )}

      {confirmAction === "DELETE" && (
        <ConfirmDialog
          open
          title="确认删除代卖草稿"
          description={`确认删除草稿「${title}」吗？删除后不可恢复。`}
          confirmText="确认删除"
          cancelText="取消"
          loading={loadingAction === "DELETE"}
          tone="danger"
          error={error}
          onConfirm={deleteDraft}
          onCancel={() => {
            setError(null);
            setConfirmAction(null);
          }}
        />
      )}
    </>
  );
}
