"use client";

import { Download } from "lucide-react";
import type { TeamMetricsResult } from "@/lib/application/team-metrics";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Option = { id: string; name: string };

function formatNumber(value: string) {
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(number)
    : value;
}

function exportMetrics(metrics: TeamMetricsResult) {
  const lines = [
    ["成员", "上架任务", "发货任务", "发货订单", "发货件数", "结算任务", "逾期任务"],
    ...metrics.rows.map((row) => [
      row.userName,
      row.listingTasks,
      row.shippedTasks,
      row.shippedOrders,
      row.shippedUnits,
      row.settlementTasks,
      row.overdueTasks,
    ]),
  ];
  const csv = lines
    .map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `团队绩效-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function TeamPerformanceDashboard({
  stores,
  platforms,
  members,
  metrics,
  filters,
}: {
  stores: Option[];
  platforms: Option[];
  members: Option[];
  metrics: TeamMetricsResult;
  filters: { storeId: string; platformId: string; userId: string; from: string; to: string };
}) {
  const cards = [
    ["上架任务", metrics.summary.listingTasks],
    ["发货订单", metrics.summary.shippedOrders],
    ["发货件数", formatNumber(metrics.summary.shippedUnits)],
    ["逾期任务", metrics.summary.overdueTasks],
  ];

  return (
    <div className="space-y-5">
      <form action="/reports/team-performance" className="grid gap-3 border-b pb-5 md:grid-cols-6">
        <Select name="storeId" defaultValue={filters.storeId}>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </Select>
        <Select name="platformId" defaultValue={filters.platformId}>
          <option value="">全部平台</option>
          {platforms.map((platform) => (
            <option key={platform.id} value={platform.id}>
              {platform.name}
            </option>
          ))}
        </Select>
        <Select name="userId" defaultValue={filters.userId}>
          <option value="">全部内部成员</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </Select>
        <Input name="from" type="date" defaultValue={filters.from} aria-label="开始日期" />
        <Input name="to" type="date" defaultValue={filters.to} aria-label="结束日期" />
        <div className="flex gap-2">
          <Button type="submit" className="flex-1">
            查询
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => exportMetrics(metrics)}
            aria-label="导出团队绩效"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>内部成员</TableHead>
              <TableHead className="text-right">上架</TableHead>
              <TableHead className="text-right">发货订单</TableHead>
              <TableHead className="text-right">发货件数</TableHead>
              <TableHead className="text-right">结算</TableHead>
              <TableHead className="text-right">逾期</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {metrics.rows.length ? (
              metrics.rows.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell className="font-medium">{row.userName}</TableCell>
                  <TableCell className="text-right">{row.listingTasks}</TableCell>
                  <TableCell className="text-right">{row.shippedOrders}</TableCell>
                  <TableCell className="text-right">{formatNumber(row.shippedUnits)}</TableCell>
                  <TableCell className="text-right">{row.settlementTasks}</TableCell>
                  <TableCell className="text-right">{row.overdueTasks}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  当前范围暂无已完成任务
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
