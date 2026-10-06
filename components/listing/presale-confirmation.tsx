"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { getPresaleStockCount } from "@/app/actions/listings";
import { validatePresale, type PresaleInput } from "@/lib/application/presale";

export function usePresaleConfirmation() {
  const [description, setDescription] = useState("");
  const resolve = useRef<((value: boolean) => void) | null>(null);
  useEffect(
    () => () => {
      resolve.current?.(false);
    },
    []
  );
  const finish = (value: boolean) => {
    resolve.current?.(value);
    resolve.current = null;
    setDescription("");
  };
  async function confirmPresaleListing(
    input: PresaleInput,
    storeId: string,
    skuId: string,
    platformId: string
  ) {
    if (!input.isPresale) return true;
    validatePresale(input, "SKU");
    const quantity = await getPresaleStockCount(storeId, skuId, platformId);
    setDescription(
      `当前可售库存为 ${quantity}。本次将以预售方式上架，预计 ${input.expectedShipDate} 发货。请确认销售平台已设置预售或延迟发货说明，并已明确告知买家。`
    );
    return new Promise<boolean>((done) => {
      resolve.current = done;
    });
  }
  const presaleConfirmation = description
    ? createPortal(
        <div
          className="fixed inset-0 z-[2000]"
          role="dialog"
          aria-modal="true"
          aria-label="确认预售上架"
        >
          <ConfirmDialog
            open
            title="确认预售上架"
            description={description}
            confirmText="确认预售上架"
            onConfirm={() => finish(true)}
            onCancel={() => finish(false)}
          />
        </div>,
        document.body
      )
    : null;
  return { confirmPresaleListing, presaleConfirmation };
}
