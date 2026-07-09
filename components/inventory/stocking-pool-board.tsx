import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductImage } from "@/components/ui/product-image";
import type { ListingCoverageProduct } from "@/lib/application/listing-coverage";
import {
  summarizeStockingPools,
  type StockingPool,
} from "@/lib/application/stocking-decision";
import { cn } from "@/lib/utils";

interface StockingPoolBoardProps {
  products: ListingCoverageProduct[];
}

const POOL_META: Record<
  StockingPool,
  {
    title: string;
    description: string;
    badgeClass: string;
  }
> = {
  good: {
    title: "好卖池",
    description: "有真实订单支撑，动销速度可以支持小批补货。",
    badgeClass: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700",
  },
  testing: {
    title: "测试池",
    description: "有参考信号或少量实销，但还不能重仓。",
    badgeClass: "border-blue-500/25 bg-blue-500/10 text-blue-700",
  },
  slowProfit: {
    title: "利润好但慢",
    description: "有销售和利润空间，但资金周转不够快。",
    badgeClass: "border-amber-500/30 bg-amber-500/10 text-amber-800",
  },
  pressure: {
    title: "压货池",
    description: "有真实销售但库存周转偏慢，需要控制补货。",
    badgeClass: "border-orange-500/30 bg-orange-500/10 text-orange-800",
  },
  clearance: {
    title: "清仓池",
    description: "库龄或动销风险较高，优先释放现金。",
    badgeClass: "border-red-500/25 bg-red-500/10 text-red-700",
  },
  insufficient: {
    title: "数据不足",
    description: "缺少真实销售，只能做参考或小样测试。",
    badgeClass: "border-slate-500/25 bg-slate-500/10 text-slate-700",
  },
};

const POOL_ORDER: StockingPool[] = [
  "good",
  "testing",
  "slowProfit",
  "pressure",
  "clearance",
  "insufficient",
];

function pct(value: number) {
  return `${(value * 100).toFixed(0)}%`;
}

function productHref(product: ListingCoverageProduct) {
  return `/inventory/skus/${product.skuId}`;
}

function ageText(days: number | null) {
  return days === null ? "未知" : `${days} 天`;
}

export function StockingPoolBoard({ products }: StockingPoolBoardProps) {
  const productsWithDecision = products.filter((product) => product.stockingDecision);
  const summary = summarizeStockingPools(
    productsWithDecision.map((product) => product.stockingDecision!)
  );

  return (
    <section className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">经营池</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            分池只使用真实销售订单、真实库存和库龄做核心判断；档案参考价、上架价和情报只会作为参考信号，不会把商品直接推入好卖池。
          </p>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {POOL_ORDER.map((pool) => (
              <Badge
                key={pool}
                variant="outline"
                className={cn("h-7 shrink-0 rounded-md px-2", POOL_META[pool].badgeClass)}
              >
                {POOL_META[pool].title} {summary[pool]}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 xl:grid-cols-2">
        {POOL_ORDER.map((pool) => {
          const rows = productsWithDecision
            .filter((product) => product.stockingDecision?.pool === pool)
            .sort((a, b) => (b.stockingDecision?.score ?? 0) - (a.stockingDecision?.score ?? 0));
          const meta = POOL_META[pool];

          return (
            <Card key={pool} className="overflow-hidden">
              <CardHeader className="border-b pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{meta.title}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">{meta.description}</p>
                  </div>
                  <Badge variant="outline" className={cn("rounded-md", meta.badgeClass)}>
                    {rows.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {rows.length === 0 ? (
                  <p className="px-4 py-5 text-sm text-muted-foreground">暂无商品</p>
                ) : (
                  <div className="divide-y">
                    {rows.slice(0, 8).map((product) => {
                      const decision = product.stockingDecision!;
                      return (
                        <div key={product.key} className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto]">
                          <div className="flex min-w-0 gap-3">
                            <ProductImage
                              src={product.imageUrl}
                              alt={product.skuName}
                              size="md"
                              className="h-11 w-11 shrink-0 rounded-md"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{product.skuName}</p>
                              <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                                {product.skuCode}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {decision.labels.slice(0, 3).map((label) => (
                                  <Badge
                                    key={`${product.key}-${label}`}
                                    variant="outline"
                                    className="h-5 rounded-md px-1.5 text-[10px]"
                                  >
                                    {label}
                                  </Badge>
                                ))}
                              </div>
                              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                {decision.reason}
                              </p>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col gap-1 text-xs text-muted-foreground sm:items-end">
                            <span>30天销量 {decision.sales30Qty}</span>
                            <span>30天动销 {pct(decision.sellThrough30)}</span>
                            <span>库龄 {ageText(decision.oldestStockAgeDays)}</span>
                            <Link href={productHref(product)}>
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                                商品档案
                              </Button>
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
