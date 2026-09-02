import Link from "next/link";
import { ExternalLink, PackageCheck, Radar, ShoppingCart, Tags, Truck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { SkuCatalogDetail } from "@/lib/application/sku-catalog";
import { formatCurrency, formatQuantity } from "@/lib/decimal";

interface SKUReferencePanelProps {
  sku: Pick<SkuCatalogDetail, "id" | "code" | "reference" | "intelligence">;
  compact?: boolean;
}

export function SKUReferencePanel({ sku, compact = false }: SKUReferencePanelProps) {
  const { reference } = sku;

  return (
    <Card>
      <CardHeader className={compact ? "py-3" : undefined}>
        <CardTitle className="text-sm font-medium">{compact ? "关联入口" : "市场参考"}</CardTitle>
        {!compact ? (
          <p className="text-xs text-muted-foreground">
            外部价格用于辅助判断，真实采购、库存、上架和销售仍以业务单据为准。
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

        {!compact && sku.intelligence.recentMarketObservations.length > 0 ? (
          <div className="border-t pt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="inline-flex items-center gap-1.5 text-xs font-medium">
                <Radar className="h-3.5 w-3.5 text-blue-600" />
                外部价格记录
              </p>
              <Link
                href={`/product-intelligence/${sku.intelligence.recentMarketObservations[0].itemId}`}
                className="text-[10px] text-blue-600 hover:underline"
              >
                共 {sku.intelligence.marketObservationCount} 条
              </Link>
            </div>
            <ul className="space-y-1.5">
              {sku.intelligence.recentMarketObservations.slice(0, compact ? 2 : 5).map((item) => (
                <li
                  key={item.id}
                  className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 rounded-md bg-muted/40 px-2.5 py-2 text-xs"
                >
                  <Link
                    href={`/product-intelligence/${item.itemId}`}
                    className="truncate font-medium hover:text-blue-600"
                  >
                    {item.platformName || "市场来源"}
                    {item.pageStatus === "SOLD_OUT" ? " · 已售罄" : ""}
                  </Link>
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(item.amount, item.currency)}
                  </span>
                  <span className="truncate text-[10px] text-muted-foreground">
                    {item.conditionGrade || "成色未标注"} ·{" "}
                    {new Date(item.observedAt).toLocaleDateString("zh-CN")}
                  </span>
                  {item.sourceUrl ? (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 text-[10px] text-blue-600 hover:underline"
                    >
                      原链接 <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!compact && reference.recentPurchaseLines.length > 0 ? (
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

        {!compact && reference.recentSalesLines.length > 0 ? (
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
          市场参考 {sku.intelligence.marketObservationCount} · 采购 {reference.purchaseLineCount} ·
          销售 {reference.salesLineCount}
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
