import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupplyOfferById } from "@/app/actions/supply-offers";
import type { SerializedSupplyOfferItem } from "@/app/actions/supply-offers";
import { SupplyOfferActions } from "@/components/marketplace/supply-offer-actions";
import { SupplyOfferChannelManager } from "@/components/marketplace/supply-offer-channel-manager";
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

export default async function MySupplyOfferDetailPage({
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
            经营主体：{offer.organization?.name ?? "当前经营主体"} · 库存策略：多账号共享库存
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <SupplyOfferActions id={offer.id} status={offer.status} title={offer.title} />
          <Link href="/marketplace/my-offers">
            <Button variant="ghost" size="sm">
              返回我的供给
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">当前可接单</CardTitle>
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
            <CardTitle className="text-sm font-medium text-muted-foreground">已履约</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{offer.fulfilledQty}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">在售渠道</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {offer.salesChannels.filter((channel) => channel.status === "ACTIVE").length}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>可见性</CardTitle>
        </CardHeader>
        <CardContent>
          {offer.visibility === "PARTNER_ONLY" ? (
            offer.visibilityRules.length > 0 ? (
              <div className="flex flex-wrap gap-2 text-sm">
                {offer.visibilityRules.map((rule) => (
                  <span key={rule.id} className="rounded-md border border-border px-2 py-1">
                    {rule.viewerStore?.name ?? rule.partner?.name ?? "未命名对象"}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                当前选择了合作方可见，但还没有指定可见对象。
              </p>
            )
          ) : (
            <p className="text-sm text-muted-foreground">
              {offer.visibility === "PUBLIC" ? "所有可访问市场的店铺都可以看到。" : "仅本店可见。"}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>发布后的上架渠道</CardTitle>
        </CardHeader>
        <CardContent>
          <SupplyOfferChannelManager
            channels={offer.salesChannels}
            guaranteedEligible={
              offer.items.length === 1 &&
              Boolean(offer.items[0].skuId) &&
              !offer.items[0].itemUnitId
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>结算与发货</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm md:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-muted-foreground">供货价格</p>
            <p className="mt-1 font-medium">
              {formatSupplyOfferPrice(offer.currency, offer.unitPrice, offer.items)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">佣金方式</p>
            <p className="mt-1 font-medium">
              {offer.commissionType === "MARGIN"
                ? "代卖方赚差价"
                : offer.commissionType === "PERCENT"
                  ? `成交价 ${Number(offer.commissionRate || 0) * 100}%`
                  : offer.commissionType === "FIXED"
                    ? `每件 ${formatMoney(offer.currency, offer.commissionFixedAmount)}`
                    : `比例 + 固定佣金`}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">代发服务费</p>
            <p className="mt-1 font-medium">
              {offer.dropshipFee ? formatMoney(offer.currency, offer.dropshipFee) : "无"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">卖出后由谁发货</p>
            <p className="mt-1 font-medium">
              {formatSupplyOfferShipping(
                offer.fulfillmentMode,
                offer.providerOrganization?.name,
                offer.organization?.name
              )}
            </p>
          </div>
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
                  可接单{" "}
                  <span className="font-medium">
                    {Math.max(Number(item.quantityAvailable) - Number(item.quantityReserved), 0)}
                  </span>{" "}
                  <span className="text-muted-foreground">· 已预留 {item.quantityReserved}</span>
                </div>
                <div className="text-sm">
                  单价{" "}
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
