"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { confirmOrder } from "@/app/actions/customer-orders";
import { CheckCircle } from "lucide-react";

interface ConfirmOrderButtonProps {
  orderId: string;
}

export function ConfirmOrderButton({ orderId }: ConfirmOrderButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    const confirmed = confirm(
      "确认该订单？这将从库存中扣减商品并写入库存流水记录。此操作不可撤销。"
    );

    if (!confirmed) return;

    setLoading(true);
    try {
      await confirmOrder({ orderId });
      router.refresh();
    } catch (error) {
      console.error("Failed to confirm order:", error);
      alert(`确认订单失败: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleConfirm} disabled={loading} size="lg">
      <CheckCircle className="mr-2 h-4 w-4" />
      {loading ? "确认中..." : "确认订单"}
    </Button>
  );
}
