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
import {
  formatMoney,
  formatSupplyOfferPrice,
  formatSupplyOfferShipping,
} from "@/lib/supply-offer-display";

export const dynamic = "force-dynamic";

export default async function SupplyOfferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const offer = await getSupplyOfferById(id);
  if (!offer) notFound();
  const orderableQty = Math.max(Number(offer.availableQty) - Number(offer.reservedQty), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold">{offer.title}</h1>
            <SupplyOfferStatusBadge status={offer.status} />
            <SupplyOfferVisibilityBadge visibility={offer.visibility} />
          </div>
          <p className="text-muted-foreground">
            经营主体：{offer.organization?.name ?? offer.ownerPartner?.name ?? "供给方"} ·
            多账号共享库存 · 发货：
            {formatSupplyOfferShipping(
              offer.fulfillmentMode,
              offer.providerOrganization?.name,
              offer.organization?.name
            )}
          </p>
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
            <CardTitle className="text-sm font-medium text-muted-foreground">货盘总余量</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{orderableQty}</CardContent>
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
          <CardContent className="text-2xl font-bold">
            {formatSupplyOfferPrice(offer.currency, offer.unitPrice, offer.items)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">合作约定版本</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            v{offer.agreementVersion} · {offer.agreementStatus === "CONFIRMED" ? "已确认" : "草稿"}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>双方合作约定</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">
            {offer.agreementTerms || "尚未写明合作约定"}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            系统模板仅用于试算；订单会保存双方接受的约定版本，后续修改不会改写历史订单。
          </p>
        </CardContent>
      </Card>

      {offer.description ? (
        <Card>
          <CardHeader><CardTitle>补充说明</CardTitle></CardHeader>
          <CardContent><p className="whitespace-pre-wrap text-sm text-muted-foreground">{offer.description}</p></CardContent>
        </Card>
      ) : null}

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
              {offer.visibility === "PUBLIC"
                ? "公开货盘。"
                : offer.visibility === "PARTNER_ONLY"
                  ? "定向授权货盘。"
                  : "私有货盘。"}
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
              <div
                key={item.id}
                className="grid gap-3 py-4 md:grid-cols-[1fr_auto_auto] md:items-center"
              >
                <div>
                  <div className="font-medium">{item.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {item.variantCode || "无规格"} · {item.notes || "无备注"}
                  </div>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">明细总余量 </span>
                  <span className="font-medium">
                    {Math.max(Number(item.quantityAvailable) - Number(item.quantityReserved), 0)}
                  </span>
                  <span className="text-muted-foreground"> · 已预留 {item.quantityReserved}</span>
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
