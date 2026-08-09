import { FileSpreadsheet } from "lucide-react";
import { getChannelStatementData } from "@/app/actions/channel-statements";
import { ChannelStatementActions, ChannelStatementImporter } from "@/components/finance/channel-statement-manager";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

function readImportTemplates(settings: unknown): Record<string, Record<string, string>> {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return {};
  const templates = (settings as Record<string, unknown>).statementImportTemplates;
  if (!templates || typeof templates !== "object" || Array.isArray(templates)) return {};
  return Object.fromEntries(Object.entries(templates).filter(([, mapping]) => mapping && typeof mapping === "object" && !Array.isArray(mapping))) as Record<string, Record<string, string>>;
}

export default async function ChannelStatementsPage() {
  const data = await getChannelStatementData();
  return <div className="space-y-6">
    <PageHeader title="平台账单与净到账" description="保留订单成交毛额，通过账单行核对平台费、平台面单、退款、税费和净到账。" badge={<FileSpreadsheet className="h-5 w-5 text-muted-foreground" />} />
    <Card><CardHeader><CardTitle>导入通用 CSV</CardTitle></CardHeader><CardContent><p className="mb-4 text-sm text-muted-foreground">标准列：externalLineId、lineType、externalOrderNo、amount、currency、description、occurredAt。费用和退款使用负数，到账行使用 PAYOUT。</p><ChannelStatementImporter channels={data.channels.map(({ id, name, defaultCurrency, settings }) => ({ id, name, defaultCurrency, importTemplates: readImportTemplates(settings) }))} /></CardContent></Card>
    <Card><CardHeader><CardTitle>账单记录</CardTitle></CardHeader><CardContent>
      {data.statements.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">暂无平台账单。</p> : <div className="divide-y">
        {data.statements.map((statement) => {
          const exceptions = statement.lines.filter((line) => line.matchStatus === "EXCEPTION").length;
          const unmatched = statement.lines.filter((line) => line.matchStatus === "UNMATCHED").length;
          return <div key={statement.id} className="grid gap-3 py-4 lg:grid-cols-[1fr_auto] lg:items-center"><div className="space-y-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{statement.channel.name} · {statement.externalStatementNo ?? statement.id.slice(-8)}</span><Badge>{statement.status}</Badge>{exceptions ? <Badge variant="destructive">异常 {exceptions}</Badge> : null}{unmatched ? <Badge variant="outline">未匹配 {unmatched}</Badge> : null}</div><p className="text-sm text-muted-foreground">毛销售 {statement.currency} {statement.grossSales} · 费用 {statement.totalFees} · 退款 {statement.totalRefunds} · 净额 {statement.netPayout}</p></div><ChannelStatementActions id={statement.id} status={statement.status} /></div>;
        })}
      </div>}
    </CardContent></Card>
  </div>;
}
