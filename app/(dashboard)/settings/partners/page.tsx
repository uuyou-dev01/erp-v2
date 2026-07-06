import Link from "next/link";
import { getPartners } from "@/app/actions/partners";
import { PartnerDeactivateButton } from "@/components/partners/partner-row-actions";
import { PartnerForm } from "@/components/partners/partner-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUserContext } from "@/lib/auth/user-context";

export const dynamic = "force-dynamic";

const partnerTypeLabels: Record<string, string> = {
  SUPPLIER: "供货方",
  RESELLER: "代卖方",
  FULFILLER: "代发方",
  CHANNEL: "渠道方",
  OTHER: "其他",
};

const relationshipLabels: Record<string, string> = {
  SUPPLY: "供货",
  RESELL: "代卖",
  FULFILLMENT: "代发",
  CHANNEL: "渠道",
};

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ partnerId?: string }>;
}) {
  const params = await searchParams;
  const [context, partners] = await Promise.all([requireUserContext(), getPartners()]);
  const editingPartner = params.partnerId
    ? partners.find((partner) => partner.id === params.partnerId)
    : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">合作方</h1>
        <p className="text-muted-foreground">维护供货、代卖、代发和渠道关系，货盘可见性与结算规则会从这里延伸。</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader>
            <CardTitle>合作方列表</CardTitle>
          </CardHeader>
          <CardContent>
            {partners.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                暂无合作方。先在右侧创建供货方或代卖方。
              </div>
            ) : (
              <div className="divide-y divide-border">
                {partners.map((partner) => (
                  <div key={partner.id} className="grid gap-3 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{partner.name}</span>
                        <Badge variant="outline">{partner.code}</Badge>
                        <Badge variant={partner.status === "ACTIVE" ? "default" : "secondary"}>
                          {partner.status === "ACTIVE" ? "启用" : "停用"}
                        </Badge>
                        <Badge variant="secondary">{partnerTypeLabels[partner.type] ?? partner.type}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {partner.tradingRelationships.length > 0
                          ? partner.tradingRelationships
                              .map((relationship) => relationshipLabels[relationship.relationshipType] ?? relationship.relationshipType)
                              .join(" / ")
                          : "未配置合作关系"}
                        {partner.defaultCurrency ? ` · 默认币种 ${partner.defaultCurrency}` : ""}
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Link href={`/settings/partners?partnerId=${partner.id}`}>
                        <Button variant="outline" size="sm">编辑</Button>
                      </Link>
                      <PartnerDeactivateButton id={partner.id} name={partner.name} disabled={partner.status !== "ACTIVE"} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{editingPartner ? "编辑合作方" : "新增合作方"}</CardTitle>
          </CardHeader>
          <CardContent>
            <PartnerForm storeId={context.activeStoreId} initialData={editingPartner} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
