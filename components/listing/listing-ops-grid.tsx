"use client";

import { Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { BundleSellDialog } from "@/components/listing/bundle-sell-dialog";
import { ListingOpsCard } from "@/components/listing/listing-ops-card";
import type { ListingOpsItem } from "@/components/listing/listing-ops-types";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ListingOpsGridProps {
  listings: ListingOpsItem[];
  view?: "active" | "soldOut";
  returnTo?: string;
}

export function ListingOpsGrid({
  listings,
  view = "active",
  returnTo = "/listing",
}: ListingOpsGridProps) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionError, setSelectionError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const visibleIds = new Set(listings.map((listing) => listing.id));
    setSelectedIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [listings]);

  if (listings.length === 0) {
    return (
      <EmptyState
        icon={Globe}
        title={view === "soldOut" ? "暂无售罄或下架记录" : "暂无符合条件的 Listing"}
        description={
          view === "soldOut"
            ? "Listing 售罄或下架后会统一归档到这里，需要时可以再次上架。"
            : "调整平台、状态或风险筛选后再查看。"
        }
        actionLabel="查看可售库存"
        actionHref="/inventory/sellable?unlisted=1"
      />
    );
  }

  const selectedListings = selectedIds
    .map((id) => listings.find((listing) => listing.id === id))
    .filter((listing): listing is ListingOpsItem => Boolean(listing));

  const toggleSelection = (listing: ListingOpsItem) => {
    setSelectionError("");
    if (selectedIds.includes(listing.id)) {
      setSelectedIds((current) => current.filter((id) => id !== listing.id));
      return;
    }
    if (listing.status !== "ACTIVE" || listing.sellableQty <= 0) {
      setSelectionError("只有存在可发库存的在售 Listing 可以打包出售");
      return;
    }
    if (listing.hasResaleSource) {
      setSelectionError("代卖商品需要逐项预留和结算，当前版本暂不能加入普通打包订单");
      return;
    }
    if (!listing.salesChannelAccountId) {
      setSelectionError("该 Listing 尚未关联明确的销售店铺账号，请先补齐账号归属");
      return;
    }
    if (!listing.currency) {
      setSelectionError("该 Listing 尚未设置成交币种，不能加入打包订单");
      return;
    }
    const anchor = selectedListings[0];
    if (anchor && anchor.platform.id !== listing.platform.id) {
      setSelectionError("同一个打包订单只能选择同一销售平台的商品");
      return;
    }
    if (anchor && anchor.salesChannelAccountId !== listing.salesChannelAccountId) {
      setSelectionError("同一个打包订单只能选择同一平台店铺账号的商品");
      return;
    }
    if (anchor && anchor.currency?.toUpperCase() !== listing.currency.toUpperCase()) {
      setSelectionError("同一个打包订单只能选择相同币种的商品");
      return;
    }
    const candidates = [...selectedListings, listing];
    const hasCommonLocation = candidates[0].sellableLocations.some((location) =>
      candidates.every((candidate) =>
        candidate.sellableLocations.some(
          (candidateLocation) => candidateLocation.locationId === location.locationId
        )
      )
    );
    if (!hasCommonLocation) {
      setSelectionError("该商品与已选商品不在同一可发仓，无法合并为一个包裹");
      return;
    }
    setSelectedIds((current) => [...current, listing.id]);
  };

  const leaveSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds([]);
    setSelectionError("");
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5">
        <div>
          <p className="text-sm font-medium">
            {selectionMode
              ? `已选择 ${selectedIds.length} 条 Listing`
              : view === "soldOut"
                ? "售罄 / 下架商品"
                : "上架商品"}
          </p>
          <p className={`text-xs ${selectionError ? "text-destructive" : "text-muted-foreground"}`}>
            {selectionError ||
              (view === "soldOut"
                ? "历史记录与当前上架商品分开管理，可直接再次上架"
                : selectionMode
                  ? "选择同平台、同币种且可从同一仓库发货的商品"
                  : "需要把多款商品合成一单时，可使用打包出售")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectionMode ? (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={leaveSelectionMode}>
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={selectedIds.length < 2}
                onClick={() => setDialogOpen(true)}
              >
                填写打包单
              </Button>
            </>
          ) : view === "active" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectionMode(true)}
            >
              打包出售
            </Button>
          ) : null}
        </div>
      </div>
      <div className="max-h-[calc(100vh-8rem)] overflow-auto [&>div]:overflow-visible">
        <Table className="min-w-[960px]">
          <TableHeader className="sticky top-0 z-20 bg-background shadow-[0_1px_0_hsl(var(--border))]">
            <TableRow>
              <TableHead className={selectionMode ? "min-w-[300px]" : "min-w-[260px]"}>
                商品
              </TableHead>
              <TableHead>平台</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>平台售价</TableHead>
              <TableHead>库存</TableHead>
              <TableHead>时间</TableHead>
              <TableHead>风险</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listings.map((listing) => (
              <ListingOpsCard
                key={listing.id}
                listing={listing}
                selectionMode={selectionMode}
                selected={selectedIds.includes(listing.id)}
                onToggleSelection={() => toggleSelection(listing)}
                returnTo={returnTo}
              />
            ))}
          </TableBody>
        </Table>
      </div>
      <BundleSellDialog
        open={dialogOpen}
        listings={selectedListings}
        onClose={() => {
          setDialogOpen(false);
          leaveSelectionMode();
        }}
      />
    </div>
  );
}
