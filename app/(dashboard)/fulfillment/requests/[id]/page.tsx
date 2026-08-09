import Link from "next/link";
import { notFound } from "next/navigation";
import { getFulfillmentRequestById } from "@/app/actions/fulfillment-requests";
import { FulfillmentActions } from "@/components/fulfillment/fulfillment-actions";
import { FulfillmentStatusBadge } from "@/components/fulfillment/fulfillment-status";
import { CreateSettlementButton } from "@/components/finance/settlement-actions";
import { ChargeRowActions } from "@/components/finance/charge-ledger-manager";
import { getChargeLedgerData } from "@/app/actions/charges";
import { Badge } from "@/components/ui/badge";
import { ChargeStatusBadge } from "@/components/finance/charge-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUserContext } from "@/lib/auth/user-context";

export const dynamic = "force-dynamic";

function formatMoney(currency: string | null, amount: string | null) {
  if (!amount) return "-";
  return `${currency ?? ""} ${amount}`.trim();
}

export default async function FulfillmentRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await requireUserContext();
  const request = await getFulfillmentRequestById(id);
  if (!request) notFound();
  const chargeData = request.isCollaboration
    ? await getChargeLedgerData({ sourceType: "FULFILLMENT_REQUEST", sourceId: request.id })
    : null;
  const shippingProofUrl =
    request.shippingProof &&
    typeof request.shippingProof === "object" &&
    !Array.isArray(request.shippingProof) &&
    typeof request.shippingProof.url === "string"
      ? request.shippingProof.url
      : null;
  const canProvide = request.providerOrganizationId
    ? request.providerOrganizationId === context.organizationId || request.assignedToId === context.userId
    : context.storeIds.includes(request.storeId) || request.assignedToId === context.userId;
  const canCancel =
    request.requesterOrganizationId === context.organizationId ||
    context.storeIds.includes(request.storeId) ||
    canProvide;

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
          <FulfillmentActions
            id={request.id}
            status={request.status}
            isCollaboration={request.isCollaboration}
            defaultCurrency={request.shippingCurrency}
            canProvide={canProvide}
            canCancel={canCancel}
          />
          {!request.isCollaboration ? <div className="flex justify-end border-t border-border pt-4">
            <CreateSettlementButton
              fulfillmentRequestId={request.id}
              disabled={request.status !== "SHIPPED" && request.status !== "DELIVERED"}
            />
          </div> : null}
        </CardContent>
      </Card>

      {request.isCollaboration && chargeData && chargeData.events.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>本次合作记账</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              服务方登记，付款方确认；“已线下结清”仅表示双方在系统外完成了往来。
            </p>
            <div className="divide-y border-y">
              {chargeData.events.map((event) => {
                const payer = event.parties.find((party) => party.role === "PAYER");
                const payee = event.parties.find((party) => party.role === "PAYEE");
                return (
                  <div key={event.id} className="grid gap-3 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{event.description}</span>
                        <Badge variant="outline">{event.category.name}</Badge>
                        <ChargeStatusBadge status={event.status} />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {payer?.nameSnapshot ?? "-"} → {payee?.nameSnapshot ?? "-"} · {event.currency} {event.amount}
                      </p>
                    </div>
                    <ChargeRowActions
                      id={event.id}
                      status={event.status}
                      currentOrganizationId={chargeData.currentOrganizationId}
                      payerOrganizationId={payer?.organizationId}
                      payeeOrganizationId={payee?.organizationId}
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

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
          <CardContent className="text-lg font-semibold">
            {request.supplyOffer.organization?.name ?? request.supplyOffer.ownerPartner?.name ?? "供给方待确认"}
          </CardContent>
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
          {shippingProofUrl ? (
            <div className="md:col-span-3">
              <div className="text-sm text-muted-foreground">发货凭证</div>
              <a className="font-medium text-primary hover:underline" href={shippingProofUrl} target="_blank" rel="noreferrer">查看凭证</a>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
