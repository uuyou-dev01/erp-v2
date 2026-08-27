"use client";

import { Download, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { TeamMetricsResult } from "@/lib/application/team-metrics";
import type { WorkMetricsResult } from "@/lib/application/work-metrics";

interface Option {
  id: string;
  name: string;
  code?: string;
  email?: string;
}

interface TeamMetricsDashboardProps {
  stores: Option[];
  platforms: Option[];
  members: Option[];
  metrics: TeamMetricsResult;
  workload: WorkMetricsResult;
  filters: {
    storeId: string;
    platformId: string;
    userId: string;
    from: string;
    to: string;
  };
}

function formatCount(value: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}

function exportCsv(metrics: TeamMetricsResult, workload: WorkMetricsResult) {
  const lines = [
    ["成员", "记录数", ...workload.types.map((type) => `${type.name}(${type.unit})`)].join(","),
    ...workload.rows.map((row) =>
      [
        row.userName,
        row.eventCount,
        ...workload.types.map((type) => row.values[type.id]?.quantity ?? "0"),
      ].join(",")
    ),
    "",
    "成员,上架任务,发货任务,发货订单,发货件数,结算任务,逾期任务,任务ID",
    ...metrics.rows.map((row) =>
      [
        row.userName,
        row.listingTasks,
        row.shippedTasks,
        row.shippedOrders,
        row.shippedUnits,
        row.settlementTasks,
        row.overdueTasks,
        row.taskIds.join(" "),
      ].join(",")
    ),
    "",
    "平台,发货任务,发货件数",
    ...metrics.platformBreakdown.map((row) =>
      [row.platformName, row.shippedTasks, row.shippedUnits].join(",")
    ),
    "",
    "国家/流向,发货任务,发货件数",
    ...metrics.countryBreakdown.map((row) =>
      [row.countryFlow, row.shippedTasks, row.shippedUnits].join(",")
    ),
  ];
  const blob = new Blob(["\ufeff" + lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `团队工作量-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function TeamMetricsDashboard({
  stores,
  platforms,
  members,
  metrics,
  workload,
  filters,
}: TeamMetricsDashboardProps) {
  const cards = [
    ["上架任务", metrics.summary.listingTasks],
    ["发货订单", metrics.summary.shippedOrders],
    ["发货件数", formatCount(metrics.summary.shippedUnits)],
    ["逾期任务", metrics.summary.overdueTasks],
  ];

  return (
    <div className="space-y-5">
      <form className="grid gap-3 rounded-lg border bg-background p-4 md:grid-cols-6" action="/reports/team">
        <Select name="storeId" defaultValue={filters.storeId} className="md:col-span-1">
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </Select>
        <Select name="platformId" defaultValue={filters.platformId} className="md:col-span-1">
          <option value="">全部平台</option>
          {platforms.map((platform) => (
            <option key={platform.id} value={platform.id}>
              {platform.name}
            </option>
          ))}
        </Select>
        <Select name="userId" defaultValue={filters.userId} className="md:col-span-1">
          <option value="">全部成员</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </Select>
        <input
          name="from"
          type="date"
          defaultValue={filters.from}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        />
        <input
          name="to"
          type="date"
          defaultValue={filters.to}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        />
        <div className="flex gap-2">
          <Button type="submit" className="flex-1">
            查询
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => exportCsv(metrics, workload)}
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </form>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>工作量记录</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              类型、数量和单位来自工作记录，可继续增加收货、质检、打包等类型。
            </p>
          </div>
          <span className="text-sm text-muted-foreground">{workload.eventCount} 条记录</span>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>成员</TableHead>
                  <TableHead className="text-right">记录数</TableHead>
                  {workload.types.map((type) => (
                    <TableHead key={type.id} className="min-w-28 text-right">
                      {type.name}
                      <span className="ml-1 font-normal text-muted-foreground">({type.unit})</span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {workload.rows.length ? (
                  workload.rows.map((row) => (
                    <TableRow key={row.userId}>
                      <TableCell className="font-medium">{row.userName}</TableCell>
                      <TableCell className="text-right">{row.eventCount}</TableCell>
                      {workload.types.map((type) => {
                        const value = row.values[type.id];
                        return (
                          <TableCell key={type.id} className="text-right">
                            {value ? formatCount(value.quantity) : "—"}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={Math.max(2, workload.types.length + 2)}
                      className="py-10 text-center text-muted-foreground"
                    >
                      当前筛选范围内暂无工作量记录
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {workload.records.length ? (
            <div>
              <p className="mb-2 text-sm font-medium">最近记录</p>
              <div className="max-h-72 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>时间</TableHead>
                      <TableHead>成员</TableHead>
                      <TableHead>工作</TableHead>
                      <TableHead className="text-right">工作量</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workload.records.slice(0, 20).map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {new Date(record.occurredAt).toLocaleString("zh-CN")}
                        </TableCell>
                        <TableCell>{record.userName}</TableCell>
                        <TableCell>{record.workName}</TableCell>
                        <TableCell className="text-right">
                          {formatCount(record.quantity)} {record.unit}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        {cards.map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>成员工作量</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => exportCsv(metrics, workload)}
          >
            <Download className="h-4 w-4" />
            导出 CSV
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>成员</TableHead>
                <TableHead className="text-right">上架</TableHead>
                <TableHead className="text-right">发货单</TableHead>
                <TableHead className="text-right">发货件数</TableHead>
                <TableHead className="text-right">结算</TableHead>
                <TableHead className="text-right">逾期</TableHead>
                <TableHead className="text-right">追溯</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    当前筛选范围内暂无已完成任务
                  </TableCell>
                </TableRow>
              ) : (
                metrics.rows.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell className="font-medium">{row.userName}</TableCell>
                    <TableCell className="text-right">{row.listingTasks}</TableCell>
                    <TableCell className="text-right">{row.shippedOrders}</TableCell>
                    <TableCell className="text-right">{formatCount(row.shippedUnits)}</TableCell>
                    <TableCell className="text-right">{row.settlementTasks}</TableCell>
                    <TableCell className="text-right">{row.overdueTasks}</TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/workbench?taskUser=${row.userId}`}
                        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-8")}
                      >
                        <ExternalLink className="h-4 w-4" />
                        任务
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>平台发货</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>平台</TableHead>
                  <TableHead className="text-right">发货任务</TableHead>
                  <TableHead className="text-right">件数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.platformBreakdown.map((row) => (
                  <TableRow key={row.platformId}>
                    <TableCell>{row.platformName}</TableCell>
                    <TableCell className="text-right">{row.shippedTasks}</TableCell>
                    <TableCell className="text-right">{formatCount(row.shippedUnits)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>国家/流向</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>流向</TableHead>
                  <TableHead className="text-right">发货任务</TableHead>
                  <TableHead className="text-right">件数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.countryBreakdown.map((row) => (
                  <TableRow key={row.countryFlow}>
                    <TableCell>{row.countryFlow}</TableCell>
                    <TableCell className="text-right">{row.shippedTasks}</TableCell>
                    <TableCell className="text-right">{formatCount(row.shippedUnits)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
