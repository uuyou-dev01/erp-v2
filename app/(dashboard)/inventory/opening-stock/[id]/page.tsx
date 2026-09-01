import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import Decimal from "decimal.js";
import { notFound } from "next/navigation";
import { getOpeningStockById } from "@/app/actions/opening-stock";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { safeInternalReturnPath } from "@/lib/application/return-navigation";

export const dynamic = "force-dynamic";

export default async function OpeningStockDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { id } = await params;
  const { returnTo } = await searchParams;
  const returnHref = safeInternalReturnPath(returnTo) ?? "/inventory/opening-stock";
  const document = await getOpeningStockById(id);
  if (!document) notFound();

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <Link href={returnHref}>
          <Button
            variant="ghost"
            size="icon"
            className="mt-0.5"
            aria-label={returnTo ? "返回仓库" : "返回期初库存"}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          className="mb-0 flex-1"
          title={document.documentNo}
          description={`期初日期 ${document.openingAt.toLocaleDateString("zh-CN")} · ${document.lines.length} 行 · ${
            document.status === "POSTED" ? "已开账" : "已冲销"
          }`}
        />
      </div>

      <section className="rounded-lg border bg-background px-4 py-3">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">确认时间</dt>
            <dd className="mt-1 font-medium">
              {(document.postedAt ?? document.createdAt).toLocaleString("zh-CN")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">状态</dt>
            <dd className="mt-1 font-medium">
              {document.status === "POSTED" ? "已开账" : "已冲销"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">备注</dt>
            <dd className="mt-1 font-medium">{document.note || "—"}</dd>
          </div>
        </dl>
      </section>

      <div className="overflow-hidden rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>商品</TableHead>
              <TableHead>仓库</TableHead>
              <TableHead>批次标识</TableHead>
              <TableHead>管理方式</TableHead>
              <TableHead className="text-right">数量</TableHead>
              <TableHead className="text-right">单位成本 / 批次金额</TableHead>
              <TableHead>品相 / 备注</TableHead>
              <TableHead className="text-right">库存对象</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {document.lines.map((line) => {
              const generatedUnitCount = Array.isArray(line.generatedItemUnitIds)
                ? line.generatedItemUnitIds.length
                : 0;
              return (
                <TableRow key={line.id}>
                  <TableCell>
                    <Link
                      href={`/inventory/skus/${line.sku.id}`}
                      className="font-medium hover:underline"
                    >
                      {line.sku.parentSku?.name ? `${line.sku.parentSku.name} · ` : ""}
                      {line.sku.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">{line.sku.code}</p>
                  </TableCell>
                  <TableCell>
                    {line.location.name}
                    <p className="mt-0.5 text-xs text-muted-foreground">{line.location.code}</p>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{line.batchLabel || "—"}</TableCell>
                  <TableCell>
                    {line.trackingMode === "ITEM_UNIT" ? "逐件管理" : "按批次数量"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.quantity.toString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <p>
                      {line.currency} {line.unitCost.toString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      合计 {line.currency}{" "}
                      {new Decimal(line.unitCost.toString())
                        .mul(line.quantity.toString())
                        .toFixed(2)}
                    </p>
                  </TableCell>
                  <TableCell className="max-w-[240px]">
                    {line.conditionGrade || line.note
                      ? [line.conditionGrade, line.note].filter(Boolean).join(" · ")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {line.generatedLotId ? (
                      <Link href={`/inventory/lots/${line.generatedLotId}`}>
                        <Button variant="ghost" size="sm">
                          批次
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        单件 {generatedUnitCount}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
