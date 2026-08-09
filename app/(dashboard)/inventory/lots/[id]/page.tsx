import { requireUserContext } from "@/lib/auth/user-context";
import { getInventoryLotById, getAvailableQuantity } from "@/app/actions/inventory-lots";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { notFound } from "next/navigation";
import { formatCurrency, formatQuantity } from "@/lib/decimal";
import { Package, MapPin, DollarSign, Activity } from "lucide-react";
import { LotSplitForm } from "@/components/inventory/lot-split-form";
import { BackButton } from "@/components/shared/back-button";

export const dynamic = "force-dynamic";

function getAdjustMeta(ledgerMeta: unknown) {
  if (!ledgerMeta || typeof ledgerMeta !== "object") return null;
  const value = ledgerMeta as Record<string, unknown>;
  const countedUnitCost = value.countedUnitCost;
  const notes = value.notes;
  const source = value.source;
  return {
    countedUnitCost:
      typeof countedUnitCost === "string" || typeof countedUnitCost === "number"
        ? String(countedUnitCost)
        : null,
    notes: typeof notes === "string" ? notes : null,
    fromSkuStocktake: source === "SKU_LOCATION_STOCKTAKE",
  };
}

export default async function InventoryLotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { activeStoreId: storeId } = await requireUserContext();
  const { id } = await params;
  const lot = await getInventoryLotById(id);

  if (!lot) {
    notFound();
  }

  const availableQty = await getAvailableQuantity(id);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <BackButton label="" fallbackHref="/inventory/lots" className="mt-0.5 shrink-0" />
        <div>
          <h1 className="text-3xl font-bold">入库库存详情</h1>
          <p className="text-muted-foreground">查看库存来源、成本和交易历史</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">可用数量</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatQuantity(availableQty)}</div>
            <p className="text-xs text-muted-foreground">当前可用单位</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">单位成本</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(lot.unitCost, lot.costCurrency)}
            </div>
            <p className="text-xs text-muted-foreground">不可变成本</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">所在位置</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lot.location.code}</div>
            <p className="text-xs text-muted-foreground">{lot.location.name}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">状态</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <Badge variant={lot.status === "ACTIVE" ? "default" : "secondary"}>
                {lot.status === "ACTIVE"
                  ? "活跃"
                  : lot.status === "CONSOLIDATING"
                    ? "转运锁定"
                    : "已消耗"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">当前状态</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>入库库存信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">SKU</p>
              <p className="text-lg font-semibold">{lot.sku.code}</p>
              <p className="text-sm text-muted-foreground">{lot.sku.name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">到货日期</p>
              <p className="text-lg font-semibold">
                {new Date(lot.receivedAt).toLocaleDateString("zh-CN")}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">来源类型</p>
              <Badge variant="outline">
                {lot.sourceType === "PURCHASE"
                  ? "采购"
                  : lot.sourceType === "OPENING_STOCK"
                    ? "期初库存"
                    : "拆分"}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">来源ID</p>
              <p className="font-mono text-sm">{lot.sourceId}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {lot.allocations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>分配记录 ({lot.allocations.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>订单</TableHead>
                  <TableHead>数量</TableHead>
                  <TableHead>成本金额</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lot.allocations.map((allocation) => (
                  <TableRow key={allocation.id}>
                    <TableCell className="font-medium">
                      订单 #{allocation.orderLine.order.id.slice(0, 8)}
                    </TableCell>
                    <TableCell>{formatQuantity(allocation.quantity)}</TableCell>
                    <TableCell>{formatCurrency(allocation.costAmount, lot.costCurrency)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{allocation.orderLine.order.orderStatus}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>库存流水记录</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日期</TableHead>
                <TableHead>原因</TableHead>
                <TableHead>变动数量</TableHead>
                <TableHead>位置</TableHead>
                <TableHead>盘点信息</TableHead>
                <TableHead>引用</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lot.stockLedgers.map((ledger) => {
                const adjustMeta = ledger.reason === "ADJUST" ? getAdjustMeta(ledger.meta) : null;
                return (
                  <TableRow key={ledger.id}>
                    <TableCell>{new Date(ledger.occurredAt).toLocaleString("zh-CN")}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          ledger.reason.startsWith("INBOUND") || ledger.reason === "SPLIT_IN"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {ledger.reason}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          parseFloat(ledger.deltaQty.toString()) > 0
                            ? "text-green-500"
                            : "text-red-500"
                        }
                      >
                        {parseFloat(ledger.deltaQty.toString()) > 0 ? "+" : ""}
                        {formatQuantity(ledger.deltaQty)}
                      </span>
                    </TableCell>
                    <TableCell>{ledger.locationId.slice(0, 8)}</TableCell>
                    <TableCell>
                      {adjustMeta ? (
                        <div className="text-xs">
                          {adjustMeta.fromSkuStocktake ? (
                            <p className="text-muted-foreground">来源: SKU 库存调整</p>
                          ) : null}
                          <p>
                            调整单价:{" "}
                            {formatCurrency(adjustMeta.countedUnitCost ?? "0", lot.costCurrency)}
                          </p>
                          {adjustMeta.notes ? (
                            <p className="text-muted-foreground">备注: {adjustMeta.notes}</p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {ledger.refType && (
                        <span className="font-mono text-xs">
                          {ledger.refType}: {ledger.refId?.slice(0, 8)}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {lot.status === "ACTIVE" && parseFloat(availableQty) > 0 && (
        <LotSplitForm lotId={id} storeId={storeId} availableQty={availableQty} />
      )}
    </div>
  );
}
