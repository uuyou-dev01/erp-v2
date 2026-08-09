"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateFulfillmentRequestStatusAction } from "@/app/actions/fulfillment-requests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function FulfillmentActions({
  id,
  status,
  isCollaboration,
  defaultCurrency,
  canProvide,
  canCancel,
}: {
  id: string;
  status: string;
  isCollaboration: boolean;
  defaultCurrency?: string | null;
  canProvide: boolean;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [shippingData, setShippingData] = useState({
    carrier: "",
    trackingNo: "",
    shippingFee: "",
    serviceFee: "",
    shippingCurrency: defaultCurrency ?? "CNY",
    shippingProofUrl: "",
  });

  const updateStatus = async (nextStatus: "ACCEPTED" | "REJECTED" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "EXCEPTION") => {
    setError(null);
    setNotice(null);
    setLoadingAction(nextStatus);
    try {
      const result = await updateFulfillmentRequestStatusAction(id, nextStatus, shippingData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (result.settlement?.message) {
        setNotice(result.settlement.message);
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
      {!terminal && canProvide && (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">发货信息</p>
            <div className="grid gap-2 md:grid-cols-3">
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
                value={shippingData.shippingProofUrl}
                onChange={(event) => setShippingData((prev) => ({ ...prev, shippingProofUrl: event.target.value }))}
                placeholder="发货凭证 URL（选填）"
              />
            </div>
          </div>

          {isCollaboration ? (
            <div className="border-t pt-4">
              <div className="mb-2">
                <p className="text-sm font-medium">本次合作记账</p>
                <p className="text-xs text-muted-foreground">
                  代垫运费是报销，不计入个人收益；代发服务费会进入执行人的“我的收益”。
                </p>
              </div>
              <div className="grid gap-2 md:grid-cols-[1fr_1fr_120px]">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={shippingData.shippingFee}
                  onChange={(event) => setShippingData((prev) => ({ ...prev, shippingFee: event.target.value }))}
                  placeholder="代垫运费（选填）"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={shippingData.serviceFee}
                  onChange={(event) => setShippingData((prev) => ({ ...prev, serviceFee: event.target.value }))}
                  placeholder="代发服务费（选填）"
                />
                <Input
                  value={shippingData.shippingCurrency}
                  onChange={(event) => setShippingData((prev) => ({ ...prev, shippingCurrency: event.target.value.toUpperCase() }))}
                  placeholder="币种"
                />
              </div>
            </div>
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {canProvide && status === "REQUESTED" && (
          <>
            <Button size="sm" disabled={loadingAction === "ACCEPTED"} onClick={() => updateStatus("ACCEPTED")}>
              接受
            </Button>
            <Button variant="outline" size="sm" disabled={loadingAction === "REJECTED"} onClick={() => updateStatus("REJECTED")}>
              拒绝
            </Button>
          </>
        )}
        {canProvide && (status === "REQUESTED" || status === "ACCEPTED") && (
          <Button size="sm" disabled={loadingAction === "SHIPPED"} onClick={() => updateStatus("SHIPPED")}>
            标记发货
          </Button>
        )}
        {canProvide && status === "SHIPPED" && (
          <Button size="sm" disabled={loadingAction === "DELIVERED"} onClick={() => updateStatus("DELIVERED")}>
            标记送达
          </Button>
        )}
        {!terminal && (canProvide || canCancel) && (
          <>
            {canProvide ? <Button variant="outline" size="sm" disabled={loadingAction === "EXCEPTION"} onClick={() => updateStatus("EXCEPTION")}>
              标记异常
            </Button> : null}
            {canCancel ? <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" disabled={loadingAction === "CANCELLED"} onClick={() => updateStatus("CANCELLED")}>
              取消
            </Button> : null}
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
    </div>
  );
}
