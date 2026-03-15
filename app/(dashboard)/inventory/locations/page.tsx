import { getLocations } from "@/app/actions/locations";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Warehouse, Truck, User, Navigation, Search } from "lucide-react";
import Link from "next/link";

// Force dynamic rendering
export const dynamic = "force-dynamic";

// Temporary hardcoded storeId - will be replaced with auth context
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

export default async function LocationsPage() {
  const locations = await getLocations(STORE_ID);

  // 统计数据
  const stats = {
    total: locations.length,
    warehouse: locations.filter((l) => l.type === "WAREHOUSE").length,
    forwarder: locations.filter((l) => l.type === "FORWARDER").length,
    sellable: locations.filter((l) => l.isSellableDefault).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">仓库位置</h1>
          <p className="text-muted-foreground">
            管理仓库、货代和存储位置
          </p>
        </div>
        <Link href="/inventory/locations/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            添加位置
          </Button>
        </Link>
      </div>

      {/* 统计卡片 */}
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
          <div className="flex items-center justify-between">
            <CardTitle>所有位置</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="搜索位置..." className="pl-8 w-[200px]" />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {locations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Warehouse className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">暂无位置</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                创建第一个仓库位置开始使用系统
              </p>
              <Link href="/inventory/locations/new">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  添加位置
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>代码</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>默认可售</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locations.map((location) => {
                  const Icon =
                    locationTypeIcons[location.type as keyof typeof locationTypeIcons];
                  const colorClass =
                    locationTypeColors[location.type as keyof typeof locationTypeColors];
                  return (
                    <TableRow key={location.id}>
                      <TableCell className="font-medium font-mono">
                        {location.code}
                      </TableCell>
                      <TableCell>{location.name}</TableCell>
                      <TableCell>
                        <div className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-0.5 text-xs font-semibold ${colorClass}`}>
                          <Icon className="h-3 w-3" />
                          <span>
                            {
                              locationTypeLabels[
                                location.type as keyof typeof locationTypeLabels
                              ]
                            }
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {location.isSellableDefault ? (
                          <Badge variant="default">是</Badge>
                        ) : (
                          <Badge variant="secondary">否</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {new Date(location.createdAt).toLocaleDateString("zh-CN")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/inventory/locations/${location.id}`}>
                          <Button variant="ghost" size="sm">
                            查看
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
