"use client";

import Link from "next/link";
import { ClipboardCheck, PackagePlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  openingStockHref?: string;
  stocktakeHref?: string;
}

export function LocationStatsChart({
  data,
  openingStockHref,
  stocktakeHref,
}: LocationStatsChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>可售 SKU 明细</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-8 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <PackagePlus className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm font-medium">该仓库还没有库存数据</p>
            <p className="mt-1 max-w-lg text-sm text-muted-foreground">
              若仓库里已有实物，请按批次录入数量、单位成本和币种，系统会生成可追溯的库存流水。
            </p>
            {openingStockHref || stocktakeHref ? (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {openingStockHref ? (
                  <Button asChild size="sm">
                    <Link href={openingStockHref}>
                      <PackagePlus className="mr-1.5 h-4 w-4" />
                      录入期初库存
                    </Link>
                  </Button>
                ) : null}
                {stocktakeHref ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={stocktakeHref}>
                      <ClipboardCheck className="mr-1.5 h-4 w-4" />
                      前往库存盘点
                    </Link>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
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
