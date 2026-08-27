import { Boxes, Building2, RadioTower, Warehouse } from "lucide-react";
import { getMultiPartyManagementData } from "@/app/actions/multi-party";
import {
  AgreementLifecycleActions,
  BusinessStructureManager,
} from "@/components/settings/business-structure-manager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export default async function BusinessStructurePage() {
  const data = await getMultiPartyManagementData();

  return (
    <div className="space-y-6">
      <PageHeader
        title="业务归属与协作"
        description="账号负责操作，经营主体承担责任；货盘、销售店铺和仓库分别授权。"
        badge={<Boxes className="h-5 w-5 text-muted-foreground" />}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Boxes className="h-4 w-4" />
              货盘
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{data.pools.length}</p>
            <p className="text-xs text-muted-foreground">货权、成本和库存利润归属</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <RadioTower className="h-4 w-4" />
              销售店铺
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{data.channels.length}</p>
            <p className="text-xs text-muted-foreground">订单、上架和平台账单归属</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Warehouse className="h-4 w-4" />
              授权仓库
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{data.locations.length}</p>
            <p className="text-xs text-muted-foreground">库存物理位置与运营主体</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            合作协议
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.agreements.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无跨主体服务协议。</p>
          ) : (
            <div className="divide-y">
              {data.agreements.map((agreement) => (
                <div
                  id={`agreement-${agreement.id}`}
                  key={agreement.id}
                  className="grid scroll-mt-24 gap-2 py-3 md:grid-cols-[1fr_auto]"
                >
                  <div>
                    <p className="font-medium">
                      {agreement.clientOrganization.name} → {agreement.providerOrganization.name}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        v{agreement.version}
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {agreement.inventoryPool?.name ?? "全部货盘"} ·{" "}
                      {agreement.location?.name ?? "仓库待指定"} ·{" "}
                      {Array.isArray(agreement.serviceTypes)
                        ? agreement.serviceTypes.join(" / ")
                        : "服务"}
                    </p>
                  </div>
                  <div className="space-y-2 text-right text-sm text-muted-foreground">
                    <p>
                      {agreement.status} · {agreement.settlementCurrency} ·{" "}
                      {agreement.paymentTermsDays} 天
                    </p>
                    <AgreementLifecycleActions
                      currentOrganizationId={data.context.organizationId}
                      agreement={{
                        id: agreement.id,
                        status: agreement.status,
                        version: agreement.version,
                        proposedByOrganizationId: agreement.proposedByOrganizationId,
                        pausedByOrganizationId: agreement.pausedByOrganizationId,
                        serviceTypes: Array.isArray(agreement.serviceTypes)
                          ? agreement.serviceTypes.filter(
                              (serviceType): serviceType is string => typeof serviceType === "string"
                            )
                          : [],
                        settlementCurrency: agreement.settlementCurrency,
                        paymentTermsDays: agreement.paymentTermsDays,
                        notes: agreement.notes,
                        hasRevision: Boolean(agreement.revision),
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>管理动作</CardTitle>
        </CardHeader>
        <CardContent>
          <BusinessStructureManager
            currentOrganizationId={data.context.organizationId}
            organizations={data.organizations}
            pools={data.pools.map(({ id, name }) => ({ id, name }))}
            channels={data.channels.map(({ id, name }) => ({ id, name }))}
            locations={data.locations.map(({ id, name, operatorOrganizationId }) => ({
              id,
              name,
              operatorOrganizationId,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
