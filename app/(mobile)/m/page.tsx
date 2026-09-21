import Link from "next/link";
import {
  Bell,
  UserRound,
  ShoppingBag,
  ReceiptText,
  PackageCheck,
  ClipboardCheck,
} from "lucide-react";
import { getMobileHome } from "@/lib/mobile/tasks";
import { requireMobilePageContext } from "@/lib/mobile/page-auth";
import { MobileTaskList } from "@/components/mobile/mobile-task-list";
import { MobileEntry } from "@/components/mobile/mobile-page";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export default async function Page() {
  const context = await requireMobilePageContext("/m");
  const [home, organization] = await Promise.all([
    getMobileHome(),
    prisma.organization.findUniqueOrThrow({
      where: { id: context.organizationId },
      select: { name: true },
    }),
  ]);
  return (
    <main className="space-y-6 px-5 pb-8 pt-[max(env(safe-area-inset-top),1.25rem)]">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">
            {organization.name} · {home.storeName}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            今天，{home.user.name.split(/\s/)[0]}
          </h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/m/notifications"
            aria-label={`通知，${home.counts.unread} 条未读`}
            className="relative flex h-11 w-11 items-center justify-center rounded-full bg-slate-100"
          >
            <Bell className="h-5 w-5" />
            {home.counts.unread > 0 && (
              <span className="absolute -right-1 -top-1 rounded-full bg-blue-600 px-1.5 text-xs text-white">
                {home.counts.unread}
              </span>
            )}
          </Link>
          <Link
            aria-label="我的账号"
            href="/m/me"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100"
          >
            <UserRound className="h-5 w-5" />
          </Link>
        </div>
      </header>
      <section className="grid grid-cols-2 gap-3">
        {[
          {
            href: "/m/capture/purchase",
            title: "买了东西",
            detail: "记采购 · 新建商品",
            icon: ShoppingBag,
          },
          { href: "/m/listings", title: "卖掉了", detail: "找商品 · 登记售出", icon: PackageCheck },
          {
            href: "/m/expenses",
            title: "补邮费 / 费用",
            detail: "从原单补成本",
            icon: ReceiptText,
          },
          {
            href: "/m/orders",
            title: "最近订单",
            detail: "收货 · 物流 · 结算",
            icon: ClipboardCheck,
          },
        ].map(({ href, title, detail, icon: Icon }, i) => (
          <Link
            key={href}
            href={href}
            className={`rounded-2xl p-4 ${i === 0 ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-950"}`}
          >
            <Icon className="h-5 w-5" />
            <p className="mt-4 text-sm font-semibold">{title}</p>
            <p className={`mt-1 text-xs ${i === 0 ? "text-blue-100" : "text-slate-500"}`}>
              {detail}
            </p>
          </Link>
        ))}
      </section>
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            今天待办 <span className="text-blue-600">{home.counts.total}</span>
          </h2>
          <Link href="/m/tasks" className="py-3 text-sm text-blue-700">
            全部待办 →
          </Link>
        </div>
        {home.counts.overdue > 0 && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            {home.counts.overdue} 项已超时，请优先处理
          </p>
        )}
        <MobileTaskList tasks={home.tasks} />
      </section>
      <MobileEntry
        href="/m/orders?kind=sale"
        title="销售结算与邮费"
        description="补实际邮费、平台手续费，核对每单利润"
      />
      <MobileEntry
        href="/m/capture"
        title="更多随手记录"
        description="记录市场价格、拍摄实物照片"
      />
    </main>
  );
}
