import Link from "next/link";
import { ChevronLeft, LogOut, Monitor, Store, UserRound } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireMobilePageContext } from "@/lib/mobile/page-auth";
import { clearCurrentUser } from "@/app/actions/session";
import { MobileDeviceSettings } from "@/components/mobile/mobile-device-settings";

export default async function MobileMePage() {
  const context = await requireMobilePageContext("/m/me");
  const [user, store] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: context.userId },
      select: { name: true, email: true, role: true },
    }),
    prisma.store.findUniqueOrThrow({
      where: { id: context.activeStoreId },
      select: { name: true, code: true, organization: { select: { name: true } } },
    }),
  ]);
  return (
    <main className="px-5 pb-8 pt-[max(env(safe-area-inset-top),1rem)]">
      <header className="flex items-center gap-3 py-2">
        <Link
          href="/m"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-semibold text-slate-950">我的</h1>
      </header>
      <section className="mt-8 flex items-center gap-4 border-b border-slate-200 pb-6">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-950 text-white">
          <UserRound className="h-6 w-6" />
        </span>
        <div>
          <p className="text-lg font-semibold text-slate-950">{user.name || "未设置姓名"}</p>
          <p className="mt-1 text-xs text-slate-400">{user.email}</p>
        </div>
      </section>
      <div className="divide-y divide-slate-100">
        <div className="flex items-center gap-3 py-4">
          <Store className="h-4 w-4 text-slate-400" />
          <div>
            <p className="text-sm font-medium text-slate-800">{store.name}</p>
            <p className="text-[11px] text-slate-400">
              {store.organization?.name ?? "当前经营主体"} · {store.code}
            </p>
          </div>
        </div>
        <Link href="/workbench" className="flex items-center gap-3 py-4">
          <Monitor className="h-4 w-4 text-slate-400" />
          <div>
            <p className="text-sm font-medium text-slate-800">打开 PC ERP</p>
            <p className="text-[11px] text-slate-400">复杂配置与批量处理</p>
          </div>
        </Link>
      </div>
      <MobileDeviceSettings />
      <form action={clearCurrentUser} className="mt-8">
        <button
          type="submit"
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-100 text-sm font-medium text-slate-600"
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </button>
      </form>
    </main>
  );
}
