import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ChevronLeft } from "lucide-react";
import { requireMobilePageContext } from "@/lib/mobile/page-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MobilePriceChangesPage() {
  const context = await requireMobilePageContext("/m/prices");
  const changes = await prisma.sourcePriceChange.findMany({ where: { sourceListing: { organizationId: context.organizationId, storeId: context.activeStoreId } }, include: { sourceListing: { select: { title: true, platformName: true } } }, orderBy: { observedAt: "desc" }, take: 50 });
  return <main className="px-5 pb-8 pt-[max(env(safe-area-inset-top),1rem)]"><header className="flex items-center justify-between py-2"><div className="flex items-center gap-3"><Link href="/m" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600"><ChevronLeft className="h-5 w-5" /></Link><div><h1 className="text-xl font-semibold text-slate-950">价格变化</h1><p className="mt-0.5 text-[11px] text-slate-400">最近 50 次来源价格变化</p></div></div><Link href="/m/capture/price" className="text-xs font-semibold text-blue-700">记录价格</Link></header><section className="mt-6 divide-y divide-slate-100">{changes.length ? changes.map((change) => { const up = Number(change.deltaAmount) > 0; return <article key={change.id} className="py-4"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{change.sourceListing.title || "未命名商品"}</p><p className="mt-1 text-[11px] text-slate-400">{change.sourceListing.platformName} · {change.observedAt.toLocaleDateString("zh-CN")}</p></div><span className={`flex shrink-0 items-center gap-1 text-sm font-semibold ${up ? "text-rose-600" : "text-emerald-600"}`}>{up ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}{change.currency} {change.deltaAmount.toString()}</span></div><p className="mt-3 text-xs text-slate-500">{change.previousAmount.toString()} → <span className="font-medium text-slate-800">{change.amount.toString()}</span>{change.deltaRate ? ` · ${(Number(change.deltaRate) * 100).toFixed(1)}%` : ""}</p></article>; }) : <div className="py-20 text-center text-sm text-slate-400">还没有检测到价格变化</div>}</section></main>;
}
