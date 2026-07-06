"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateFulfillmentRequestStatusAction } from "@/app/actions/fulfillment-requests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function FulfillmentActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shippingData, setShippingData] = useState({
    carrier: "",
    trackingNo: "",
    shippingFee: "",
    shippingCurrency: "",
  });

  const updateStatus = async (nextStatus: "ACCEPTED" | "REJECTED" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "EXCEPTION") => {
    setError(null);
    setLoadingAction(nextStatus);
    try {
      const result = await updateFulfillmentRequestStatusAction(id, nextStatus, shippingData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "更新履约状态失败，请重试");
    } finally {
      setLoadingAction(null);
    }
  };

  const terminal = ["DELIVERED", "CANCELLED", "REJECTED"].includes(status);

  return (
    <div className="space-y-3">
      {!terminal && (
        <div className="grid gap-2 md:grid-cols-4">
          <Input
            value={shippingData.carrier}
            onChange={(event) => setShippingData((prev) => ({ ...prev, carrier: event.target.value }))}
            placeholder="承运商"
          />
          <Input
            value={shippingData.trackingNo}
            onChange={(event) => setShippingData((prev) => ({ ...prev, trackingNo: event.target.value }))}
            placeholder="物流单号"
          />
          <Input
            type="number"
            min="0"
            step="0.01"
            value={shippingData.shippingFee}
            onChange={(event) => setShippingData((prev) => ({ ...prev, shippingFee: event.target.value }))}
            placeholder="运费"
          />
          <Input
            value={shippingData.shippingCurrency}
            onChange={(event) => setShippingData((prev) => ({ ...prev, shippingCurrency: event.target.value.toUpperCase() }))}
            placeholder="币种"
          />
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {status === "REQUESTED" && (
          <>
            <Button size="sm" disabled={loadingAction === "ACCEPTED"} onClick={() => updateStatus("ACCEPTED")}>
              接受
            </Button>
            <Button variant="outline" size="sm" disabled={loadingAction === "REJECTED"} onClick={() => updateStatus("REJECTED")}>
              拒绝
            </Button>
          </>
        )}
        {(status === "REQUESTED" || status === "ACCEPTED") && (
          <Button size="sm" disabled={loadingAction === "SHIPPED"} onClick={() => updateStatus("SHIPPED")}>
            标记发货
          </Button>
        )}
        {status === "SHIPPED" && (
          <Button size="sm" disabled={loadingAction === "DELIVERED"} onClick={() => updateStatus("DELIVERED")}>
            标记送达
          </Button>
        )}
        {!terminal && (
          <>
            <Button variant="outline" size="sm" disabled={loadingAction === "EXCEPTION"} onClick={() => updateStatus("EXCEPTION")}>
              标记异常
            </Button>
            <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" disabled={loadingAction === "CANCELLED"} onClick={() => updateStatus("CANCELLED")}>
              取消
            </Button>
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
