"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { reportMoney, reportCsv } from "@/lib/application/operating-report-math";

export const statusLabels: Record<string, string> = {
  DRAFT: "草稿",
  PLACED: "已下单",
  PAID: "已付款",
  CONFIRMED: "已确认",
  SHIPPED: "已发货",
  DELIVERED: "已送达",
  CANCELLED: "已取消",
  RETURNED: "已退货",
  ORDERED: "已下单",
  RECEIVED: "已收货",
  ACTIVE: "在库批次",
  AVAILABLE: "可用单品",
  ACTUAL: "实际",
  ESTIMATE: "预估",
  SUBMITTED: "待确认",
  PARTIALLY_SETTLED: "部分结算",
  SETTLED: "已结算",
  VOID: "已作废",
  DISPUTED: "有争议",
};
export const directionLabels: Record<string, string> = {
  PAYABLE: "应付",
  RECEIVABLE: "应收",
  INFORMATIONAL: "说明行",
};
export const numberClass = "text-right tabular-nums whitespace-nowrap";

export function Section({
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("min-w-0 overflow-hidden rounded-lg border bg-card", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description && (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
      {children}
    </div>
  );
}
export function Empty({
  children,
  href,
  action,
}: {
  children: ReactNode;
  href?: string;
  action?: string;
}) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center gap-3 px-5 py-8 text-center">
      <p className="text-sm text-muted-foreground">{children}</p>
      {href && (
        <Link className="text-sm font-medium text-blue-700 hover:underline" href={href}>
          {action ?? "查看业务单据"}
        </Link>
      )}
    </div>
  );
}
export function downloadCsv(name: string, rows: Array<Array<string | number | null>>) {
  const url = URL.createObjectURL(new Blob([reportCsv(rows)], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
export function Metric({
  title,
  value,
  description,
  onClick,
  highlight,
}: {
  title: string;
  value: string;
  description: string;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group min-w-0 rounded-lg border bg-card px-5 py-4 text-left transition-colors hover:border-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600",
        highlight && "border-blue-200 bg-blue-50/50"
      )}
    >
      <span className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        {title}
        <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-blue-600" />
      </span>
      <span
        className={cn(
          "mt-3 block break-words text-2xl font-semibold tracking-tight tabular-nums",
          highlight && "text-blue-700"
        )}
      >
        {value}
      </span>
      <span className="mt-2 block text-xs leading-5 text-muted-foreground">{description}</span>
    </button>
  );
}
export function Amount({ value }: { value: string | null }) {
  return (
    <span
      className={cn(
        value === null && "text-amber-700",
        value !== null && Number(value) < 0 && "text-red-700"
      )}
    >
      {reportMoney(value)}
    </span>
  );
}
