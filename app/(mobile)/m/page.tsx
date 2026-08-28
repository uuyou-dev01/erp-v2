import Link from "next/link";
import { ArrowRight, Bell, CircleAlert, Clock3, ScanLine } from "lucide-react";
import { getMobileHome } from "@/lib/mobile/tasks";
import { requireMobilePageContext } from "@/lib/mobile/page-auth";
import { MobileTaskList } from "@/components/mobile/mobile-task-list";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

export default async function MobileHomePage() {
  const context = await requireMobilePageContext("/m");
  const [home, organization] = await Promise.all([
    getMobileHome(),
    prisma.organization.findUniqueOrThrow({
      where: { id: context.organizationId },
      select: { name: true },
    }),
  ]);
  return (
    <main className="px-5 pb-6 pt-[max(env(safe-area-inset-top),1.25rem)]">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-400">
            {organization.name} · {home.storeName}
          </p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.04em] text-slate-950">
            {greeting()}，{home.user.name.split(/\s/)[0]}
          </h1>
        </div>
        <Link
          href="/m/notifications"
          className="relative flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600"
        >
          <Bell className="h-[18px] w-[18px]" />
          {home.counts.unread > 0 ? (
            <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-600" />
          ) : null}
        </Link>
      </header>

      <section className="mt-8 grid grid-cols-3 divide-x divide-slate-200 border-y border-slate-200 py-4">
        <div className="pr-3">
          <p className="text-2xl font-semibold tracking-tight text-slate-950">
            {home.counts.total}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">今天待办</p>
        </div>
        <div className="px-3">
          <p className="text-2xl font-semibold tracking-tight text-amber-600">
            {home.counts.overdue}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">已经超时</p>
        </div>
        <div className="pl-3">
          <p className="text-2xl font-semibold tracking-tight text-rose-600">
            {home.counts.critical}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">异常事项</p>
        </div>
      </section>

      <section className="mt-5 flex items-center justify-between border-b border-slate-200 pb-4 text-xs">
        <span className="text-slate-500">30 天完成 {home.sla.completed} 项</span>
        <span className="font-medium text-slate-700">
          平均周期{" "}
          {home.sla.averageCycleHours === null ? "—" : `${home.sla.averageCycleHours.toFixed(1)}h`}{" "}
          · 24h 内到期 {home.sla.dueSoon}
        </span>
      </section>

      <section className="mt-7">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-600">
              Now
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">现在需要处理</h2>
          </div>
          <Link
            href="/m/tasks"
            className="flex items-center gap-1 text-xs font-medium text-slate-500"
          >
            全部 <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="mt-2">
          <MobileTaskList tasks={home.tasks} />
        </div>
      </section>

      <section className="mt-6 grid grid-cols-2 gap-3">
        <Link
          href="/m/capture/purchase"
          className="rounded-2xl bg-slate-950 p-4 text-white active:scale-[0.99]"
        >
          <ScanLine className="h-5 w-5 text-blue-300" />
          <p className="mt-5 text-sm font-semibold">登记已购买</p>
          <p className="mt-1 text-[11px] text-slate-400">截图或快速录入</p>
        </Link>
        <Link
          href="/m/capture/price"
          className="rounded-2xl bg-blue-50 p-4 text-blue-950 active:scale-[0.99]"
        >
          <Clock3 className="h-5 w-5 text-blue-600" />
          <p className="mt-5 text-sm font-semibold">记录一个价格</p>
          <p className="mt-1 text-[11px] text-blue-700/60">保留来源与时间</p>
        </Link>
      </section>
      <Link
        href="/m/prices"
        className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-xs font-medium text-slate-600"
      >
        <span>查看已记录的价格变化</span>
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>

      {home.counts.overdue > 0 ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-amber-900">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-xs leading-5">
            有 {home.counts.overdue} 项已超过截止时间，请优先处理或重新委托。
          </p>
        </div>
      ) : null}
    </main>
  );
}
