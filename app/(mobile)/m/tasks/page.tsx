import Link from "next/link";
import { ChevronLeft, Layers3, ScanLine } from "lucide-react";
import { MobileTaskList } from "@/components/mobile/mobile-task-list";
import { getMobileTasks, type MobileTaskScope } from "@/lib/mobile/tasks";
import { cn } from "@/lib/utils";
import { requireMobilePageContext } from "@/lib/mobile/page-auth";

export const dynamic = "force-dynamic";

const scopes: Array<{ value: MobileTaskScope; label: string }> = [
  { value: "today", label: "今天" },
  { value: "mine", label: "我的" },
  { value: "open", label: "待领取" },
  { value: "delegated", label: "我委托的" },
  { value: "completed", label: "已完成" },
];

export default async function MobileTasksPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  await requireMobilePageContext("/m/tasks");
  const params = await searchParams;
  const scope = scopes.some((item) => item.value === params.scope) ? (params.scope as MobileTaskScope) : "today";
  const tasks = await getMobileTasks(scope);
  return (
    <main className="px-5 pb-8 pt-[max(env(safe-area-inset-top),1rem)]">
      <header className="flex items-center gap-3 py-2">
        <Link href="/m" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600"><ChevronLeft className="h-5 w-5" /></Link>
        <div><h1 className="text-xl font-semibold tracking-tight text-slate-950">待办</h1><p className="text-xs text-slate-400">只显示需要执行的下一步</p></div>
      </header>
      <nav className="mt-5 flex gap-1 overflow-x-auto border-b border-slate-200 pb-2">
        {scopes.map((item) => <Link key={item.value} href={`/m/tasks?scope=${item.value}`} className={cn("shrink-0 rounded-lg px-3 py-2 text-xs font-medium", scope === item.value ? "bg-slate-950 text-white" : "text-slate-500")}>{item.label}</Link>)}
      </nav>
      {scope === "today" ? <div className="mt-4 grid grid-cols-2 gap-2"><Link href="/m/tasks/batch" className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-50 px-2 text-center text-xs font-semibold text-blue-700"><Layers3 className="h-4 w-4" />批量节点</Link><Link href="/m/tasks/ship" className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-2 text-center text-xs font-semibold text-white"><ScanLine className="h-4 w-4" />连续发货</Link></div> : null}
      <div className="mt-2"><MobileTaskList tasks={tasks} /></div>
    </main>
  );
}
