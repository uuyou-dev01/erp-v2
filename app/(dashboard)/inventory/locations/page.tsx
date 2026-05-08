import { getLocations } from "@/app/actions/locations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Warehouse, Truck, User, Navigation } from "lucide-react";
import { ResponsiveTable, Column } from "@/components/shared/responsive-table";
import { LocationCreateDialog } from "@/components/inventory/location-create-dialog";
import { LocationRowActions } from "@/components/inventory/location-row-actions";

export const dynamic = "force-dynamic";

const STORE_ID = "store_1";

const locationTypeIcons = {
  WAREHOUSE: Warehouse,
  FORWARDER: Truck,
  PERSON: User,
  TRANSIT: Navigation,
};

const locationTypeLabels = {
  WAREHOUSE: "仓库",
  FORWARDER: "货代",
  PERSON: "个人",
  TRANSIT: "在途",
};

const locationTypeColors = {
  WAREHOUSE: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  FORWARDER: "bg-green-500/10 text-green-500 border-green-500/20",
  PERSON: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  TRANSIT: "bg-orange-500/10 text-orange-500 border-orange-500/20",
};

type LocationRow = Awaited<ReturnType<typeof getLocations>>[number];

export default async function LocationsPage() {
  const locations = await getLocations(STORE_ID);

  const stats = {
    total: locations.length,
    warehouse: locations.filter((l) => l.type === "WAREHOUSE").length,
    forwarder: locations.filter((l) => l.type === "FORWARDER").length,
    sellable: locations.filter((l) => l.isSellableDefault).length,
  };

  const columns: Column<LocationRow>[] = [
    {
      key: "code",
      header: "代码",
      cell: (row) => <span className="font-medium font-mono">{row.code}</span>,
    },
    {
      key: "name",
      header: "名称",
      cell: (row) => row.name,
    },
    {
      key: "type",
      header: "类型",
      cell: (row) => {
        const Icon = locationTypeIcons[row.type as keyof typeof locationTypeIcons];
        const colorClass = locationTypeColors[row.type as keyof typeof locationTypeColors];
        return (
          <div className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-0.5 text-xs font-semibold ${colorClass}`}>
            <Icon className="h-3 w-3" />
            <span>{locationTypeLabels[row.type as keyof typeof locationTypeLabels]}</span>
          </div>
        );
      },
    },
    {
      key: "sellable",
      header: "默认可售",
      cell: (row) =>
        row.isSellableDefault ? (
          <Badge variant="default">是</Badge>
        ) : (
          <Badge variant="secondary">否</Badge>
        ),
    },
    {
      key: "createdAt",
      header: "创建时间",
      hideOnMobile: true,
      cell: (row) => new Date(row.createdAt).toLocaleDateString("zh-CN"),
    },
    {
      key: "actions",
      header: "操作",
      className: "text-right",
      cell: (row) => (
        <LocationRowActions id={row.id} name={row.name} storeId={STORE_ID} />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">仓库位置</h1>
          <p className="text-muted-foreground">
            管理仓库、货代和存储位置
          </p>
        </div>
        <LocationCreateDialog storeId={STORE_ID} />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总位置数</CardTitle>
            <Warehouse className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">所有存储位置</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">仓库</CardTitle>
            <Warehouse className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.warehouse}</div>
            <p className="text-xs text-muted-foreground">自有仓库数量</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">货代</CardTitle>
            <Truck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.forwarder}</div>
            <p className="text-xs text-muted-foreground">货代仓库数量</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">可售位置</CardTitle>
            <Navigation className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.sellable}</div>
            <p className="text-xs text-muted-foreground">默认可售位置</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>所有位置</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveTable
            columns={columns}
            data={locations}
            keyExtractor={(row) => row.id}
            emptyState={
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Warehouse className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-semibold">暂无位置</h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  创建第一个仓库位置开始使用系统
                </p>
                <LocationCreateDialog storeId={STORE_ID} triggerText="添加位置" />
              </div>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
