import { getSKUs } from "@/app/actions/skus";
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
import { Plus, Box, Search } from "lucide-react";
import Link from "next/link";
import { ProductImage } from "@/components/ui/product-image";
import { EmptyState } from "@/components/ui/empty-state";
import { SKUStatsCards } from "@/components/inventory/sku-stats-cards";

// Force dynamic rendering
export const dynamic = "force-dynamic";

// Temporary hardcoded storeId - will be replaced with auth context
const STORE_ID = "store_1";

export default async function SKUsPage() {
  const skus = await getSKUs(STORE_ID);

  // 统计数据
  const categories = [...new Set(skus.map((s) => s.category).filter(Boolean))];
  const brands = [...new Set(skus.map((s) => s.brand).filter(Boolean))];
  const withAttributesCount = skus.filter(
    (s) => s.attributes && Object.keys(s.attributes as Record<string, unknown>).length > 0
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">商品SKU</h1>
          <p className="text-muted-foreground">产品目录和定义管理</p>
        </div>
        <Link href="/inventory/skus/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            添加SKU
          </Button>
        </Link>
      </div>

      {/* 统计卡片 */}
      <SKUStatsCards
        totalCount={skus.length}
        categoryCount={categories.length}
        brandCount={brands.length}
        withAttributesCount={withAttributesCount}
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>所有SKU</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="搜索SKU..." className="pl-8 w-[200px]" />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {skus.length === 0 ? (
            <EmptyState
              icon={Box}
              title="暂无SKU"
              description="创建第一个商品SKU开始管理产品目录"
              actionLabel="添加SKU"
              actionHref="/inventory/skus/new"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">图片</TableHead>
                  <TableHead>代码</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead>分类</TableHead>
                  <TableHead>品牌</TableHead>
                  <TableHead>属性</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {skus.map((sku) => {
                  const attributeCount = sku.attributes
                    ? Object.keys(sku.attributes as Record<string, unknown>).length
                    : 0;

                  return (
                    <TableRow key={sku.id}>
                      <TableCell>
                        <ProductImage src={sku.imageUrl} alt={sku.name} size="md" />
                      </TableCell>
                      <TableCell className="font-medium font-mono">{sku.code}</TableCell>
                      <TableCell className="font-medium">{sku.name}</TableCell>
                      <TableCell>
                        {sku.category ? (
                          <Badge variant="secondary">{sku.category}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {sku.brand || <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>
                        {attributeCount > 0 ? (
                          <Badge variant="outline">{attributeCount} 个属性</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {new Date(sku.createdAt).toLocaleDateString("zh-CN")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/inventory/skus/${sku.id}`}>
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
