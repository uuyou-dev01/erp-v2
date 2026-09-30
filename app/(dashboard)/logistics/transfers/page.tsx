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

export default async function TransferShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const allShipments = await listTransferShipments();
  const waitingReceipt = allShipments.filter((shipment) => shipment.status === "IN_TRANSIT").length;
  const query = params.q?.trim().toLocaleLowerCase() ?? "";
  const filtered = allShipments.filter(
    (shipment) =>
      (!params.status || shipment.status === params.status) &&
      [
        shipment.trackingNo,
        shipment.id,
        shipment.fromLocation?.name,
        shipment.toLocation?.name,
        ...shipment.items.map((item) => `${item.name} ${item.code}`),
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query)
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / 20));
  const page = Math.min(totalPages, Math.max(1, Math.floor(Number(params.page) || 1)));
  const shipments = filtered.slice((page - 1) * 20, page * 20);
  const pageHref = (next: number) =>
    `/logistics/transfers?${new URLSearchParams({ q: params.q ?? "", status: params.status ?? "", page: String(next) })}`;

  return (
    <div>
      <PageHeader
        title="转运包裹"
        description="把库存从一个仓库运到另一个仓库：选择装入商品 → 确认发出 → 收货入库。支持部分转仓和混装包裹。"
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

      <div className="mb-4 flex flex-wrap gap-2" aria-label="转运状态">
        {[
          { value: "", label: "全部", count: allShipments.length },
          ...Object.entries(STATUS_LABELS).map(([value, label]) => ({
            value,
            label,
            count: allShipments.filter((shipment) => shipment.status === value).length,
          })),
        ].map((tab) => (
          <Button
            key={tab.value}
            asChild
            size="sm"
            variant={(params.status ?? "") === tab.value ? "default" : "outline"}
          >
            <Link
              href={`/logistics/transfers?${new URLSearchParams({ status: tab.value, q: params.q ?? "" })}`}
            >
              {tab.label} {tab.count}
            </Link>
          </Button>
        ))}
      </div>
      <form className="mb-4 flex gap-2">
        <input type="hidden" name="status" value={params.status ?? ""} />
        <input
          name="q"
          defaultValue={params.q}
          aria-label="搜索转运包裹"
          placeholder="搜索商品、仓库、物流单号…"
          className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
        />
        <Button type="submit" variant="outline">
          搜索
        </Button>
      </form>
      {shipments.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center">
          <Box className="h-9 w-9 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              {allShipments.length ? "没有匹配的转运包裹" : "还没有转运包裹"}
            </p>
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
                      {shipment.items
                        .slice(0, 3)
                        .map((item) => `${item.name} × ${item.quantity}`)
                        .join("、")}
                      {shipment.items.length > 3 ? ` 等 ${shipment.items.length} 项商品` : ""}
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
                  <p className="text-xs text-muted-foreground">
                    {shipment.trackingNo ? `物流单号 ${shipment.trackingNo}` : "未填写物流单号"} ·
                    包裹 {shipment.id.slice(-8)}
                  </p>
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
                <div className="space-y-2 md:text-right">
                  <Badge variant={shipment.status === "EXCEPTION" ? "destructive" : "outline"}>
                    {STATUS_LABELS[shipment.status] ?? shipment.status}
                  </Badge>
                  <p className="text-xs font-medium text-primary">
                    {shipment.status === "IN_TRANSIT"
                      ? "核对商品并确认收货 →"
                      : shipment.status === "EXCEPTION"
                        ? "查看并处理异常 →"
                        : shipment.status === "PENDING"
                          ? "核对并确认发出 →"
                          : "查看收货明细 →"}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <nav
        aria-label="转运包裹分页"
        className="mt-4 flex items-center justify-between text-sm text-muted-foreground"
      >
        <span>
          共 {filtered.length} 个包裹 · 第 {page} / {totalPages} 页
        </span>
        <div className="flex gap-3">
          {page > 1 && <Link href={pageHref(page - 1)}>上一页</Link>}
          {page < totalPages && <Link href={pageHref(page + 1)}>下一页</Link>}
        </div>
      </nav>
    </div>
  );
}
