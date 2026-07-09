import { Wallet, ArrowDownToLine, CircleDollarSign, LockKeyhole } from "lucide-react";
import { getWalletOverview } from "@/app/actions/wallet";
import { WithdrawalRequestForm } from "@/components/finance/withdrawal-request-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const entryTypeLabels: Record<string, string> = {
  CREDIT: "入账",
  DEBIT: "扣款",
  HOLD: "冻结",
  RELEASE: "释放",
  WITHDRAWAL: "提现",
  ADJUSTMENT: "调整",
};

const withdrawalStatusLabels: Record<string, string> = {
  REQUESTED: "申请中",
  APPROVED: "已批准",
  PAID: "已打款",
  REJECTED: "已拒绝",
  CANCELLED: "已取消",
};

function formatMoney(currency: string, amount: string) {
  return `${currency} ${amount}`;
}

function formatDate(date: Date | null) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function WalletPage() {
  const overview = await getWalletOverview();
  const { account, summary } = overview;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">钱包</h1>
        <p className="text-muted-foreground">查看收益入账、提现冻结和人工打款记录。</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">可提现余额</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatMoney(account.currency, summary.availableBalance)}
            </div>
            <p className="text-xs text-muted-foreground">钱包状态 {account.status}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">冻结中</CardTitle>
            <LockKeyhole className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatMoney(account.currency, summary.heldBalance)}
            </div>
            <p className="text-xs text-muted-foreground">提现申请占用</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">累计入账</CardTitle>
            <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatMoney(account.currency, summary.earnedBalance)}
            </div>
            <p className="text-xs text-muted-foreground">收益确认后的入账</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">累计提现</CardTitle>
            <ArrowDownToLine className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatMoney(account.currency, summary.withdrawnBalance)}
            </div>
            <p className="text-xs text-muted-foreground">已人工打款确认</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>申请提现</CardTitle>
        </CardHeader>
        <CardContent>
          <WithdrawalRequestForm
            currency={account.currency}
            availableBalance={summary.availableBalance}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>提现记录</CardTitle>
          </CardHeader>
          <CardContent>
            {overview.withdrawalRequests.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">暂无提现申请</p>
            ) : (
              <div className="divide-y divide-border">
                {overview.withdrawalRequests.map((request) => (
                  <div key={request.id} className="grid gap-2 py-4 md:grid-cols-[1fr_auto]">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{request.requestNo}</span>
                        <Badge variant="secondary">
                          {withdrawalStatusLabels[request.status] ?? request.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {request.paymentMethod ?? "未填写"} · {request.paymentAccount ?? "未填写账号"}
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <div className="font-medium">
                        {formatMoney(request.currency, request.amount)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(request.paidAt ?? request.createdAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>钱包流水</CardTitle>
          </CardHeader>
          <CardContent>
            {overview.ledgerEntries.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">暂无钱包流水</p>
            ) : (
              <div className="divide-y divide-border">
                {overview.ledgerEntries.map((entry) => (
                  <div key={entry.id} className="grid gap-2 py-4 md:grid-cols-[1fr_auto]">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {entryTypeLabels[entry.entryType] ?? entry.entryType}
                        </span>
                        <Badge variant="outline">{entry.status}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {entry.description ?? entry.sourceType ?? "钱包流水"}
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <div className="font-medium">{formatMoney(entry.currency, entry.amount)}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(entry.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
