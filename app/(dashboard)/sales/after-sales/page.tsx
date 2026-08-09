import { RotateCcw } from "lucide-react";
import { getAfterSalesData } from "@/app/actions/after-sales";
import { AfterSalesCreator, AfterSalesRowActions } from "@/components/sales/after-sales-manager";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export default async function AfterSalesPage() {
  const data = await getAfterSalesData();
  return <div className="space-y-6">
    <PageHeader title="售后与退件检查" description="一张订单可多次、部分售后；退件实际收货后进入待检查，检查通过才恢复可售。" badge={<RotateCcw className="h-5 w-5 text-muted-foreground" />} />
    <Card><CardHeader><CardTitle>创建售后单</CardTitle></CardHeader><CardContent><AfterSalesCreator orders={data.orders} locations={data.locations} /></CardContent></Card>
    <Card><CardHeader><CardTitle>售后处理队列</CardTitle></CardHeader><CardContent>
      {data.cases.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">暂无售后单。</p> : <div className="divide-y">{data.cases.map((item) => <div key={item.id} className="grid gap-3 py-4 lg:grid-cols-[1fr_auto] lg:items-center"><div className="space-y-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{item.caseNo} · {item.customerOrder.orderNumber}</span><Badge>{item.type}</Badge><Badge variant="outline">{item.status}</Badge></div><p className="text-sm text-muted-foreground">{item.organization.name} · {item.lines.map((line) => `${line.orderLine.sku.name} × ${line.quantity}`).join("，") || "仅退款"}{item.refundAmount ? ` · 退款 ${item.refundCurrency} ${item.refundAmount}` : ""}</p></div><AfterSalesRowActions id={item.id} status={item.status} type={item.type} owner={item.organizationId === data.currentOrganizationId} /></div>)}</div>}
    </CardContent></Card>
  </div>;
}
