import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupplyOfferById } from "@/app/actions/supply-offers";
import type { SerializedSupplyOfferItem } from "@/app/actions/supply-offers";
import {
  SupplyOfferStatusBadge,
  SupplyOfferVisibilityBadge,
} from "@/components/marketplace/supply-offer-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function formatMoney(currency: string | null, amount: string | null) {
  if (!amount) return "-";
  return `${currency ?? ""} ${amount}`.trim();
}

export default async function SupplyOfferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const offer = await getSupplyOfferById(id);
  if (!offer) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold">{offer.title}</h1>
            <SupplyOfferStatusBadge status={offer.status} />
            <SupplyOfferVisibilityBadge visibility={offer.visibility} />
          </div>
          <p className="text-muted-foreground">供给方：{offer.ownerPartner?.name ?? "本店自有"} · 履约方式：{offer.fulfillmentMode}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/marketplace">
            <Button variant="outline">返回市场</Button>
          </Link>
          <Link href={`/resale/new?supplyOfferId=${offer.id}`}>
            <Button disabled={offer.status !== "PUBLISHED"}>创建代卖上架</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">可供数量</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{offer.availableQty}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">已预留</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{offer.reservedQty}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">供货价</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{formatMoney(offer.currency, offer.unitPrice)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">佣金比例</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {offer.commissionRate ? `${(Number(offer.commissionRate) * 100).toFixed(1)}%` : "-"}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>货盘说明</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{offer.description || "暂无说明"}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>可见范围</CardTitle>
        </CardHeader>
        <CardContent>
          {offer.visibility === "PARTNER_ONLY" && offer.visibilityRules.length > 0 ? (
            <div className="flex flex-wrap gap-2 text-sm">
              {offer.visibilityRules.map((rule) => (
                <span key={rule.id} className="rounded-md border border-border px-2 py-1">
                  {rule.viewerStore?.name ?? rule.partner?.name ?? "授权对象"}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {offer.visibility === "PUBLIC" ? "公开货盘。" : offer.visibility === "PARTNER_ONLY" ? "定向授权货盘。" : "私有货盘。"}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>供给明细</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            {offer.items.map((item: SerializedSupplyOfferItem) => (
              <div key={item.id} className="grid gap-3 py-4 md:grid-cols-[1fr_auto_auto] md:items-center">
                <div>
                  <div className="font-medium">{item.title}</div>
                  <div className="text-sm text-muted-foreground">{item.variantCode || "无规格"} · {item.notes || "无备注"}</div>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">数量 </span>
                  <span className="font-medium">{item.quantityAvailable}</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">单价 </span>
                  <span className="font-medium">{formatMoney(item.currency, item.unitPrice)}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
