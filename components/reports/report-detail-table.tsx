"use client";
import { Fragment, useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import type {
  OperatingReport,
  ReportRow,
  ReportSale,
  ReportStock,
  ReportCharge,
  ReportSettlement,
} from "@/lib/application/operating-report";
import { reportMoney, sumReportMoney } from "@/lib/application/operating-report-math";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  Section,
  Empty,
  Amount,
  numberClass,
  statusLabels,
  directionLabels,
  downloadCsv,
} from "./report-primitives";

export function DetailTable({
  rows,
  title,
  scope,
  emptyHref,
  kind = "standard",
}: {
  rows: ReportRow[];
  title: string;
  scope: string;
  emptyHref: string;
  kind?: "standard" | "sales" | "stock" | "charge" | "settlement";
}) {
  const [query, setQuery] = useState("");
  const [currency, setCurrency] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const currencies = [...new Set(rows.map((row) => row.money.currency))].sort();
  const filtered = rows.filter(
    (row) =>
      (!currency || row.money.currency === currency) &&
      (!status || row.status === status) &&
      `${row.label} ${row.detail}`.toLowerCase().includes(query.toLowerCase())
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 10));
  const safePage = Math.min(page, pageCount - 1);
  const visibleRows = filtered.slice(safePage * 10, safePage * 10 + 10);
  const exportRows = () =>
    downloadCsv(title, [
      ["范围", scope],
      ["本位币", "CNY"],
      [
        "日期",
        "单据/商品",
        "分类",
        "状态",
        "原币",
        "原币金额",
        "折合 CNY",
        "汇率（原币→CNY）",
        "换算依据",
        "纳入统计",
        "订单成本 CNY",
        "平台费 CNY",
        "销售运费 CNY",
        "贡献利润 CNY",
        "代理手续费预估 CNY",
        "数量",
        "仓库位置",
        "收付方向",
        "实际/预估",
        "备注",
      ],
      ...filtered.map((row) => [
        row.date,
        row.label,
        row.detail,
        statusLabels[row.status] ?? row.status,
        row.money.currency,
        row.money.original,
        row.money.base,
        row.money.rate,
        row.money.basis,
        row.included ? "是" : "否",
        ...(kind === "sales"
          ? [
              (row as ReportSale).cost,
              (row as ReportSale).platformFee,
              (row as ReportSale).shippingFee,
              (row as ReportSale).profit,
            ]
          : ["", "", "", ""]),
        kind === "sales" ? (row as ReportSale).providerFeeEstimate : "",
        kind === "stock" ? (row as ReportStock).quantity : "",
        kind === "stock" ? (row as ReportStock).location : "",
        kind === "charge"
          ? (row as ReportCharge).direction
          : kind === "settlement"
            ? directionLabels[(row as ReportSettlement).direction]
            : "",
        kind === "charge" ? statusLabels[(row as ReportCharge).kind] : "",
        row.note,
      ]),
    ]);
  return (
    <Section
      title={title}
      description={scope}
      action={
        <Button variant="outline" size="sm" onClick={exportRows} disabled={!filtered.length}>
          <ArrowDownToLine className="mr-1.5 h-3.5 w-3.5" />
          导出明细
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
        <label className="flex h-9 min-w-44 flex-1 items-center gap-2 rounded-md border px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            aria-label={`搜索${title}`}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="搜索单据、商品或分类"
            className="w-full min-w-0 bg-transparent text-sm outline-none"
          />
        </label>
        <select
          aria-label={`${title}原币筛选`}
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={currency}
          onChange={(e) => {
            setCurrency(e.target.value);
            setPage(0);
          }}
        >
          <option value="">全部原币</option>
          {currencies.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          aria-label={`${title}状态筛选`}
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
        >
          <option value="">全部状态</option>
          {[...new Set(rows.map((row) => row.status))].map((value) => (
            <option key={value} value={value}>
              {statusLabels[value] ?? value}
            </option>
          ))}
        </select>
      </div>
      {!filtered.length ? (
        <Empty href={rows.length ? undefined : emptyHref}>
          {rows.length
            ? "没有符合筛选条件的记录，可调整搜索、币种或状态。"
            : "当前范围暂无记录，可调整日期或查看业务单据。"}
        </Empty>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日期</TableHead>
                <TableHead>{kind === "stock" ? "商品 / 位置" : "单据 / 分类"}</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className={numberClass}>原币金额</TableHead>
                <TableHead className={numberClass}>折合 CNY</TableHead>
                {kind === "sales" && <TableHead className={numberClass}>贡献利润 CNY</TableHead>}
                <TableHead className="text-right">明细</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => (
                <Fragment key={row.id}>
                  <TableRow>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {row.date}
                    </TableCell>
                    <TableCell className="max-w-64">
                      <Link href={row.href} className="font-medium text-blue-700 hover:underline">
                        {row.label}
                      </Link>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {row.detail}
                        {kind === "stock" && "location" in row
                          ? ` · ${row.location} · ${String((row as ReportStock).quantity)} 件`
                          : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "whitespace-nowrap rounded px-2 py-1 text-xs",
                          row.included
                            ? "bg-slate-100 text-slate-700"
                            : "bg-amber-50 text-amber-800"
                        )}
                      >
                        {statusLabels[row.status] ?? row.status}
                      </span>
                      {kind === "charge" && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {(row as ReportCharge).direction} ·{" "}
                          {statusLabels[(row as ReportCharge).kind]}
                        </div>
                      )}
                      {kind === "settlement" && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {directionLabels[(row as ReportSettlement).direction]}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className={numberClass}>
                      {reportMoney(row.money.original, row.money.currency)}
                    </TableCell>
                    <TableCell className={numberClass}>
                      {row.included ? (
                        <Amount value={row.money.base} />
                      ) : (
                        <span className="text-xs text-muted-foreground">未纳入</span>
                      )}
                    </TableCell>
                    {kind === "sales" && (
                      <TableCell className={numberClass}>
                        {row.included ? (
                          <>
                            <Amount value={(row as ReportSale).profit} />
                            {(row as ReportSale).provisional && (
                              <div className="text-xs text-amber-700">参考值</div>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <button
                        aria-label={`展开 ${row.label} 核算细节`}
                        aria-expanded={expanded === row.id}
                        onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 focus-visible:outline focus-visible:outline-blue-600"
                      >
                        核算细节
                        <ChevronDown
                          className={cn("h-3 w-3", expanded === row.id && "rotate-180")}
                        />
                      </button>
                    </TableCell>
                  </TableRow>
                  {expanded === row.id && (
                    <TableRow className="bg-slate-50/80">
                      <TableCell colSpan={kind === "sales" ? 7 : 6}>
                        <div className="grid gap-4 p-2 text-sm md:grid-cols-3">
                          <div>
                            <p className="mb-1 text-xs text-muted-foreground">换算依据</p>
                            <p>{row.money.basis}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {row.money.rate
                                ? `1 ${row.money.currency} = ${row.money.rate} CNY`
                                : "未使用换算汇率"}
                            </p>
                            {row.money.error && (
                              <p className="mt-1 text-xs text-amber-800">{row.money.error}</p>
                            )}
                          </div>
                          {kind === "sales" && (
                            <div className="space-y-1 text-xs">
                              <p className="mb-2 text-muted-foreground">订单成本拆解（CNY）</p>
                              <p>已售商品成本：{reportMoney((row as ReportSale).cost)}</p>
                              <p>平台费：{reportMoney((row as ReportSale).platformFee)}</p>
                              <p>销售运费：{reportMoney((row as ReportSale).shippingFee)}</p>
                              <p>
                                代理费预估（未扣减）：
                                {reportMoney((row as ReportSale).providerFeeEstimate)}
                              </p>
                              {(row as ReportSale).costDetails.map((cost, index) => (
                                <div
                                  key={index}
                                  className="mt-2 border-t pt-2 text-muted-foreground"
                                >
                                  <p>
                                    成本原币 {reportMoney(cost.original, cost.currency)} →{" "}
                                    {reportMoney(cost.base)}
                                  </p>
                                  <p>
                                    {cost.basis}
                                    {cost.rate ? ` · 汇率 ${cost.rate}` : ""}
                                  </p>
                                  {cost.error && <p className="text-amber-800">{cost.error}</p>}
                                </div>
                              ))}
                            </div>
                          )}
                          <div>
                            <p className="mb-1 text-xs text-muted-foreground">统计说明</p>
                            <p className="text-xs leading-6">{row.note}</p>
                            <Link
                              href={row.href}
                              className="mt-2 inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"
                            >
                              打开业务单据
                              <ArrowUpRight className="h-3 w-3" />
                            </Link>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t px-5 py-3 text-xs text-muted-foreground">
            <span>
              筛选后 {filtered.length} 条 / 全部 {rows.length} 条 · 原币按币种展示
            </span>
            <div className="flex items-center gap-3">
              <Button
                aria-label={`${title}上一页`}
                size="sm"
                variant="ghost"
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span>
                {safePage + 1} / {pageCount}
              </span>
              <Button
                aria-label={`${title}下一页`}
                size="sm"
                variant="ghost"
                disabled={safePage + 1 === pageCount}
                onClick={() => setPage(safePage + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </Section>
  );
}

export function MonthlyTable({ data }: { data: OperatingReport }) {
  return (
    <Section
      title="月度对账"
      description="与上方趋势图、总览指标采用同一期间和相同口径。金额均为 CNY。"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>月份</TableHead>
            <TableHead className={numberClass}>成交订单</TableHead>
            <TableHead className={numberClass}>销售收入</TableHead>
            <TableHead className={numberClass}>已售商品成本</TableHead>
            <TableHead className={numberClass}>平台费</TableHead>
            <TableHead className={numberClass}>销售运费</TableHead>
            <TableHead className={numberClass}>贡献利润</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.monthly.map((row) => (
            <TableRow key={row.month}>
              <TableCell>{row.month}</TableCell>
              <TableCell className={numberClass}>{row.orderCount}</TableCell>
              {[row.revenue, row.cost, row.platformFee, row.shippingFee, row.profit].map(
                (value, index) => (
                  <TableCell key={index} className={numberClass}>
                    <Amount value={value} />
                  </TableCell>
                )
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Section>
  );
}

export function CurrencySummary({ rows }: { rows: ReportRow[] }) {
  const currencies = [
    ...new Set(rows.filter((row) => row.included).map((row) => row.money.currency)),
  ].sort();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>交易原币</TableHead>
          <TableHead className={numberClass}>原币合计</TableHead>
          <TableHead className={numberClass}>折合 CNY 合计</TableHead>
          <TableHead className={numberClass}>记录数</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {currencies.map((currency) => {
          const items = rows.filter((row) => row.included && row.money.currency === currency);
          return (
            <TableRow key={currency}>
              <TableCell>{currency}</TableCell>
              <TableCell className={numberClass}>
                {reportMoney(sumReportMoney(items.map((row) => row.money.original)), currency)}
              </TableCell>
              <TableCell className={numberClass}>
                <Amount value={sumReportMoney(items.map((row) => row.money.base))} />
              </TableCell>
              <TableCell className={numberClass}>{items.length}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
