import { getLocationById, getLocationStats } from "@/app/actions/locations";
import { LocationForm } from "@/components/inventory/location-form";
import { LocationStatsChart } from "@/components/inventory/location-stats-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Box, Layers, CheckCircle, Send } from "lucide-react";
import { notFound } from "next/navigation";

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
        <h1 className="text-3xl font-bold">仓库详情</h1>
        <p className="text-muted-foreground">查看和编辑仓库信息</p>
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
            <CardTitle className="text-sm font-medium">可用入库批次</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeLotCount}</div>
            <p className="text-xs text-muted-foreground">ACTIVE 批次数量</p>
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
          isSellableDefault: location.isSellableDefault,
        }}
      />
    </div>
  );
}
