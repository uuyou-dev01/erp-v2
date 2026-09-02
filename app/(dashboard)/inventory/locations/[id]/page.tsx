import { requireUserContext } from "@/lib/auth/user-context";
import { getLocationById, getLocationStats } from "@/app/actions/locations";
import { LocationEditDialog } from "@/components/inventory/location-edit-dialog";
import { LocationStatsChart } from "@/components/inventory/location-stats-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  Box,
  Layers,
  CheckCircle,
  Send,
  ClipboardCheck,
  PackagePlus,
} from "lucide-react";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { formatLocationRegion } from "@/lib/inventory/location-regions";
import Link from "next/link";
import { hasRoleAtLeast, ROLES } from "@/lib/auth/permissions";
import { capabilityLabel, fulfillmentDestinationLabel } from "@/lib/inventory/location-fulfillment";
import {
  getExistingLocationFulfillerCandidates,
  getLocationFulfillerRoster,
} from "@/app/actions/location-fulfillers";
import { LocationFulfillerManager } from "@/components/inventory/location-fulfiller-manager";
import { safeInternalReturnPath } from "@/lib/application/return-navigation";

export const dynamic = "force-dynamic";

export default async function LocationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string; created?: string }>;
}) {
  const context = await requireUserContext();
  const { activeStoreId: storeId } = context;
  const { id } = await params;
  const { returnTo, created } = await searchParams;
  const returnHref = safeInternalReturnPath(returnTo) ?? "/inventory/locations";
  const [location, stats] = await Promise.all([getLocationById(id), getLocationStats(id)]);

  if (!location) {
    notFound();
  }
  const canManageRoster =
    (location.operatorOrganizationId === context.organizationId ||
      (!location.operatorOrganizationId && context.storeIds.includes(location.storeId))) &&
    hasRoleAtLeast(context.role, ROLES.ADMIN);
  const canManageInventory =
    location.storeId === context.activeStoreId && hasRoleAtLeast(context.role, ROLES.MANAGER);
  const locationReturnTo = `/inventory/locations/${location.id}`;
  const openingStockHref = `/inventory/opening-stock/new?${new URLSearchParams({
    locationId: location.id,
    returnTo: locationReturnTo,
  }).toString()}`;
  const stocktakeHref = `/inventory/stocktake?${new URLSearchParams({
    locationId: location.id,
  }).toString()}`;
  const [roster, existingCandidates] = canManageRoster
    ? await Promise.all([
        getLocationFulfillerRoster(location.id),
        getExistingLocationFulfillerCandidates(location.id),
      ])
    : [[], []];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
            <Link href={returnHref}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              {returnTo ? "返回上一页" : "返回仓库位置"}
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold">{location.name}</h1>
            <Badge variant="outline" className="font-mono">
              {location.code}
            </Badge>
            <Badge variant="secondary">{formatLocationRegion(location.region)}</Badge>
            <Badge variant={location.isSellableDefault ? "default" : "outline"}>
              {location.isSellableDefault ? "库存可分配" : "仅作在途/暂存"}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            地区表示库存实际位置；订单能否从这里发出，由节点能力和客户配送线路共同决定。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {location.capabilities
              .filter((capability) => capability.enabled)
              .map((capability) => (
                <Badge key={capability.code} variant="outline">
                  {capabilityLabel(capability.code)}
                </Badge>
              ))}
            {location.shippingLanesFrom
              .filter(
                (lane) =>
                  lane.active && lane.laneType === "CUSTOMER_DELIVERY" && lane.destinationCountry
              )
              .map((lane) => (
                <Badge key={lane.id} variant="secondary">
                  可发往{fulfillmentDestinationLabel(lane.destinationCountry!)}
                </Badge>
              ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManageInventory ? (
            <>
              <Button asChild size="sm">
                <Link href={openingStockHref}>
                  <PackagePlus className="mr-1.5 h-4 w-4" />
                  录入已有库存
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={stocktakeHref}>
                  <ClipboardCheck className="mr-1.5 h-4 w-4" />
                  盘点现有库存
                </Link>
              </Button>
            </>
          ) : null}
          {canManageRoster ? (
            <LocationEditDialog
              storeId={storeId}
              location={{
                id: location.id,
                code: location.code,
                name: location.name,
                type: location.type as "WAREHOUSE" | "FORWARDER" | "PERSON" | "TRANSIT",
                region: location.region,
                isSellableDefault: location.isSellableDefault,
                capabilities: location.capabilities,
                shippingLanesFrom: location.shippingLanesFrom,
              }}
            />
          ) : null}
        </div>
      </div>

      {created === "1" && canManageInventory ? (
        <section className="flex flex-col gap-4 border-l-4 border-primary bg-primary/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">仓库已创建，接下来可录入已有库存</p>
            <p className="mt-1 text-sm text-muted-foreground">
              按实际批次登记商品、数量、单位成本和币种；即使暂时没有库存，也可以稍后从本页开始。
            </p>
          </div>
          <Button asChild size="sm" className="shrink-0">
            <Link href={openingStockHref}>
              <PackagePlus className="mr-1.5 h-4 w-4" />
              开始录入
            </Link>
          </Button>
        </section>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">在库 SKU 数</CardTitle>
            <Box className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.skuCount}</div>
            <p className="text-xs text-muted-foreground">当前仓位涉及 SKU</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">批次库存数量</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.lotStockQty}</div>
            <p className="text-xs text-muted-foreground">按 StockLedger 汇总</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">可售单品</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.availableItemCount}</div>
            <p className="text-xs text-muted-foreground">状态为 AVAILABLE</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已发出单品</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.consumedItemCount}</div>
            <p className="text-xs text-muted-foreground">状态为 CONSUMED</p>
          </CardContent>
        </Card>
      </div>

      <LocationStatsChart
        data={stats.skuBreakdown}
        openingStockHref={canManageInventory ? openingStockHref : undefined}
        stocktakeHref={canManageInventory ? stocktakeHref : undefined}
      />

      {canManageRoster ? (
        <LocationFulfillerManager
          locationId={location.id}
          locationName={location.name}
          roster={roster}
          existingCandidates={existingCandidates}
        />
      ) : null}
    </div>
  );
}
