import Link from "next/link";
import { notFound } from "next/navigation";
import { getFulfillmentRequestById } from "@/app/actions/fulfillment-requests";
import { FulfillmentActions } from "@/components/fulfillment/fulfillment-actions";
import { FulfillmentStatusBadge } from "@/components/fulfillment/fulfillment-status";
import { CreateSettlementButton } from "@/components/finance/settlement-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function formatMoney(currency: string | null, amount: string | null) {
  if (!amount) return "-";
  return `${currency ?? ""} ${amount}`.trim();
}

export default async function FulfillmentRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const request = await getFulfillmentRequestById(id);
  if (!request) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold">{request.requestNo}</h1>
            <FulfillmentStatusBadge status={request.status} />
          </div>
          <p className="text-muted-foreground">
            货盘：{request.supplyOffer.title} · 代卖：{request.resaleListing?.title ?? "-"}
          </p>
        </div>
        <Link href="/fulfillment/requests">
          <Button variant="outline">返回履约</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>状态操作</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FulfillmentActions id={request.id} status={request.status} />
          <div className="flex justify-end border-t border-border pt-4">
            <CreateSettlementButton
              fulfillmentRequestId={request.id}
              disabled={request.status !== "SHIPPED" && request.status !== "DELIVERED"}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">履约数量</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{request.quantity}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">供给方</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold">{request.supplyOffer.ownerPartner?.name ?? "本店自有"}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">物流单号</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold">{request.trackingNo || "-"}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">运费</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold">{formatMoney(request.shippingCurrency, request.shippingFee)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>收件信息</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="text-sm text-muted-foreground">收件人</div>
            <div className="font-medium">{request.recipientName}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">电话</div>
            <div className="font-medium">{request.recipientPhone || "-"}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">国家/地区</div>
            <div className="font-medium">{request.shippingCountry || "-"}</div>
          </div>
          <div className="md:col-span-3">
            <div className="text-sm text-muted-foreground">地址</div>
            <div className="whitespace-pre-wrap font-medium">{request.shippingAddress}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
