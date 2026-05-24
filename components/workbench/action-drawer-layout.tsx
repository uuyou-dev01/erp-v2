"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import type { WorkItemDetail } from "@/lib/application/workflow-queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ActionDrawerLayout({
  header,
  context,
  suggestions,
  children,
  footer,
}: {
  header: ReactNode;
  context?: ReactNode;
  suggestions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col bg-background">
      {header}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {context}
        <section className="rounded-lg border bg-card p-4 shadow-sm">{children}</section>
        {suggestions}
      </div>
      {footer}
    </div>
  );
}

export function ActionDrawerHeader({
  detail,
  title,
  description,
  onClose,
}: {
  detail: WorkItemDetail;
  title: string;
  description: string;
  onClose?: () => void;
}) {
  return (
    <header className="border-b px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">下一步动作</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            关闭
          </Button>
        )}
      </div>
      <div className="mt-3 min-w-0">
        <p className="truncate text-sm font-medium">{detail.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{detail.currentStatusLabel}</Badge>
          <Badge variant="outline">{detail.primaryActionLabel}</Badge>
        </div>
      </div>
    </header>
  );
}

export function ContextSummaryCard({ detail }: { detail: WorkItemDetail }) {
  const rows = [
    ["平台", detail.actionContext.platform ?? detail.actionContext.listingPlatformsText],
    ["位置", detail.actionContext.currentLocationText ?? detail.actionContext.location ?? detail.shipments[0]?.toLocation],
    ["物流", detail.actionContext.trackingNo ?? detail.actionContext.purchaseTrackingNo ?? detail.actionContext.transitTrackingNo],
  ].filter(([, value]) => Boolean(value));

  if (rows.length === 0 && !detail.exceptionMessage) return null;

  return (
    <section className="rounded-lg border bg-muted/30 p-3">
      <div className="grid gap-2 text-sm">
        {rows.slice(0, 3).map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="truncate text-right text-xs font-medium">{value}</span>
          </div>
        ))}
        {detail.exceptionMessage && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
            {detail.exceptionMessage}
          </div>
        )}
      </div>
    </section>
  );
}

function compactNumber(value?: string) {
  if (!value) return "-";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
}

export function PurchaseLinesCard({ detail }: { detail: WorkItemDetail }) {
  const lines = detail.lineItems ?? [];
  if (lines.length === 0) return null;

  return (
    <section className="rounded-lg border bg-card p-3">
      <div className="mb-2">
        <p className="text-xs font-medium text-foreground">采购明细</p>
        {detail.entityType === "purchaseOrder" && (
          <p className="mt-1 text-xs text-muted-foreground">
            当前操作会应用到整张采购单，共 {lines.length} 个购入明细。
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        {lines.map((line) => (
          <div key={line.id} className="rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate font-medium">
                {line.title}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                x{compactNumber(line.quantity)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 text-muted-foreground">
              <span>{line.conditionType ?? "默认批次管理"}</span>
              <span>
                单价 {compactNumber(line.unitPrice)} · 金额 {compactNumber(line.lineAmount)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function SmartSuggestionPanel({ suggestions }: { suggestions: string[] }) {
  if (suggestions.length === 0) return null;

  return (
    <section className="rounded-lg border bg-slate-50 p-3">
      <p className="text-xs font-medium text-foreground">智能建议</p>
      <div className="mt-2 space-y-1.5">
        {suggestions.map((suggestion) => (
          <p key={suggestion} className="text-xs leading-5 text-muted-foreground">
            {suggestion}
          </p>
        ))}
      </div>
    </section>
  );
}

export function ActionFooter({
  detailHref,
  children,
  className,
}: {
  detailHref?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <footer className={cn("border-t bg-background/95 px-4 py-3", className)}>
      <div className="flex items-center justify-between gap-3">
        {detailHref ? (
          <Link
            href={detailHref}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            查看完整详情
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">详情页承载完整生命周期</span>
        )}
        {children}
      </div>
    </footer>
  );
}
