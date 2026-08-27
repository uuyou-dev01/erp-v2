"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Download, Loader2, Save } from "lucide-react";
import type { WorkMetricsResult } from "@/lib/application/work-metrics";
import { updateWorkTypeSettlementRateAction } from "@/app/actions/team-reports";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

type Option = { id: string; name: string; code?: string };

const RELATIONSHIP_LABELS: Record<string, string> = {
  SELF: "本人",
  MEMBER: "企业成员",
  WAREHOUSE_COLLABORATOR: "仓库协作",
  PARTNER_ORGANIZATION: "外部组织",
  UNKNOWN: "历史关系未知",
};

const TAB_LABELS = {
  records: "工作记录",
  people: "人员汇总",
  types: "类型汇总",
  settlement: "对账",
} as const;

function formatNumber(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 4 }).format(numeric);
}

function buildHref(
  filters: WorkloadDashboardProps["filters"],
  overrides: Partial<WorkloadDashboardProps["filters"]>
) {
  const values = { ...filters, ...overrides };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  return `/reports/workload?${params.toString()}`;
}

function exportRecords(workload: WorkMetricsResult) {
  const lines = [
    ["时间", "执行人", "关系", "委托企业", "仓库", "工作", "数量", "单位", "来源"],
    ...workload.records.map((record) => [
      new Date(record.occurredAt).toLocaleString("zh-CN"),
      record.userName,
      RELATIONSHIP_LABELS[record.relationshipType] ?? record.relationshipType,
      record.organizationName ?? "",
      record.locationName ?? "",
      record.workName,
      record.quantity,
      record.unit,
      `${record.sourceType}:${record.sourceId}`,
    ]),
  ];
  const csv = lines
    .map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `工作量-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function RateEditor({
  type,
  canManage,
}: {
  type: WorkMetricsResult["types"][number];
  canManage: boolean;
}) {
  const [rate, setRate] = useState(type.settlementRate ?? "");
  const [currency, setCurrency] = useState(type.settlementCurrency ?? "CNY");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex min-w-[260px] items-center justify-end gap-2">
      <Input
        aria-label={`${type.name}单价`}
        type="number"
        min="0"
        step="0.01"
        className="h-8 w-24"
        value={rate}
        disabled={!canManage || pending}
        placeholder="未配置"
        onChange={(event) => setRate(event.target.value)}
      />
      <Select
        aria-label={`${type.name}币种`}
        className="h-8 w-20"
        value={currency}
        disabled={!canManage || pending}
        onChange={(event) => setCurrency(event.target.value)}
      >
        <option value="CNY">CNY</option>
        <option value="JPY">JPY</option>
        <option value="USD">USD</option>
        <option value="EUR">EUR</option>
      </Select>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8"
        disabled={!canManage || pending}
        onClick={() =>
          startTransition(async () => {
            const result = await updateWorkTypeSettlementRateAction({
              workTypeId: type.id,
              rate,
              currency,
            });
            setMessage(result.success ? "已保存" : result.error);
          })
        }
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Save className="h-3.5 w-3.5" />
        )}
        保存
      </Button>
      {message ? (
        <span className="sr-only" role="status">
          {message}
        </span>
      ) : null}
    </div>
  );
}

interface WorkloadDashboardProps {
  stores: Option[];
  people: Option[];
  workload: WorkMetricsResult;
  canManageRates: boolean;
  filters: {
    scope: "organization" | "mine";
    tab: "records" | "people" | "types" | "settlement";
    storeId: string;
    userId: string;
    relationshipType: string;
    from: string;
    to: string;
  };
}

export function WorkloadDashboard({
  stores,
  people,
  workload,
  canManageRates,
  filters,
}: WorkloadDashboardProps) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-fit rounded-lg bg-muted p-1">
          <Link
            href={buildHref(filters, { scope: "organization", userId: "" })}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "h-8",
              filters.scope === "organization" && "bg-background shadow-sm"
            )}
          >
            本企业委托
          </Link>
          <Link
            href={buildHref(filters, { scope: "mine", storeId: "", userId: "" })}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "h-8",
              filters.scope === "mine" && "bg-background shadow-sm"
            )}
          >
            我完成的
          </Link>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => exportRecords(workload)}>
          <Download className="h-4 w-4" />
          导出记录
        </Button>
      </div>

      <form action="/reports/workload" className="grid gap-3 border-b pb-5 md:grid-cols-6">
        <input type="hidden" name="scope" value={filters.scope} />
        <input type="hidden" name="tab" value={filters.tab} />
        {filters.scope === "organization" ? (
          <Select name="storeId" defaultValue={filters.storeId}>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </Select>
        ) : (
          <div className="hidden md:block" />
        )}
        {filters.scope === "organization" ? (
          <Select name="userId" defaultValue={filters.userId}>
            <option value="">全部执行人</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        ) : (
          <div className="hidden md:block" />
        )}
        <Select name="relationshipType" defaultValue={filters.relationshipType}>
          <option value="">全部关系</option>
          {Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Input name="from" type="date" defaultValue={filters.from} aria-label="开始日期" />
        <Input name="to" type="date" defaultValue={filters.to} aria-label="结束日期" />
        <Button type="submit">查询</Button>
      </form>

      <nav className="flex gap-5 overflow-x-auto border-b" aria-label="工作量视图">
        {Object.entries(TAB_LABELS).map(([tab, label]) => (
          <Link
            key={tab}
            href={buildHref(filters, { tab: tab as WorkloadDashboardProps["filters"]["tab"] })}
            className={cn(
              "border-b-2 px-1 pb-3 text-sm font-medium text-muted-foreground",
              filters.tab === tab && "border-primary text-foreground"
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      {filters.tab === "records" ? (
        <section>
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">工作记录</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                每一条记录都关联实际执行账号和业务来源。
              </p>
            </div>
            <span className="text-sm text-muted-foreground">{workload.eventCount} 条</span>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>执行人</TableHead>
                  <TableHead>关系</TableHead>
                  <TableHead>工作</TableHead>
                  <TableHead>企业 / 仓库</TableHead>
                  <TableHead className="text-right">工作量</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workload.records.length ? (
                  workload.records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {new Date(record.occurredAt).toLocaleString("zh-CN")}
                      </TableCell>
                      <TableCell className="font-medium">{record.userName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {RELATIONSHIP_LABELS[record.relationshipType] ?? record.relationshipType}
                        </Badge>
                      </TableCell>
                      <TableCell>{record.workName}</TableCell>
                      <TableCell>
                        <p>{record.organizationName ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {record.locationName ?? "未记录仓库"}
                        </p>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatNumber(record.quantity)} {record.unit}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                      当前范围暂无工作记录
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {filters.tab === "people" ? (
        <section>
          <h2 className="mb-3 text-base font-semibold">人员汇总</h2>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>执行人</TableHead>
                  <TableHead>关系</TableHead>
                  <TableHead className="text-right">记录数</TableHead>
                  {workload.types.map((type) => (
                    <TableHead key={type.id} className="text-right">
                      {type.name} ({type.unit})
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {workload.rows.length ? (
                  workload.rows.map((row) => (
                    <TableRow key={row.userId}>
                      <TableCell className="font-medium">{row.userName}</TableCell>
                      <TableCell>
                        {row.relationshipTypes
                          .map((type) => RELATIONSHIP_LABELS[type] ?? type)
                          .join("、") || "未知"}
                      </TableCell>
                      <TableCell className="text-right">{row.eventCount}</TableCell>
                      {workload.types.map((type) => (
                        <TableCell key={type.id} className="text-right">
                          {row.values[type.id] ? formatNumber(row.values[type.id].quantity) : "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={3 + workload.types.length}
                      className="py-12 text-center text-muted-foreground"
                    >
                      暂无人员工作量
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {filters.tab === "types" ? (
        <section>
          <div className="mb-3">
            <h2 className="text-base font-semibold">类型与计价</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              工作类型保持动态；单价只用于对账预估，不修改原始工作记录。
            </p>
          </div>
          <div className="divide-y rounded-lg border">
            {workload.types.map((type) => (
              <div
                key={type.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{type.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {type.code} · 计量单位 {type.unit}
                  </p>
                </div>
                <RateEditor
                  type={type}
                  canManage={canManageRates && filters.scope === "organization"}
                />
              </div>
            ))}
            {!workload.types.length ? (
              <p className="p-10 text-center text-sm text-muted-foreground">暂无工作类型</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {filters.tab === "settlement" ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">对账预览</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              按当前计价规则计算；原始记录保持追加式，不会被单价调整覆盖。
            </p>
          </div>
          <div className="flex flex-wrap gap-6 border-y py-4">
            {workload.settlement.map((item) => (
              <div key={item.currency}>
                <p className="text-xs text-muted-foreground">已计价 · {item.currency}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {formatNumber(item.amount)}
                </p>
                <p className="text-xs text-muted-foreground">{item.pricedRecords} 条记录</p>
              </div>
            ))}
            <div>
              <p className="text-xs text-muted-foreground">未配置单价</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{workload.unpricedRecords}</p>
              <p className="text-xs text-muted-foreground">条记录待计价</p>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>执行人</TableHead>
                  <TableHead>工作</TableHead>
                  <TableHead className="text-right">数量</TableHead>
                  <TableHead className="text-right">单价</TableHead>
                  <TableHead className="text-right">预估金额</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workload.records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>{record.userName}</TableCell>
                    <TableCell>{record.workName}</TableCell>
                    <TableCell className="text-right">
                      {formatNumber(record.quantity)} {record.unit}
                    </TableCell>
                    <TableCell className="text-right">
                      {record.settlementRate
                        ? `${record.settlementCurrency} ${formatNumber(record.settlementRate)}`
                        : "未配置"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {record.settlementAmount
                        ? `${record.settlementCurrency} ${formatNumber(record.settlementAmount)}`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
