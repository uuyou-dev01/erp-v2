import { getLocationById, getLocationStats } from "@/app/actions/locations";
import { LocationForm } from "@/components/inventory/location-form";
import { LocationStatsChart } from "@/components/inventory/location-stats-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Box, Layers, CheckCircle, Send } from "lucide-react";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { formatLocationRegion } from "@/lib/inventory/location-regions";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STORE_ID = "store_1";

export default async function LocationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [location, stats] = await Promise.all([
    getLocationById(id),
    getLocationStats(id),
  ]);

  if (!location) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link href="/inventory/locations">
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回仓库位置
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold">{location.name}</h1>
          <Badge variant="outline" className="font-mono">
            {location.code}
          </Badge>
          <Badge variant="secondary">{formatLocationRegion(location.region)}</Badge>
          <Badge variant={location.isSellableDefault ? "default" : "outline"}>
            {location.isSellableDefault ? "计入可售库存" : "仅作在途/暂存"}
          </Badge>
        </div>
        <p className="text-muted-foreground">
          仓库地区决定货盘市场；可售开关决定库存看板中计入可售还是在途。
        </p>
      </div>

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

      <LocationStatsChart data={stats.skuBreakdown} />

      <LocationForm
        storeId={STORE_ID}
        initialData={{
          id: location.id,
          code: location.code,
          name: location.name,
          type: location.type as "WAREHOUSE" | "FORWARDER" | "PERSON" | "TRANSIT",
          region: location.region,
          isSellableDefault: location.isSellableDefault,
        }}
      />
    </div>
  );
}
