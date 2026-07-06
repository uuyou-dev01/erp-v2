import Link from "next/link";
import { ExternalLink, PackageCheck, ShoppingCart, Tags, Truck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { SkuCatalogDetail } from "@/lib/application/sku-catalog";
import { formatCurrency, formatQuantity } from "@/lib/decimal";

interface SKUReferencePanelProps {
  sku: Pick<SkuCatalogDetail, "id" | "code" | "reference">;
  compact?: boolean;
}

export function SKUReferencePanel({ sku, compact = false }: SKUReferencePanelProps) {
  const { reference } = sku;

  return (
    <Card>
      <CardHeader className={compact ? "py-3" : undefined}>
        <CardTitle className="text-sm font-medium">关联入口</CardTitle>
        {!compact ? (
          <p className="text-xs text-muted-foreground">
            档案页只看价格与记录，库存、上架和订单进入对应模块处理。
          </p>
        ) : null}
      </CardHeader>
      <CardContent className={`space-y-3 ${compact ? "pt-0" : ""}`}>
        <div className="grid grid-cols-2 gap-1.5">
          <Link href={`/inventory/sellable?q=${encodeURIComponent(sku.code)}`}>
            <Button variant="outline" size="sm" className="h-8 w-full justify-start text-xs">
              <PackageCheck className="mr-1 h-3.5 w-3.5" />
              库存看板
            </Button>
          </Link>
          <Link href="/sales">
            <Button variant="outline" size="sm" className="h-8 w-full justify-start text-xs">
              <ShoppingCart className="mr-1 h-3.5 w-3.5" />
              销售订单
            </Button>
          </Link>
          <Link href={`/listing?q=${encodeURIComponent(sku.code)}`}>
            <Button variant="outline" size="sm" className="h-8 w-full justify-start text-xs">
              <Tags className="mr-1 h-3.5 w-3.5" />
              上架运营
            </Button>
          </Link>
          <Link href={`/inventory/lots?skuId=${sku.id}`}>
            <Button variant="outline" size="sm" className="h-8 w-full justify-start text-xs">
              <Truck className="mr-1 h-3.5 w-3.5" />
              采购入库
            </Button>
          </Link>
        </div>

        {reference.recentPurchaseLines.length > 0 ? (
          <div>
            <p className="mb-1 text-xs font-medium">最近采购</p>
            <ul className="space-y-1 text-xs">
              {reference.recentPurchaseLines.map((line) => (
                <li
                  key={line.id}
                  className="flex justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5"
                >
                  <span className="truncate">{line.orderNo}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {formatQuantity(line.quantity)} ×{" "}
                    {formatCurrency(line.unitPrice, line.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {reference.recentSalesLines.length > 0 ? (
          <div>
            <p className="mb-1 text-xs font-medium">最近销售</p>
            <ul className="space-y-1 text-xs">
              {reference.recentSalesLines.map((line) => (
                <li
                  key={line.id}
                  className="flex justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5"
                >
                  <span className="truncate">{line.orderNumber}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {formatQuantity(line.quantity)} ·{" "}
                    {formatCurrency(line.lineAmount, line.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="text-[10px] text-muted-foreground">
          采购记录 {reference.purchaseLineCount} · 销售记录 {reference.salesLineCount}
          <Link
            href="/procurement"
            className="ml-1.5 inline-flex items-center gap-0.5 text-primary hover:underline"
          >
            采购单据
            <ExternalLink className="h-2.5 w-2.5" />
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
