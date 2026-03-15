import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Box, Tag, Package } from "lucide-react";

interface SKUStatsCardsProps {
  totalCount: number;
  categoryCount: number;
  brandCount: number;
  withAttributesCount: number;
}

export function SKUStatsCards({
  totalCount,
  categoryCount,
  brandCount,
  withAttributesCount,
}: SKUStatsCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">总SKU数</CardTitle>
          <Box className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalCount}</div>
          <p className="text-xs text-muted-foreground">所有商品SKU</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">分类数</CardTitle>
          <Tag className="h-4 w-4 text-blue-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{categoryCount}</div>
          <p className="text-xs text-muted-foreground">商品分类</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">品牌数</CardTitle>
          <Package className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{brandCount}</div>
          <p className="text-xs text-muted-foreground">商品品牌</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">有属性</CardTitle>
          <Box className="h-4 w-4 text-purple-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{withAttributesCount}</div>
          <p className="text-xs text-muted-foreground">包含属性的SKU</p>
        </CardContent>
      </Card>
    </div>
  );
}
