"use client";
import { useState } from "react";
import Link from "next/link";
import type { ReportSale } from "@/lib/application/operating-report";
import { aggregateSalesContribution } from "@/lib/application/sales-contribution";
import { reportMoney } from "@/lib/application/operating-report-math";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListPagination } from "@/components/ui/list-pagination";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";

export function SalesContributionTable({ sales }: { sales: ReportSale[] }) {
  const [dimension, setDimension] = useState<"sku" | "group">("sku");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const rows = aggregateSalesContribution(sales, dimension).filter((row) =>
    `${row.name} ${row.code}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  );
  const safePage = Math.min(page, Math.max(1, Math.ceil(rows.length / 20)));
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="space-y-3 border-b p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">商品销售贡献</h2>
          <div className="flex gap-2">
            {(["sku", "group"] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={dimension === value ? "default" : "outline"}
                onClick={() => {
                  setDimension(value);
                  setPage(1);
                }}
              >
                {value === "sku" ? "按 SKU" : "按商品组"}
              </Button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          与订单明细使用同一期间、成交状态和 CNY
          口径。组合销售按行金额分摊成交收入及订单费用，成本按实际库存分配；订单数在每组内去重，跨组不可直接相加。
        </p>
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder="搜索商品、规格或编号"
          aria-label="搜索商品销售贡献"
        />
      </div>
      <p className="px-4 py-2 text-xs text-muted-foreground sm:hidden">
        左右滑动查看收入、成本与利润
      </p>
      <div className="overflow-x-auto">
        <Table className="min-w-[1000px]">
          <TableHeader>
            <TableRow>
              <TableHead>{dimension === "sku" ? "SKU" : "商品组"}</TableHead>
              <TableHead className="text-right">成交订单</TableHead>
              <TableHead className="text-right">售出件数</TableHead>
              <TableHead className="text-right">销售收入 CNY</TableHead>
              <TableHead className="text-right">收入占比</TableHead>
              <TableHead className="text-right">库存成本 CNY</TableHead>
              <TableHead className="text-right">贡献利润 CNY</TableHead>
              <TableHead className="text-right">利润率</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice((safePage - 1) * 20, safePage * 20).map((row) => (
              <TableRow key={row.id}>
                <TableCell className="min-w-56">
                  <Link
                    className="font-medium text-primary hover:underline"
                    href={`/inventory/skus/${row.id}`}
                  >
                    {row.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">{row.code}</p>
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.orderCount}</TableCell>
                <TableCell className="text-right tabular-nums">{row.quantity}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {reportMoney(row.revenue)}
                </TableCell>
                <TableCell className="text-right">
                  {row.revenueShare === null ? "—" : `${row.revenueShare}%`}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {reportMoney(row.cost)}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {reportMoney(row.profit)}
                  {row.provisional && <p className="text-xs text-amber-700">含预估费用</p>}
                </TableCell>
                <TableCell className="text-right">
                  {row.profitRate === null ? "待核算" : `${row.profitRate}%`}
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  没有匹配的成交商品
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <ListPagination
        page={safePage}
        pageSize={20}
        total={rows.length}
        onPageChange={setPage}
        label="商品贡献分页"
      />
    </section>
  );
}
