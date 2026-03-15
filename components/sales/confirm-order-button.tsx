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
      "Confirm this order? This will deduct inventory from stock and write to StockLedger. This action cannot be undone."
    );

    if (!confirmed) return;

    setLoading(true);

    try {
      await confirmOrder({ orderId });
      router.refresh();
    } catch (error) {
      console.error("Failed to confirm order:", error);
      alert(`Failed to confirm order: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleConfirm} disabled={loading} size="lg">
      <CheckCircle className="mr-2 h-4 w-4" />
      {loading ? "Confirming..." : "Confirm Order"}
    </Button>
  );
}
