import Link from "next/link";
import { ArrowRight, Box, PackageOpen, Plus, Route, Truck } from "lucide-react";
import { listTransferShipments } from "@/app/actions/transfer-shipments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { formatLocationRegion } from "@/lib/inventory/location-regions";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "待发出确认",
  IN_TRANSIT: "已发出 · 待收货",
  DELIVERED: "收货方已确认",
  EXCEPTION: "运输异常",
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

export default async function TransferShipmentsPage() {
  const shipments = await listTransferShipments();
  const waitingReceipt = shipments.filter((shipment) => shipment.status === "IN_TRANSIT").length;

  return (
    <div>
      <PageHeader
        title="转运包裹"
        description="管理仓库、集运点与代收位置之间的部分转运和混装包裹，不限制国内外方向。"
        badge={<Badge variant="secondary">{waitingReceipt} 个待收货</Badge>}
        actions={
          <Button asChild>
            <Link href="/logistics/transfers/new">
              <Plus className="h-4 w-4" />
              新建转运包裹
            </Link>
          </Button>
        }
      />

      {shipments.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center">
          <Box className="h-9 w-9 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">还没有转运包裹</p>
            <p className="mt-1 text-xs text-muted-foreground">
              可从任意现有仓位挑选部分库存，混装后确认发出。
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/logistics/transfers/new">创建第一个包裹</Link>
          </Button>
        </div>
      ) : (
        <div className="divide-y overflow-hidden rounded-lg border bg-card">
          {shipments.map((shipment) => {
            const sourceLabel = shipment.fromLocation
              ? `${formatLocationRegion(shipment.fromLocation.region)} · ${shipment.fromLocation.name}`
              : "未记录起运位置";
            const destinationLabel = shipment.toLocation
              ? `${formatLocationRegion(shipment.toLocation.region)} · ${shipment.toLocation.name}`
              : "未记录目标位置";
            return (
              <Link
                key={shipment.id}
                href={`/logistics/transfers/${shipment.id}`}
                className="group grid gap-4 px-4 py-4 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
              >
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">
                      {shipment.trackingNo || `转运包裹 ${shipment.id.slice(0, 8)}`}
                    </p>
                    {shipment.carrier ? (
                      <span className="text-xs text-muted-foreground">{shipment.carrier}</span>
                    ) : null}
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <Route className="h-3.5 w-3.5" />
                    <span className="truncate">{sourceLabel}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{destinationLabel}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <PackageOpen className="h-3.5 w-3.5" />
                      {shipment.lineCount} 项 · 共 {shipment.totalQuantity} 件
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Truck className="h-3.5 w-3.5" />
                      发出 {formatDate(shipment.shippedAt)}
                    </span>
                  </div>
                </div>
                <Badge variant={shipment.status === "EXCEPTION" ? "destructive" : "outline"}>
                  {STATUS_LABELS[shipment.status] ?? shipment.status}
                </Badge>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
