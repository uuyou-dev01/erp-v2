import { ReceiptText } from "lucide-react";
import { getChargeLedgerData } from "@/app/actions/charges";
import { ChargeConfigurationPanel, ChargeCreationPanel, ChargeRowActions } from "@/components/finance/charge-ledger-manager";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ChargeStatusBadge } from "@/components/finance/charge-status";

export const dynamic = "force-dynamic";

export default async function ChargesPage() {
  const data = await getChargeLedgerData();
  return <div className="space-y-6">
    <PageHeader title="费用子账" description="预估与实际分开；跨主体费用由服务方提交、付款方确认，确认后才能结算。" badge={<ReceiptText className="h-5 w-5 text-muted-foreground" />} />
    <Card><CardHeader><CardTitle>登记费用</CardTitle></CardHeader><CardContent><ChargeCreationPanel currentOrganizationId={data.currentOrganizationId} organizations={data.organizations} categories={data.categories.map(({ id, name, code, groupCode }) => ({ id, name, code, groupCode }))} /></CardContent></Card>
    <Card><CardHeader><CardTitle>分类与预估规则</CardTitle></CardHeader><CardContent><ChargeConfigurationPanel categories={data.categories.map(({ id, name, code, groupCode }) => ({ id, name, code, groupCode }))} /></CardContent></Card>
    <Card><CardHeader><CardTitle>费用事件</CardTitle></CardHeader><CardContent>
      {data.events.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">暂无费用。</p> : <div className="divide-y">
        {data.events.map((event) => {
          const payer = event.parties.find((party) => party.role === "PAYER");
          const payee = event.parties.find((party) => party.role === "PAYEE");
          return <div key={event.id} className="grid gap-3 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="space-y-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{event.description}</span><Badge variant="outline">{event.category.name}</Badge><ChargeStatusBadge status={event.status} /><Badge variant="secondary">{event.amountKind === "ACTUAL" ? "实际" : "预估"}</Badge></div><p className="text-sm text-muted-foreground">{payer?.nameSnapshot ?? "-"} → {payee?.nameSnapshot ?? "-"} · {event.currency} {event.amount} · 已结算 {event.settledAmount}</p></div>
            <ChargeRowActions id={event.id} status={event.status} currentOrganizationId={data.currentOrganizationId} payerOrganizationId={payer?.organizationId} payeeOrganizationId={payee?.organizationId} />
          </div>;
        })}
      </div>}
    </CardContent></Card>
  </div>;
}
