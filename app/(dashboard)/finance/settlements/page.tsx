import Link from "next/link";
import { FileText } from "lucide-react";
import { getSettlements } from "@/app/actions/settlements";
import { SettlementStatusBadge } from "@/components/finance/settlement-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function formatMoney(currency: string | null, amount: string | null) {
  if (!amount) return "-";
  return `${currency ?? ""} ${amount}`.trim();
}

export default async function SettlementsPage() {
  const settlements = await getSettlements();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">结算单</h1>
        <p className="text-muted-foreground">管理代卖、供货和代发履约产生的应收应付。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>结算列表</CardTitle>
        </CardHeader>
        <CardContent>
          {settlements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">暂无结算单</h3>
              <p className="mb-4 max-w-md text-sm text-muted-foreground">
                在已发货或已送达的履约请求中生成结算单。
              </p>
              <Link href="/fulfillment/requests">
                <Button>查看履约请求</Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {settlements.map((settlement) => (
                <div key={settlement.id} className="grid gap-3 py-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/finance/settlements/${settlement.id}`} className="font-semibold hover:underline">
                        {settlement.settlementNo}
                      </Link>
                      <SettlementStatusBadge status={settlement.status} />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      对象 {settlement.partner?.name ?? "未指定"} · 履约 {settlement.fulfillmentRequest?.requestNo ?? "-"}
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-4">
                    <div className="text-sm">
                      <div className="text-muted-foreground">金额</div>
                      <div className="font-medium">{formatMoney(settlement.currency, settlement.totalAmount)}</div>
                    </div>
                    <Link href={`/finance/settlements/${settlement.id}`}>
                      <Button variant="outline" size="sm">查看</Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
