import Link from "next/link";
import { Truck } from "lucide-react";
import { getFulfillmentRequests } from "@/app/actions/fulfillment-requests";
import { FulfillmentStatusBadge } from "@/components/fulfillment/fulfillment-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getWarehouseInboundTasks } from "@/app/actions/purchase-orders";
import { WarehouseInboundActions } from "@/components/fulfillment/warehouse-inbound-actions";

export const dynamic = "force-dynamic";

export default async function FulfillmentRequestsPage() {
  const [requests, inboundTasks] = await Promise.all([
    getFulfillmentRequests(),
    getWarehouseInboundTasks(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">代发履约</h1>
        <p className="text-muted-foreground">跟进从代卖上架产生的供给方代发请求和物流状态。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>履约请求</CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Truck className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">暂无履约请求</h3>
              <p className="mb-4 max-w-md text-sm text-muted-foreground">
                在代卖详情中创建履约请求后，会在这里跟进接受、发货和送达。
              </p>
              <Link href="/resale">
                <Button>查看代卖上架</Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {requests.map((request) => (
                <div key={request.id} className="grid gap-3 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/fulfillment/requests/${request.id}`} className="font-semibold hover:underline">
                        {request.requestNo}
                      </Link>
                      <FulfillmentStatusBadge status={request.status} />
                      <Badge variant={request.isCollaboration ? "default" : "outline"}>
                        {request.isCollaboration ? "合作任务" : "内部任务"}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      代卖 {request.resaleListing?.title ?? "-"} · 货盘 {request.supplyOffer.title} · 收件人 {request.recipientName}
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">数量</div>
                      <div className="font-medium">{request.quantity}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">物流</div>
                      <div className="font-medium">{request.trackingNo || "-"}</div>
                    </div>
                    <Link href={`/fulfillment/requests/${request.id}`}>
                      <Button variant="outline" size="sm">查看</Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>合作仓收货与检查</CardTitle></CardHeader>
        <CardContent>
          {inboundTasks.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">暂无合作方采购入库任务。</p> : <div className="divide-y">{inboundTasks.map((task) => <div key={task.id} className="grid gap-3 py-4 lg:grid-cols-[1fr_auto] lg:items-center"><div className="space-y-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{task.orderNo}</span><Badge variant="outline">{task.status}</Badge>{task.inspectionPending ? <Badge>待检查</Badge> : null}</div><p className="text-sm text-muted-foreground">客户 {task.clientName} · {task.lines.map((line) => `${line.sku.name} × ${line.quantity}`).join("，")}</p></div><WarehouseInboundActions id={task.id} locationId={task.locationId} status={task.status} inspectionPending={task.inspectionPending} lines={task.lines} /></div>)}</div>}
        </CardContent>
      </Card>
    </div>
  );
}
