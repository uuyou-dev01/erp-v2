import Link from "next/link";
import { notFound } from "next/navigation";
import { getSettlementById } from "@/app/actions/settlements";
import { SettlementStatusActions } from "@/components/finance/settlement-actions";
import { SettlementStatusBadge } from "@/components/finance/settlement-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function formatMoney(currency: string | null, amount: string | null) {
  if (!amount) return "-";
  return `${currency ?? ""} ${amount}`.trim();
}

export default async function SettlementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const settlement = await getSettlementById(id);
  if (!settlement) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold">{settlement.settlementNo}</h1>
            <SettlementStatusBadge status={settlement.status} />
          </div>
          <p className="text-muted-foreground">
            结算对象：{settlement.partner?.name ?? "未指定"} · 方向：{settlement.direction}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <SettlementStatusActions id={settlement.id} status={settlement.status} />
          <Link href="/finance/settlements">
            <Button variant="ghost" size="sm">返回结算</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">结算金额</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{formatMoney(settlement.currency, settlement.totalAmount)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">本位币金额</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{formatMoney(settlement.baseCurrency, settlement.baseAmount)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">履约请求</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold">{settlement.fulfillmentRequest?.requestNo ?? "-"}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>结算行</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            {settlement.lines.map((line) => (
              <div key={line.id} className="grid gap-3 py-4 md:grid-cols-[1fr_auto_auto] md:items-center">
                <div>
                  <div className="font-medium">{line.description}</div>
                  <div className="text-sm text-muted-foreground">{line.lineType} · {line.direction}</div>
                </div>
                <div className="text-sm text-muted-foreground">{line.sourceType ?? "-"}</div>
                <div className="font-medium">{formatMoney(line.currency, line.amount)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
