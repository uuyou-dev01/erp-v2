"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface LocationStatsChartProps {
  data: Array<{
    skuCode: string;
    skuName: string;
    lotStockQty: number;
    availableItemCount: number;
    allocatedItemCount: number;
    consumedItemCount: number;
  }>;
}

export function LocationStatsChart({ data }: LocationStatsChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>可售 SKU 明细</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-8 text-center">该仓库暂无库存数据</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>可售 SKU 明细</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>名称</TableHead>
              <TableHead className="text-right">批次库存</TableHead>
              <TableHead className="text-right">可售单品</TableHead>
              <TableHead className="text-right">已分配</TableHead>
              <TableHead className="text-right">已发出</TableHead>
              <TableHead className="text-right">有库存</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => {
              const stockCount = row.lotStockQty + row.availableItemCount;
              const hasStock = stockCount > 0;

              return (
                <TableRow key={row.skuCode}>
                  <TableCell className="font-medium">{row.skuCode}</TableCell>
                  <TableCell>{row.skuName}</TableCell>
                  <TableCell className="text-right">{row.lotStockQty}</TableCell>
                  <TableCell className="text-right">{row.availableItemCount}</TableCell>
                  <TableCell className="text-right">{row.allocatedItemCount}</TableCell>
                  <TableCell className="text-right">{row.consumedItemCount}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={hasStock ? "default" : "outline"}>
                      {hasStock ? "有库存" : "无库存"}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
