import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  HandCoins,
} from "lucide-react";
import { getWalletOverview } from "@/app/actions/wallet";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const earningTypeLabels: Record<string, string> = {
  SELF_SALE_COMMISSION: "自营销售",
  RESALE_COMMISSION: "代卖佣金",
  FULFILLMENT_SERVICE_FEE: "代发服务",
  INSPECTION_SERVICE_FEE: "检查服务",
  STORAGE_SERVICE_FEE: "仓储服务",
  PACKAGING_SERVICE_FEE: "包材服务",
  SUPPLY_PROFIT_SHARE: "供货分成",
  PLATFORM_REVENUE: "平台收益",
  ADJUSTMENT: "收益调整",
};

const statusLabels: Record<string, string> = {
  PENDING: "待对方确认",
  CONFIRMED: "已确认待结清",
  SETTLED: "已线下结清",
  VOID: "已冲销",
};

function formatMoney(currency: string, amount: string) {
  try {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(Number(amount));
  } catch {
    return `${currency} ${Number(amount).toFixed(2)}`;
  }
}

function formatDate(date: Date | null) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function sourceHref(sourceType: string, sourceId: string | null) {
  if (!sourceId) return null;
  if (sourceType === "FULFILLMENT_REQUEST") return `/fulfillment/requests/${sourceId}`;
  if (sourceType === "SETTLEMENT") return `/finance/settlements/${sourceId}`;
  if (sourceType === "PURCHASE_ORDER") return "/fulfillment/requests";
  return null;
}

export default async function WalletPage() {
  const overview = await getWalletOverview();
  const { account, earningSummary, earningEvents } = overview;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">我的收益</h1>
          <p className="text-sm text-muted-foreground">
            记录代卖、代发、检查和仓储等工作带来的个人收益。
          </p>
        </div>
        <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          本页只做记账，不代表系统内真实资金，也不会发起转账。
        </div>
      </div>

      <section className="grid gap-6 border-b pb-8 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <CircleDollarSign className="h-4 w-4" />
            累计记录（{account.currency}）
          </div>
          <div className="text-4xl font-semibold tracking-tight">
            {formatMoney(account.currency, earningSummary.total)}
          </div>
        </div>
        <div className="border-l-0 md:border-l md:pl-6">
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Clock3 className="h-4 w-4" />
            待对方确认
          </div>
          <div className="text-2xl font-semibold">
            {formatMoney(account.currency, earningSummary.pending)}
          </div>
        </div>
        <div className="border-l-0 md:border-l md:pl-6">
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <HandCoins className="h-4 w-4" />
            已确认待结清
          </div>
          <div className="text-2xl font-semibold">
            {formatMoney(account.currency, earningSummary.confirmed)}
          </div>
        </div>
        <div className="border-l-0 md:border-l md:pl-6">
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4" />
            已线下结清
          </div>
          <div className="text-2xl font-semibold">
            {formatMoney(account.currency, earningSummary.settled)}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">收益明细</h2>
            <p className="text-sm text-muted-foreground">每笔收益都能追溯到实际业务动作。</p>
          </div>
        </div>

        {earningEvents.length === 0 ? (
          <div className="border-y py-14 text-center">
            <HandCoins className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">还没有收益记录</p>
            <p className="mt-1 text-sm text-muted-foreground">
              完成代发、检查或代卖结算后，相关记录会出现在这里。
            </p>
            <Link
              href="/fulfillment/requests"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-5")}
            >
              查看合作任务
            </Link>
          </div>
        ) : (
          <div className="divide-y border-y">
            {earningEvents.map((event) => {
              const href = sourceHref(event.sourceType, event.sourceId);
              return (
                <div
                  key={event.id}
                  className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{event.description}</span>
                      <Badge variant="outline">
                        {earningTypeLabels[event.earningType] ?? event.earningType}
                      </Badge>
                      <Badge
                        variant={
                          event.status === "SETTLED"
                            ? "default"
                            : event.status === "VOID"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {statusLabels[event.status] ?? event.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDate(event.settledAt ?? event.occurredAt)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-5 md:justify-end">
                    <span className="text-lg font-semibold tabular-nums">
                      {formatMoney(event.currency, event.earningAmount)}
                    </span>
                    {href ? (
                      <Link
                        href={href}
                        aria-label="查看来源"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
