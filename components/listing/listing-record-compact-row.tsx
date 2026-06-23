"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { delistListingAction } from "@/app/actions/listings";
import { ListingPlatformMark } from "@/components/listing/listing-platform-mark";
import { QuickSellButton } from "@/components/listing/quick-sell-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import type { ListingCoverageProduct, ListingRecord } from "@/lib/application/listing-coverage";
import { formatListedDaysShort } from "@/lib/application/listing-record-display";
import { formatCurrency } from "@/lib/decimal";
import { AlertCircle } from "lucide-react";

interface ListingRecordCompactRowProps {
  product: ListingCoverageProduct;
  record: ListingRecord;
}

export function ListingRecordCompactRow({ product, record }: ListingRecordCompactRowProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [delisting, setDelisting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const productLabel = `${product.skuCode} · ${product.skuName}`;
  const days = formatListedDaysShort(record.listedAt);
  const isActive = record.state === "active";
  const isItemUnitListing = record.listingScope === "ITEM_UNIT" && record.itemUnitId;
  const currentHref = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  const editHref = `/listing/${record.listingId}?returnTo=${encodeURIComponent(currentHref)}`;
  const [confirmDelistOpen, setConfirmDelistOpen] = useState(false);

  const handleDelist = async () => {
    setActionError(null);
    setDelisting(true);
    try {
      const result = await delistListingAction(record.listingId);
      if (!result.success) {
        setActionError(result.error);
        return;
      }
      setConfirmDelistOpen(false);
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "下架失败");
    } finally {
      setDelisting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background px-2 py-1.5">
      <ListingPlatformMark
        code={record.platformCode}
        name={record.platformName}
        className="h-7 w-7 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium">{record.platformName}</span>
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            {days}
          </span>
          {isItemUnitListing ? (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              单件
            </span>
          ) : null}
        </div>
        {record.listedPrice ? (
          <p className="text-xs text-muted-foreground">
            {formatCurrency(record.listedPrice, record.currency ?? "CNY")}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">未定价</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {isActive ? (
          <>
            <QuickSellButton
              listingId={record.listingId}
              listingType={record.listingScope}
              status={record.status}
              productLabel={`${productLabel} · ${record.platformName}`}
              listedPrice={record.listedPrice}
              currency={record.currency}
              platformName={record.platformName}
              platformFeeRate={record.platformFeeRate}
              defaultShippingFee={record.defaultShippingFee}
              sellableLocations={
                record.listingScope === "SKU" ? product.sellableLocations : []
              }
              compact
            />
            <Link
              href={editHref}
              className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
            >
              编辑
            </Link>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            {record.state === "sold_out" ? "已售" : "已下架"}
          </span>
        )}
        {isActive ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-1.5 text-[10px] text-muted-foreground"
            disabled={delisting}
            onClick={() => {
              setActionError(null);
              setConfirmDelistOpen(true);
            }}
          >
            下架
          </Button>
        ) : null}
      </div>
      {actionError ? (
        <div
          role="alert"
          className="flex basis-full gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive"
        >
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{actionError}</span>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmDelistOpen}
        title="确认下架 Listing"
        description={`确认要下架 ${record.platformName} 上的 ${productLabel} 吗？下架后不会再作为在售库存参与登记售出。`}
        confirmText="确认下架"
        cancelText="取消"
        loading={delisting}
        tone="danger"
        error={actionError}
        onConfirm={handleDelist}
        onCancel={() => {
          setActionError(null);
          setConfirmDelistOpen(false);
        }}
      />
    </div>
  );
}
