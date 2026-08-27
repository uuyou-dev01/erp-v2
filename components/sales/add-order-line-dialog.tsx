"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { AddOrderLineForm } from "@/components/sales/add-order-line-form";
import { ActionDialog } from "@/components/ui/action-dialog";
import { Button } from "@/components/ui/button";

export function AddOrderLineDialog({
  orderId,
  currency,
  storeId,
}: {
  orderId: string;
  currency: string;
  storeId: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        添加商品
      </Button>
      <ActionDialog
        open={open}
        onOpenChange={setOpen}
        title="添加订单商品"
        description="选择 SKU，并填写本次销售数量与单价。"
        size="md"
      >
        {open ? (
          <AddOrderLineForm
            orderId={orderId}
            currency={currency}
            storeId={storeId}
            onSuccess={() => setOpen(false)}
          />
        ) : null}
      </ActionDialog>
    </>
  );
}
