"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Decimal from "decimal.js";
import {
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  CircleHelp,
  Handshake,
  Package,
  ReceiptText,
  TrendingUp,
} from "lucide-react";
import type { OperatingReport } from "@/lib/application/operating-report";
import { reportMoney, sumReportMoney } from "@/lib/application/operating-report-math";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DateRangePicker } from "./date-range-picker";
import { OperatingTrendChart } from "./operating-trend-chart";
import { DetailTable, MonthlyTable, CurrencySummary } from "./report-detail-table";
import {
  Section,
  Notice,
  Empty,
  Metric,
  Amount,
  numberClass,
  downloadCsv,
} from "./report-primitives";
import { cn } from "@/lib/utils";

const tabs = [
  { id: "overview", label: "经营总览", icon: BarChart3 },
  { id: "sales", label: "销售与利润", icon: TrendingUp },
  { id: "inventory", label: "采购与库存", icon: Package },
  { id: "expenses", label: "费用分析", icon: ReceiptText },
  { id: "settlements", label: "代卖结算", icon: Handshake },
] as const;
type TabId = (typeof tabs)[number]["id"];
const isTab = (value?: string): value is TabId => tabs.some((tab) => tab.id === value);

export function OperatingDashboard({
  data,
  initialTab,
}: {
  data: OperatingReport;
  initialTab?: string;
}) {
  const [tab, setTab] = useState<TabId>(isTab(initialTab) ? initialTab : "overview");
  const [showRules, setShowRules] = useState(false);
  useEffect(() => {
    const restoreTab = () => {
      const value = new URL(window.location.href).searchParams.get("tab") ?? undefined;
      setTab(isTab(value) ? value : "overview");
    };
    window.addEventListener("popstate", restoreTab);
    return () => window.removeEventListener("popstate", restoreTab);
  }, []);
  const changeTab = (next: TabId) => {
    setTab(next);
    document.getElementById("operating-report")?.scrollIntoView({ block: "start" });
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  };
  const s = data.summary;
  const period = `${data.from} 至 ${data.to}`;
  const profitRate =
    s.revenue !== null && Number(s.revenue) > 0 && s.profit !== null
      ? `${new Decimal(s.profit).div(s.revenue).mul(100).toFixed(1)}%`
      : "—";
  const exceptionRows = [
    ...data.sales,
    ...data.procurement,
    ...data.stock,
    ...data.expenses,
    ...data.charges,
    ...data.settlements,
  ].filter((row) => row.included && row.money.error);
  const summaryExport = () =>
    downloadCsv(`经营报表-${data.from}-${data.to}`, [
      ["期间", period],
      ["店铺", data.storeName],
      ["本位币", data.baseCurrency],
      ["时区", "Asia/Shanghai"],
      ["口径", "订单贡献利润，非企业净利润；运费未确认时为参考值。主体费用及物流支出独立列示。"],
      ["指标", "金额 CNY", "范围"],
      ["销售收入", s.revenue, period],
      ["订单贡献利润", s.profit, period],
      ["已售商品成本", s.cost, period],
      ["平台费", s.platformFee, period],
      ["销售运费", s.shippingFee, period],
      ["代理手续费预估（未计入贡献利润）", s.providerFeeEstimate, period],
      ["采购额（非草稿/取消）", s.purchase, period],
      ["库存成本（当前）", s.inventory, `当前快照 ${data.generatedAt}`],
      ["物流支出（独立列示）", s.logistics, period],
      ["主体确认应付（独立列示）", s.chargePayable, period],
      ["主体确认应收（独立列示）", s.chargeReceivable, period],
      ["邮费未确认订单", s.provisionalCount, period],
      ["利润待核算订单", s.missingProfitCount, period],
      ["结算确认待付", s.pendingPayable, "按结算单创建期间"],
      ["结算确认待收", s.pendingReceivable, "按结算单创建期间"],
      [],
      ["月份", "销售收入 CNY", "成本 CNY", "平台费 CNY", "销售运费 CNY", "订单贡献利润 CNY"],
      ...data.monthly.map((row) => [
        row.month,
        row.revenue,
        row.cost,
        row.platformFee,
        row.shippingFee,
        row.profit,
      ]),
    ]);
  return (
    <div id="operating-report" className="space-y-5 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">经营报表</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {data.storeName} · 从经营概况追溯到每一笔业务
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/reports/workload"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            工作量中心
            <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
          </Link>
          <Button variant="outline" size="sm" onClick={summaryExport}>
            <ArrowDownToLine className="mr-2 h-4 w-4" />
            导出汇总
          </Button>
        </div>
      </header>
      <div className="rounded-lg border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DateRangePicker from={data.from} to={data.to} />
          <button
            aria-expanded={showRules}
            onClick={() => setShowRules(!showRules)}
            className="inline-flex items-center gap-2 rounded px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
          >
            <CircleHelp className="h-4 w-4" />
            本位币 CNY · 币种与统计口径
            <ChevronDown className={cn("h-3.5 w-3.5", showRules && "rotate-180")} />
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          统计期间：{period}（北京时间）<span className="mx-2">|</span>
          库存、上架为当前快照；费用子账为当前主体范围。
        </p>
      </div>
      {data.rangeError && <Notice>{data.rangeError}</Notice>}
      {showRules && (
        <Section
          title="币种与统计口径"
          description="先按原币核对交易，再按每笔业务汇率折算；不同币种的原币金额不直接相加。"
        >
          <div className="grid gap-5 p-5 text-sm leading-6 md:grid-cols-2">
            <div>
              <h3 className="font-medium">原币 → 本位币</h3>
              <p className="mt-1 text-muted-foreground">
                本位币金额 = 原币金额 × 原币兑 CNY
                汇率。采购优先用约定汇率；销售按订单日、库存成本按入库日取历史汇率。结算和确认费用优先用已保存的
                CNY 金额。
              </p>
              <p className="mt-2 text-muted-foreground">
                例如 JPY 10,000 × 0.05 = CNY 500.00。示例汇率仅用于说明。
              </p>
            </div>
            <div>
              <h3 className="font-medium">利润与数据完整性</h3>
              <p className="mt-1 text-muted-foreground">
                订单贡献利润 = 销售收入 − 已售商品成本 − 平台费 −
                销售运费。采购额不等于已售商品成本；独立物流与主体费用可能与成本重叠，单列展示。
              </p>
              <p className="mt-2 text-muted-foreground">
                缺失或过期汇率、成本未确认：相关合计显示待核算。运费预估：利润标为参考值。销售采用经营发生日汇率，不代表最终收款或汇兑损益。
              </p>
            </div>
          </div>
        </Section>
      )}
      <nav
        id="report-tabs"
        role="tablist"
        aria-label="经营报表分类"
        className="sticky top-0 z-20 flex gap-1 overflow-x-auto border-b bg-background"
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const current = tabs.findIndex((item) => item.id === tab);
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? tabs.length - 1
                : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
          changeTab(tabs[next].id);
          document.getElementById(`report-tab-${tabs[next].id}`)?.focus();
        }}
      >
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            id={`report-tab-${id}`}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`report-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => changeTab(id)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600",
              tab === id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>
      <div
        role="tabpanel"
        id={`report-panel-${tab}`}
        aria-labelledby={`report-tab-${tab}`}
        className="space-y-5"
      >
        {tab === "overview" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                title="销售收入"
                value={reportMoney(s.revenue)}
                description={`${s.orderCount} 笔成交订单 · 查看销售明细`}
                onClick={() => changeTab("sales")}
                highlight
              />
              <Metric
                title="订单贡献利润"
                value={reportMoney(s.profit)}
                description={`贡献利润率 ${profitRate}${s.provisionalCount ? " · 含预估运费，仅供参考" : " · 查看成本拆解"}`}
                onClick={() => changeTab("sales")}
              />
              <Metric
                title="采购金额"
                value={reportMoney(s.purchase)}
                description={`${data.procurement.filter((row) => row.included).length} 笔有效采购 · 草稿与取消不计入`}
                onClick={() => changeTab("inventory")}
              />
              <Metric
                title="库存成本（当前）"
                value={reportMoney(s.inventory)}
                description={`${data.stock.length} 条在库记录 · 当前快照`}
                onClick={() => changeTab("inventory")}
              />
            </div>
            {(s.provisionalCount > 0 || s.missingProfitCount > 0 || exceptionRows.length > 0) && (
              <Notice>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    核算待办：{s.provisionalCount} 笔订单邮费待确认；{s.missingProfitCount}{" "}
                    笔订单利润待核算；{exceptionRows.length} 条金额待补齐。
                  </span>
                  <button
                    onClick={() => changeTab("sales")}
                    className="font-medium underline underline-offset-4"
                  >
                    查看订单明细
                  </button>
                </div>
              </Notice>
            )}
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,1fr)]">
              <Section
                title="收入与利润趋势"
                description="所选期间 · CNY · 未完成核算的利润不绘制"
                action={
                  <button
                    onClick={() => changeTab("sales")}
                    className="text-xs text-blue-700 hover:underline"
                  >
                    查看月度明细
                  </button>
                }
              >
                <div className="p-4">
                  <OperatingTrendChart rows={data.monthly} />
                </div>
              </Section>
              <Section title="收入如何形成利润" description="订单贡献口径 · CNY">
                <div className="space-y-4 p-5">
                  {[
                    ["销售收入", s.revenue],
                    ["减：已售商品成本", s.cost],
                    ["减：平台费", s.platformFee],
                    ["减：销售运费", s.shippingFee],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="tabular-nums">
                        <Amount value={value} />
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between gap-2 border-t pt-4 font-semibold">
                    <span>订单贡献利润</span>
                    <Amount value={s.profit} />
                  </div>
                  <p className="text-xs leading-6 text-muted-foreground">
                    {s.provisionalCount
                      ? "存在预估或待确认运费，利润仅供参考。"
                      : "按已录入成本及费用计算。"}{" "}
                    不含独立物流、主体费用、税费及汇兑损益，非企业净利润。
                  </p>
                </div>
              </Section>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Section
                title="销售渠道"
                description="按折合 CNY 收入对比；原币见销售明细"
                action={
                  <button
                    onClick={() => changeTab("sales")}
                    className="text-xs text-blue-700 hover:underline"
                  >
                    展开渠道分析
                  </button>
                }
              >
                {data.platforms.length ? (
                  <div className="space-y-4 p-5">
                    {data.platforms.slice(0, 4).map((platform) => (
                      <div key={platform.name}>
                        <div className="mb-2 flex justify-between gap-3 text-sm">
                          <span>
                            {platform.name}
                            <span className="ml-2 text-xs text-muted-foreground">
                              {platform.orderCount} 单
                            </span>
                          </span>
                          <Amount value={platform.revenue} />
                        </div>
                        <div className="h-1.5 overflow-hidden rounded bg-slate-100">
                          <div
                            className="h-full rounded bg-blue-500"
                            style={{
                              width: `${s.revenue && platform.revenue && Number(s.revenue) > 0 ? Math.min(100, (Number(platform.revenue) / Number(s.revenue)) * 100) : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty>当前期间暂无渠道销售。</Empty>
                )}
              </Section>
              <Section title="结算与运营" description="结算金额按创建期间统计；上架为当前快照">
                <div className="grid grid-cols-2 gap-x-6 gap-y-5 p-5">
                  <button onClick={() => changeTab("settlements")} className="text-left">
                    <p className="text-xs text-muted-foreground">已确认待付</p>
                    <p className="mt-2 font-semibold tabular-nums">
                      <Amount value={s.pendingPayable} />
                    </p>
                  </button>
                  <button onClick={() => changeTab("settlements")} className="text-left">
                    <p className="text-xs text-muted-foreground">已确认待收</p>
                    <p className="mt-2 font-semibold tabular-nums">
                      <Amount value={s.pendingReceivable} />
                    </p>
                  </button>
                  <Link href="/listing">
                    <p className="text-xs text-muted-foreground">在售上架</p>
                    <p className="mt-2 font-semibold">
                      {s.listingCount} 条 <ArrowUpRight className="inline h-3 w-3 text-blue-600" />
                    </p>
                  </Link>
                  <button onClick={() => changeTab("expenses")} className="text-left">
                    <p className="text-xs text-muted-foreground">实际物流支出</p>
                    <p className="mt-2 font-semibold tabular-nums">
                      <Amount value={s.logistics} />
                    </p>
                  </button>
                </div>
              </Section>
            </div>
          </>
        )}
        {tab === "sales" && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric
                title="销售收入"
                value={reportMoney(s.revenue)}
                description={`${s.orderCount} 笔成交订单`}
                onClick={() =>
                  document.getElementById("sales-details")?.scrollIntoView({ block: "start" })
                }
                highlight
              />
              <Metric
                title="已售商品成本"
                value={reportMoney(s.cost)}
                description="按库存分配追溯成本原币与入库日期"
                onClick={() =>
                  document.getElementById("sales-details")?.scrollIntoView({ block: "start" })
                }
              />
              <Metric
                title="订单贡献利润"
                value={reportMoney(s.profit)}
                description={`利润率 ${profitRate} · ${s.provisionalCount} 笔运费待确认`}
                onClick={() =>
                  document.getElementById("sales-details")?.scrollIntoView({ block: "start" })
                }
              />
            </div>
            {(s.provisionalCount > 0 || s.missingProfitCount > 0) && (
              <Notice>
                {s.provisionalCount} 笔订单邮费未确认为实际值；{s.missingProfitCount}{" "}
                笔利润待核算。展开“订单详情”可查看原因。贡献利润不代表企业净利润。
              </Notice>
            )}
            <Section title="收入与利润趋势" description="与当前筛选期间一致 · CNY">
              <div className="p-4">
                <OperatingTrendChart rows={data.monthly} />
              </div>
            </Section>
            <MonthlyTable data={data} />
            <div className="grid gap-4 lg:grid-cols-2">
              <Section title="原币核对" description="各币种单独合计，折算金额逐笔汇总。">
                {s.orderCount ? (
                  <CurrencySummary rows={data.sales} />
                ) : (
                  <Empty>暂无成交订单。</Empty>
                )}
              </Section>
              <Section title="渠道贡献" description="同一平台的不同币种统一折合 CNY 后比较。">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>渠道</TableHead>
                      <TableHead className={numberClass}>订单</TableHead>
                      <TableHead className={numberClass}>销售收入</TableHead>
                      <TableHead className={numberClass}>贡献利润</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.platforms.map((row) => (
                      <TableRow key={row.name}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell className={numberClass}>{row.orderCount}</TableCell>
                        <TableCell className={numberClass}>
                          <Amount value={row.revenue} />
                        </TableCell>
                        <TableCell className={numberClass}>
                          <Amount value={row.profit} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {!data.platforms.length && <Empty>当前期间暂无渠道销售。</Empty>}
              </Section>
            </div>
            <div id="sales-details" className="scroll-mt-16">
              <DetailTable
                rows={data.sales}
                title="销售订单明细"
                scope={`${period} · 已确认、已发货、已送达计入成交；取消及整单退货不计入。`}
                emptyHref="/sales"
                kind="sales"
              />
            </div>
          </>
        )}
        {tab === "inventory" && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric
                title="采购金额"
                value={reportMoney(s.purchase)}
                description="所选期间 · 草稿和取消不计入"
                onClick={() =>
                  document.getElementById("purchase-details")?.scrollIntoView({ block: "start" })
                }
                highlight
              />
              <Metric
                title="库存成本（当前）"
                value={reportMoney(s.inventory)}
                description="当前在库批次和可用单品的历史成本"
                onClick={() =>
                  document.getElementById("stock-details")?.scrollIntoView({ block: "start" })
                }
              />
              <Metric
                title="在库商品数量"
                value={`${data.stock.reduce((sum, row) => sum.plus(row.quantity), new Decimal(0)).toString()} 件`}
                description={`${data.stock.length} 条可用库存记录 · 当前快照`}
                onClick={() =>
                  document.getElementById("stock-details")?.scrollIntoView({ block: "start" })
                }
              />
            </div>
            <Section
              title="仓库库存分布"
              description="当前快照，不受期间筛选影响。按账面在库数量计价；不含已分配单品及在途库存。"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>仓库 / 位置</TableHead>
                    <TableHead className={numberClass}>库存记录</TableHead>
                    <TableHead className={numberClass}>在库数量</TableHead>
                    <TableHead className={numberClass}>库存成本 CNY</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.stockLocations.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className={numberClass}>{row.count}</TableCell>
                      <TableCell className={numberClass}>{row.quantity}</TableCell>
                      <TableCell className={numberClass}>
                        <Amount value={row.value} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!data.stock.length && <Empty href="/inventory/lots">当前没有可用库存。</Empty>}
            </Section>
            <div id="purchase-details" className="scroll-mt-16">
              <DetailTable
                rows={data.procurement}
                title="采购订单明细"
                scope={`${period} · 下单日期统计；采购额不是当期销售成本。`}
                emptyHref="/procurement"
              />
            </div>
            <div id="stock-details" className="scroll-mt-16">
              <DetailTable
                rows={data.stock}
                title="当前库存明细"
                scope={`当前快照 · ${new Date(data.generatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}（北京时间）`}
                emptyHref="/inventory/lots"
                kind="stock"
              />
            </div>
          </>
        )}
        {tab === "expenses" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                title="订单平台费"
                value={reportMoney(s.platformFee)}
                description="店铺范围 · 已在订单贡献利润扣除"
                onClick={() => changeTab("sales")}
              />
              <Metric
                title="订单销售运费"
                value={reportMoney(s.shippingFee)}
                description={`${s.provisionalCount} 笔未确认实际值 · 含预估`}
                onClick={() => changeTab("sales")}
              />
              <Metric
                title="实际物流支出"
                value={reportMoney(s.logistics)}
                description="采购 / 转仓 / 集运 · 独立列示"
                onClick={() =>
                  document.getElementById("logistics-details")?.scrollIntoView({ block: "start" })
                }
              />
              <Metric
                title="代理手续费预估"
                value={reportMoney(s.providerFeeEstimate)}
                description="按订单金额 × 约定费率 · 未计入贡献利润"
                onClick={() => changeTab("sales")}
              />
            </div>
            <Notice>
              订单费用、物流支出、主体费用子账可能描述同一笔业务，因此不直接相加。主体费用尚未完整归属到店铺，独立对账，不并入当前店铺利润。预估和未确认费用不计入确认应收应付。
            </Notice>
            <div id="logistics-details" className="scroll-mt-16">
              <DetailTable
                rows={data.expenses}
                title="物流费用明细"
                scope={`${period} · 店铺范围 · 按费用发生日统计实际支出。`}
                emptyHref="/logistics/transfers"
              />
            </div>
            <Section
              title="主体费用核对"
              description="当前主体范围 · 原币逐币种展示 · 仅已确认的实际费用计入确认金额。"
              action={
                <Link className="text-xs text-blue-700 hover:underline" href="/finance/charges">
                  管理费用子账
                  <ArrowUpRight className="ml-1 inline h-3 w-3" />
                </Link>
              }
            >
              <div className="grid gap-4 border-b p-5 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">确认应付（非未付余额）</p>
                  <p className="mt-2 text-xl font-semibold tabular-nums">
                    <Amount value={s.chargePayable} />
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">确认应收（非未收余额）</p>
                  <p className="mt-2 text-xl font-semibold tabular-nums">
                    <Amount value={s.chargeReceivable} />
                  </p>
                </div>
              </div>
              {data.charges.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>原币</TableHead>
                      <TableHead className={numberClass}>预估应付</TableHead>
                      <TableHead className={numberClass}>确认应付</TableHead>
                      <TableHead className={numberClass}>预估应收</TableHead>
                      <TableHead className={numberClass}>确认应收</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...new Set(data.charges.map((row) => row.money.currency))]
                      .sort()
                      .map((currency) => (
                        <TableRow key={currency}>
                          <TableCell>{currency}</TableCell>
                          {[
                            ["应付", false],
                            ["应付", true],
                            ["应收", false],
                            ["应收", true],
                          ].map(([direction, actual], index) => (
                            <TableCell key={index} className={numberClass}>
                              {reportMoney(
                                sumReportMoney(
                                  data.charges
                                    .filter(
                                      (row) =>
                                        row.money.currency === currency &&
                                        row.direction === direction &&
                                        (actual ? row.included : row.kind === "ESTIMATE")
                                    )
                                    .map((row) => row.money.original)
                                ),
                                currency
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              ) : (
                <Empty href="/finance/charges" action="前往费用子账">
                  当前主体在所选期间暂无费用事件。
                </Empty>
              )}
            </Section>
            <DetailTable
              rows={data.charges}
              title="主体费用事件"
              scope={`${period} · 主体范围 · 预估、未确认与内部往来不计入确认金额。`}
              emptyHref="/finance/charges"
              kind="charge"
            />
          </>
        )}
        {tab === "settlements" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["已确认待付", s.pendingPayable, "应付与应收分别展示"],
                ["已确认待收", s.pendingReceivable, "不与其他交易方相抵"],
                ["已付应付款", s.paidPayable, "所选期间创建单据中的已付金额"],
                ["已收应收款", s.paidReceivable, "所选期间创建单据中的已收金额"],
              ].map(([title, value, description]) => (
                <Metric
                  key={title!}
                  title={title!}
                  value={reportMoney(value)}
                  description={description!}
                  onClick={() =>
                    document
                      .getElementById("settlement-details")
                      ?.scrollIntoView({ block: "start" })
                  }
                />
              ))}
            </div>
            <Section
              title="结算进度与口径"
              description="应收应付按明细方向独立汇总，说明行和作废单不计入。"
              action={
                <Link
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  href="/finance/settlements"
                >
                  管理结算单
                </Link>
              }
            >
              <div className="flex flex-wrap items-center gap-8 p-5 text-sm">
                <p>
                  期间结算单 <strong className="ml-2 tabular-nums">{s.settlementCount}</strong>
                </p>
                <p>
                  待确认草稿 <strong className="ml-2 tabular-nums">{s.draftSettlements}</strong>
                </p>
                <p className="text-xs text-muted-foreground">
                  草稿金额不计入正式待结算；已收/已付为单据状态统计，不等同本期现金流水。
                </p>
              </div>
            </Section>
            <div id="settlement-details" className="scroll-mt-16">
              <DetailTable
                rows={data.settlements}
                title="结算单费用明细"
                scope={`${period} · 按结算单创建日统计 · 优先读取已保存本位币快照。`}
                emptyHref="/finance/settlements"
                kind="settlement"
              />
            </div>
          </>
        )}
      </div>
      {exceptionRows.length > 0 && (
        <Section
          title="金额核算异常"
          description="以下记录保留原币，相关本位币合计显示待核算；补齐后刷新报表。"
        >
          <div className="divide-y px-5">
            {exceptionRows.map((row) => (
              <div key={row.id} className="flex flex-wrap justify-between gap-2 py-3 text-xs">
                <Link href={row.href} className="font-medium text-blue-700 hover:underline">
                  {row.label}
                </Link>
                <span className="text-amber-800">{row.money.error}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
      <footer className="flex flex-wrap justify-between gap-2 text-xs leading-5 text-muted-foreground">
        <span>金额精确至分；明细逐笔折算后汇总。原币金额不可跨币种直接相加。</span>
        <span>
          更新于{" "}
          {new Date(data.generatedAt).toLocaleString("zh-CN", {
            timeZone: "Asia/Shanghai",
            hour12: false,
          })}
        </span>
      </footer>
    </div>
  );
}
