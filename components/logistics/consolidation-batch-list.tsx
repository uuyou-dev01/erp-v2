import Link from "next/link";
import { ChevronRight, Clock3, PackageOpen, Route } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const STATUS_LABELS: Record<string, string> = {
  OPEN: "待装箱",
  SEALED: "已封箱",
  SHIPPED: "运输中",
  RECEIVED: "已到货",
};

interface Batch {
  id: string;
  status: string;
  outboundTrackingNo: string | null;
  carrier: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  totalQuantity: string;
  contentTitles: string[];
  lines: Array<{ id: string; quantity: string }>;
  fromLocation?: { name: string } | null;
  toLocation?: { name: string } | null;
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(value);
}

function contentLabel(batch: Batch) {
  if (batch.contentTitles.length === 0) {
    return batch.lines.length === 0 ? "暂无商品" : `${batch.lines.length} 项商品`;
  }
  const visibleTitles = batch.contentTitles.slice(0, 2).join("、");
  const remaining = batch.contentTitles.length - 2;
  return remaining > 0 ? `${visibleTitles}，另有 ${remaining} 种` : visibleTitles;
}

function routeLabel(batch: Batch) {
  return (
    [batch.fromLocation?.name, batch.toLocation?.name].filter(Boolean).join(" → ") || "未设置路线"
  );
}

export function ConsolidationBatchList({ batches }: { batches: Batch[] }) {
  if (batches.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        暂无集运批次
      </p>
    );
  }
  return (
    <div className="divide-y overflow-hidden rounded-lg border bg-card">
      {batches.map((batch) => (
        <Link
          key={batch.id}
          href={`/logistics/consolidations/${batch.id}`}
          className="group grid gap-4 px-4 py-4 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
        >
          <div className="min-w-0 space-y-2.5">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                {batch.note?.trim() || contentLabel(batch)}
              </p>
              <span className="shrink-0 text-xs text-muted-foreground">
                批次 {batch.id.slice(0, 8)}
              </span>
            </div>

            {batch.note?.trim() ? (
              <p className="line-clamp-1 max-w-[80ch] text-sm text-muted-foreground">
                <span className="text-foreground/70">内容：</span>
                {contentLabel(batch)}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Route className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{routeLabel(batch)}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <PackageOpen className="h-3.5 w-3.5" aria-hidden="true" />
                {batch.lines.length} 项 · 共 {batch.totalQuantity} 件
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                创建 {formatDateTime(batch.createdAt)}
              </span>
              <span>更新 {formatDateTime(batch.updatedAt)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 md:justify-end">
            {batch.outboundTrackingNo ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                {batch.carrier ? `${batch.carrier} · ` : ""}
                <span className="font-mono">{batch.outboundTrackingNo}</span>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">暂无国际单号</span>
            )}
            <Badge variant="outline" className="shrink-0">
              {STATUS_LABELS[batch.status] ?? "未知状态"}
            </Badge>
            <ChevronRight
              className="hidden h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 md:block"
              aria-hidden="true"
            />
          </div>
        </Link>
      ))}
    </div>
  );
}
