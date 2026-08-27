"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { AddPurchaseLineForm } from "@/components/procurement/add-purchase-line-form";
import { ActionDialog } from "@/components/ui/action-dialog";
import { Button } from "@/components/ui/button";

export function AddPurchaseLineDialog({
  purchaseOrderId,
  currency,
  storeId,
}: {
  purchaseOrderId: string;
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
        title="添加采购商品"
        description="选择 SKU，并填写库存管理方式、采购数量与单价。"
        size="lg"
      >
        {open ? (
          <AddPurchaseLineForm
            purchaseOrderId={purchaseOrderId}
            currency={currency}
            storeId={storeId}
            onSuccess={() => setOpen(false)}
          />
        ) : null}
      </ActionDialog>
    </>
  );
}
