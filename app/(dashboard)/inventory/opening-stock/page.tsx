import Link from "next/link";
import Decimal from "decimal.js";
import { Plus } from "lucide-react";
import { requireUserContext } from "@/lib/auth/user-context";
import { getOpeningStocks } from "@/app/actions/opening-stock";
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

export const dynamic = "force-dynamic";

export default async function OpeningStockPage({
  searchParams,
}: {
  searchParams: Promise<{ locationId?: string }>;
}) {
  const { locationId } = await searchParams;
  const returnHref = locationId
    ? `/inventory/locations/${encodeURIComponent(locationId)}`
    : "/inventory/locations";
  const historyHref = locationId
    ? `/inventory/opening-stock?${new URLSearchParams({ locationId })}`
    : "/inventory/opening-stock";
  const createHref = locationId
    ? `/inventory/opening-stock/new?${new URLSearchParams({ locationId, returnTo: returnHref })}`
    : "/inventory/locations";
  const { activeStoreId: storeId } = await requireUserContext();
  const documents = await getOpeningStocks(storeId, locationId);

  return (
    <div className="space-y-4">
      <Link
        href={returnHref}
        className="inline-block text-sm text-muted-foreground hover:underline"
      >
        ← 返回{locationId ? "仓库" : "仓库与位置"}
      </Link>
      <PageHeader
        className="mb-0"
        title={locationId ? "本仓库期初库存记录" : "期初库存记录"}
        description={
          locationId
            ? "仅统计本仓库的录入行和数量；打开单据可查看完整记录。"
            : "查看已有库存的录入记录；选择具体仓库后可继续录入。"
        }
        actions={
          <Link href={createHref}>
            <Button size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              录入期初库存
            </Button>
          </Link>
        }
      />

      <div className="overflow-hidden rounded-lg border bg-background">
        {documents.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-medium">还没有期初库存单</p>
            <p className="mt-1 text-sm text-muted-foreground">
              如果系统启用前已有实物库存，请先完成开账，再开始采购和销售。
            </p>
            <Link href={createHref}>
              <Button size="sm" className="mt-4">
                开始录入
              </Button>
            </Link>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>单据号</TableHead>
                <TableHead>期初日期</TableHead>
                <TableHead className="text-right">明细行</TableHead>
                <TableHead className="text-right">数量合计</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>备注</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((document) => {
                const totalQuantity = document.lines.reduce(
                  (sum, line) => sum.plus(line.quantity.toString()),
                  new Decimal(0)
                );
                return (
                  <TableRow key={document.id}>
                    <TableCell className="font-medium">{document.documentNo}</TableCell>
                    <TableCell>{document.openingAt.toLocaleDateString("zh-CN")}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {document.lines.length}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {totalQuantity.toString()}
                    </TableCell>
                    <TableCell>
                      <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                        {document.status === "POSTED" ? "已开账" : "已冲销"}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate text-muted-foreground">
                      {document.note || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/inventory/opening-stock/${document.id}?${new URLSearchParams({ returnTo: historyHref })}`}
                      >
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
      </div>
    </div>
  );
}
