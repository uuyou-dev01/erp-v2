import Link from "next/link";
import { MobilePage } from "@/components/mobile/mobile-page";
import { requireMobilePageContext } from "@/lib/mobile/page-auth";
import { getOperatingReport } from "@/lib/application/operating-report";
import {
  resolveReportRange,
  reportDay,
  reportMoney,
} from "@/lib/application/operating-report-math";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const context = await requireMobilePageContext("/m/reports");
  const { range = "thisMonth" } = await searchParams;
  const today = reportDay(new Date());
  const period = resolveReportRange(
    range === "today" ? { range: "custom", from: today, to: today } : { range }
  );
  const data = await getOperatingReport(context.activeStoreId, context.organizationId, period);
  const metrics = [
    ["销售额", data.summary.revenue],
    ["订单利润", data.summary.profit],
    ["采购金额", data.summary.purchase],
    ["待收结算", data.summary.pendingReceivable],
  ];
  return (
    <MobilePage
      title="经营报表"
      description={`${data.storeName} · ${data.from} 至 ${data.to}（北京时间）`}
    >
      <nav className="flex gap-2">
        {[
          ["today", "今天"],
          ["thisMonth", "本月"],
          ["lastMonth", "上月"],
        ].map(([value, label]) => (
          <Link
            key={value}
            href={`/m/reports?range=${value}`}
            className={`rounded-lg px-4 py-3 text-sm ${range === value ? "bg-blue-600 text-white" : "bg-slate-100"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="grid grid-cols-2 gap-3">
        {metrics.map(([label, value]) => (
          <a
            key={label}
            href={
              label === "采购金额" ? "#purchases" : label === "待收结算" ? "#settlements" : "#sales"
            }
            className="rounded-xl border p-4"
          >
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-3 break-words text-lg font-semibold">
              {reportMoney(value, data.baseCurrency)}
            </p>
          </a>
        ))}
      </div>
      <p className="text-xs leading-5 text-slate-500">
        订单利润包含货品成本、平台费与邮费；{data.summary.provisionalCount} 单含预估费用，
        {data.summary.missingProfitCount}{" "}
        单待核算。采购金额不等于实际付款，待收结算不等于全部平台余额。
      </p>
      {[
        { id: "sales", title: "销售明细", rows: data.sales },
        { id: "purchases", title: "采购明细", rows: data.procurement },
        { id: "settlements", title: "结算明细", rows: data.settlements },
      ].map((section) => (
        <section id={section.id} key={section.id} className="scroll-mt-4">
          <h2 className="font-semibold">{section.title}</h2>
          {!section.rows.length && <p className="py-5 text-sm text-slate-500">本期暂无记录</p>}
          {section.rows.map((row) => (
            <Link
              key={row.id}
              href={row.href
                .replace(/^\/sales\//, "/m/orders/sale/")
                .replace(/^\/procurement\//, "/m/orders/purchase/")}
              className="block space-y-1 border-b py-3"
            >
              <p className="break-all text-sm font-medium">{row.label}</p>
              <p className="text-xs text-slate-500">
                {row.date} · {row.detail}
              </p>
              <p className="text-sm">{reportMoney(row.money.base, data.baseCurrency)}</p>
              {row.note && <p className="text-xs text-slate-500">{row.note}</p>}
            </Link>
          ))}
        </section>
      ))}
    </MobilePage>
  );
}
