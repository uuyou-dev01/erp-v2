"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { confirmOrderAction } from "@/app/actions/customer-orders";
import { AlertCircle, CheckCircle } from "lucide-react";

interface ConfirmOrderButtonProps {
  orderId: string;
}

export function ConfirmOrderButton({ orderId }: ConfirmOrderButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleConfirm = async () => {
    setConfirmOpen(false);
    setError(null);
    setLoading(true);
    try {
      const result = await confirmOrderAction({ orderId });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "确认订单失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      {error ? (
        <div
          role="alert"
          className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}
      <Button
        onClick={() => {
          setError(null);
          setConfirmOpen(true);
        }}
        disabled={loading}
        size="lg"
      >
        <CheckCircle className="mr-2 h-4 w-4" />
        {loading ? "确认中..." : "确认订单"}
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        title="确认订单"
        description="确认该订单？确认后将进入待发货流程。"
        confirmText="确认订单"
        cancelText="返回"
        loading={loading}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
