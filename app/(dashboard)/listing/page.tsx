import { getListings } from "@/app/actions/listings";
import { getPlatforms } from "@/app/actions/platforms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Plus, Globe, CheckCircle, XCircle, AlertCircle, Search } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/decimal";

// Force dynamic rendering
export const dynamic = "force-dynamic";

// Temporary hardcoded storeId
const STORE_ID = "store_1";

const statusColors = {
  ACTIVE: "default",
  DELISTED: "outline",
  SOLD_OUT: "destructive",
  DRAFT: "secondary",
} as const;

const statusLabels = {
  ACTIVE: "上架中",
  DELISTED: "已下架",
  SOLD_OUT: "已售罄",
  DRAFT: "草稿",
} as const;

export default async function ListingPage() {
  const listings = await getListings(STORE_ID);
  const platforms = await getPlatforms(STORE_ID);

  // 统计数据
  const stats = {
    total: listings.length,
    active: listings.filter((l) => l.status === "ACTIVE").length,
    delisted: listings.filter((l) => l.status === "DELISTED").length,
    platforms: platforms.length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">商品上架</h1>
          <p className="text-muted-foreground">
            管理多平台商品上架状态
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/listing/platforms">
            <Button variant="outline">
              <Globe className="mr-2 h-4 w-4" />
              管理平台
            </Button>
          </Link>
          <Link href="/listing/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              新建上架
            </Button>
          </Link>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总上架数</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">所有上架记录</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">上架中</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.active}</div>
            <p className="text-xs text-muted-foreground">正在销售</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已下架</CardTitle>
            <XCircle className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.delisted}</div>
            <p className="text-xs text-muted-foreground">已停止销售</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">销售平台</CardTitle>
            <AlertCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.platforms}</div>
            <p className="text-xs text-muted-foreground">已配置平台</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>上架列表</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="搜索商品..." className="pl-8 w-[200px]" />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {listings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Globe className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">暂无上架记录</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                创建第一个上架记录开始多平台销售
              </p>
              <Link href="/listing/new">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  新建上架
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>平台</TableHead>
                  <TableHead>商品</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>上架价格</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>上架时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listings.map((listing) => {
                  const product = listing.sku || listing.itemUnit?.sku;
                  return (
                    <TableRow key={listing.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{listing.platform.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {product ? (
                          <div>
                            <p className="font-medium">{product.code}</p>
                            <p className="text-xs text-muted-foreground">{product.name}</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {listing.listingType === "SKU" ? "SKU" : "单品"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {listing.listedPrice && listing.currency ? (
                          formatCurrency(listing.listedPrice.toString(), listing.currency)
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            statusColors[listing.status as keyof typeof statusColors]
                          }
                        >
                          {statusLabels[listing.status as keyof typeof statusLabels] ||
                            listing.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(listing.listedAt).toLocaleDateString("zh-CN")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/listing/${listing.id}`}>
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
