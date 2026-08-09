import Link from "next/link";
import { notFound } from "next/navigation";
import { getResaleListingById } from "@/app/actions/resale-listings";
import { ResaleActions } from "@/components/resale/resale-actions";
import { ResaleStatusBadge } from "@/components/resale/resale-status";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function formatMoney(currency: string | null, amount: string | null) {
  if (!amount) return "-";
  return `${currency ?? ""} ${amount}`.trim();
}

function formatRate(value: string | null) {
  return value ? `${(Number(value) * 100).toFixed(1)}%` : "-";
}

const fulfillmentModeLabels: Record<string, string> = {
  SUPPLIER_SHIPS: "货主发货",
  RESELLER_SHIPS: "代卖方发货",
  THIRD_PARTY_SHIPS: "第三方代发",
};

export default async function ResaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listing = await getResaleListingById(id);
  if (!listing) notFound();
  const agreementRule = listing.agreementRuleSnapshot && typeof listing.agreementRuleSnapshot === "object"
    ? listing.agreementRuleSnapshot as { kind?: string; profitDeductions?: string[] }
    : null;
  const waitsForActualShippingFee =
    agreementRule?.kind === "PROFIT_PERCENT" &&
    agreementRule.profitDeductions?.includes("SHIPPING_FEE");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold">{listing.title}</h1>
            <ResaleStatusBadge status={listing.status} />
          </div>
          <p className="text-muted-foreground">
            平台：{listing.platform.name} · 来源货盘：{listing.supplyOffer.title}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <ResaleActions id={listing.id} status={listing.status} title={listing.title} />
          <div className="flex gap-2">
            <Link href={`/fulfillment/requests/new?resaleListingId=${listing.id}`}>
              <Button variant="outline" size="sm" disabled={listing.status !== "ACTIVE"}>创建履约请求</Button>
            </Link>
            <Link href="/resale">
              <Button variant="ghost" size="sm">返回代卖</Button>
            </Link>
            <Link href={`/marketplace/${listing.supplyOfferId}`}>
              <Button variant="ghost" size="sm">查看货盘</Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">代卖售价</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{formatMoney(listing.currency, listing.targetPrice)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">计划数量</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{listing.quantityPlanned}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">已售数量</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{listing.quantitySold}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">预估毛利</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{formatMoney(listing.currency, listing.estimatedGrossProfit)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>利润估算</CardTitle>
        </CardHeader>
        <CardContent>
          {waitsForActualShippingFee ? (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              双方约定要扣除本单实际运费。商品尚未发货，因此暂不显示精确利润分成；发货时录入运费后，系统会按成交时的协议版本重新计算。
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <div className="text-sm text-muted-foreground">供货单价</div>
              <div className="font-medium">{formatMoney(listing.supplyCurrency, listing.supplyUnitPrice)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">平台费率 / 预估平台费</div>
              <div className="font-medium">{formatRate(listing.platformFeeRate)} · {formatMoney(listing.currency, listing.estimatedPlatformFee)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">佣金比例 / 预估佣金</div>
              <div className="font-medium">{formatRate(listing.commissionRate)} · {formatMoney(listing.currency, listing.estimatedCommission)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">履约方式</div>
              <div className="font-medium">{fulfillmentModeLabels[listing.fulfillmentMode] || listing.fulfillmentMode}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>成交时的合作约定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">协议 v{listing.agreementVersion ?? "-"}</Badge>
            <span className="text-muted-foreground">
              {listing.agreementAcceptedAt
                ? `${new Date(listing.agreementAcceptedAt).toLocaleString("zh-CN")} 已确认并锁定快照`
                : "尚无确认时间"}
            </span>
          </div>
          <p className="whitespace-pre-wrap rounded-lg border bg-muted/20 p-4 text-sm">
            {listing.agreementTermsSnapshot || "未保存合作约定原文"}
          </p>
          {listing.agreementVersion !== listing.supplyOffer.agreementVersion ? (
            <p className="text-sm text-amber-700">
              当前货盘已更新到 v{listing.supplyOffer.agreementVersion}；本条代卖仍按成交时的 v{listing.agreementVersion} 结算。
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>平台信息</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="text-sm text-muted-foreground">平台</div>
            <div className="font-medium">{listing.platform.name}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">平台代码</div>
            <div className="font-medium">{listing.platform.code}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">外部编号</div>
            <div className="font-medium">{listing.externalListingNo || "-"}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
