"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { delistListingAction } from "@/app/actions/listings";
import { ListingPlatformMark } from "@/components/listing/listing-platform-mark";
import { QuickSellButton } from "@/components/listing/quick-sell-button";
import type { ListingOpsItem, ListingOpsRisk } from "@/components/listing/listing-ops-types";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/ui/product-image";
import { TableCell, TableRow } from "@/components/ui/table";
import { AlertCircle, AlertTriangle, PowerOff } from "lucide-react";

interface ListingOpsCardProps {
  listing: ListingOpsItem;
}

function statusLabel(status: string) {
  if (status === "ACTIVE") return "在售中";
  if (status === "DELISTED") return "已下架";
  if (status === "SOLD_OUT") return "已售罄";
  return status;
}

function statusVariant(status: string): "default" | "destructive" | "outline" {
  if (status === "ACTIVE") return "default";
  if (status === "SOLD_OUT") return "destructive";
  return "outline";
}

function riskClassName(risk: ListingOpsRisk) {
  if (risk.tone === "red") return "border-red-500/30 bg-red-500/10 text-red-700";
  if (risk.tone === "amber") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-700";
  }
  return "border-slate-500/30 bg-slate-500/10 text-slate-700";
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN");
}

export function ListingOpsCard({ listing }: ListingOpsCardProps) {
  const router = useRouter();
  const [delisting, setDelisting] = useState(false);
  const [confirmDelistOpen, setConfirmDelistOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleDelist = async () => {
    setActionError(null);
    setDelisting(true);
    try {
      const result = await delistListingAction(listing.id);
      if (!result.success) {
        setActionError(result.error);
        return;
      }
      setConfirmDelistOpen(false);
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "下架失败，请重试");
    } finally {
      setDelisting(false);
    }
  };

  const productLabel = `${listing.skuCode} · ${listing.skuName}`;
  const priceLabel = listing.listedPrice
    ? `${listing.currency ?? ""} ${listing.listedPrice}`
    : "未定价";
  const stockLabel =
    listing.listingType === "ITEM_UNIT" ? "单品 1 件" : `可发 ${listing.sellableQty}`;
  const feeRateLabel = listing.platformFeeRate
    ? `${(Number(listing.platformFeeRate) * 100).toFixed(1)}%`
    : "未设置费率";
  const shippingFeeLabel = listing.defaultShippingFee
    ? `${listing.currency ?? ""} ${listing.defaultShippingFee}`
    : "未设置邮费";

  return (
    <>
      <TableRow>
      <TableCell>
        <div className="flex min-w-0 items-center gap-3">
          <ProductImage
            src={listing.imageUrl}
            alt={listing.skuName}
            size="sm"
            className="shrink-0 rounded-md"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{listing.skuName}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {listing.skuCode}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <ListingPlatformMark
            code={listing.platform.code}
            name={listing.platform.name}
            className="h-7 w-7 text-[10px]"
          />
          <span className="whitespace-nowrap text-sm font-medium">
            {listing.platform.name}
          </span>
        </div>
        <p className="mt-1 whitespace-nowrap text-xs text-muted-foreground">
          费率 {feeRateLabel} · 邮费 {shippingFeeLabel}
        </p>
      </TableCell>
      <TableCell>
        <Badge variant={statusVariant(listing.status)}>
          {statusLabel(listing.status)}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <p className="font-medium">{priceLabel}</p>
        <p className="text-xs text-muted-foreground">
          到手 {listing.estimatedNet ? `${listing.currency ?? ""} ${listing.estimatedNet}` : "-"}
        </p>
      </TableCell>
      <TableCell className="whitespace-nowrap">{stockLabel}</TableCell>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
        <div>上架 {formatDate(listing.listedAt)}</div>
        <div>更新 {formatDate(listing.updatedAt)}</div>
      </TableCell>
      <TableCell>
        {listing.risks.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {listing.risks.map((risk) => (
              <Badge
                key={`${risk.key}-${risk.label}`}
                variant="outline"
                className={riskClassName(risk)}
              >
                <AlertTriangle className="mr-1 h-3 w-3" />
                {risk.label}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-xs text-emerald-700">
            暂无运营风险
          </span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-end gap-2">
          <div className="flex justify-end gap-1.5">
            <QuickSellButton
              listingId={listing.id}
              listingType={listing.listingType}
              status={listing.status}
              productLabel={productLabel}
              listedPrice={listing.listedPrice}
              currency={listing.currency}
              platformName={listing.platform.name}
              platformFeeRate={listing.platformFeeRate}
              defaultShippingFee={listing.defaultShippingFee}
              sellableLocations={
                listing.listingType === "SKU" ? listing.sellableLocations : []
              }
            />
            {listing.status === "ACTIVE" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => {
                  setActionError(null);
                  setConfirmDelistOpen(true);
                }}
                disabled={delisting}
              >
                <PowerOff className="mr-1 h-3.5 w-3.5" />
                {delisting ? "下架中..." : "下架"}
              </Button>
            ) : null}
          </div>
          {actionError ? (
            <div
              role="alert"
              className="flex max-w-56 gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-left text-xs text-destructive"
            >
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{actionError}</span>
            </div>
          ) : null}
        </div>
      </TableCell>
      </TableRow>
      <ConfirmDialog
        open={confirmDelistOpen}
        title="确认下架 Listing"
        description={`确认要下架「${listing.platform.name}」上的 ${productLabel} 吗？下架后不会再作为在售库存参与登记售出。`}
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
    </>
  );
}
