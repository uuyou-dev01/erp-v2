"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  changeSettlementStatusAction,
  createSettlementFromFulfillmentAction,
} from "@/app/actions/settlements";
import { Button } from "@/components/ui/button";

export function SettlementStatusActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const changeStatus = async (nextStatus: "CONFIRMED" | "PAID" | "VOID") => {
    setError(null);
    setLoadingAction(nextStatus);
    try {
      const result = await changeSettlementStatusAction(id, nextStatus);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "更新结算状态失败，请重试");
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-end gap-2">
        {status === "DRAFT" && (
          <Button size="sm" disabled={loadingAction === "CONFIRMED"} onClick={() => changeStatus("CONFIRMED")}>
            确认
          </Button>
        )}
        {status === "CONFIRMED" && (
          <Button size="sm" disabled={loadingAction === "PAID"} onClick={() => changeStatus("PAID")}>
            标记线下已结清
          </Button>
        )}
        {status !== "PAID" && status !== "VOID" && (
          <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" disabled={loadingAction === "VOID"} onClick={() => changeStatus("VOID")}>
            作废
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function CreateSettlementButton({ fulfillmentRequestId, disabled }: { fulfillmentRequestId: string; disabled?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createSettlement = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await createSettlementFromFulfillmentAction(fulfillmentRequestId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push(`/finance/settlements/${result.id}`);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "生成结算单失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button size="sm" disabled={disabled || loading} onClick={createSettlement}>
        {loading ? "生成中..." : "整理结算记录"}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
