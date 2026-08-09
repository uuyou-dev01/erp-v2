import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireMobilePageContext } from "@/lib/mobile/page-auth";
import { getMobileTasks } from "@/lib/mobile/tasks";
import { MobileBatchRunner } from "@/components/mobile/mobile-batch-runner";

export const dynamic = "force-dynamic";

export default async function MobileBatchTasksPage() {
  const context = await requireMobilePageContext("/m/tasks/batch");
  const [allTasks, locations] = await Promise.all([
    getMobileTasks("today"),
    prisma.location.findMany({ where: { storeId: context.activeStoreId }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
  ]);
  const tasks = allTasks.filter((task) => ["fillLogistics", "confirmArrival", "receivePurchase", "inbound"].includes(task.primaryAction)).map((task) => ({ id: task.id, title: task.title, subtitle: task.subtitle, action: task.primaryAction, actionLabel: task.primaryActionLabel }));
  return <main className="px-5 pb-28 pt-[max(env(safe-area-inset-top),1rem)]"><header className="flex items-center gap-3 py-2"><Link href="/m/tasks" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600"><ChevronLeft className="h-5 w-5" /></Link><div><h1 className="text-xl font-semibold text-slate-950">批量现场处理</h1><p className="text-xs text-slate-400">同类节点一次确认，失败项单独保留</p></div></header><section className="mt-6"><MobileBatchRunner tasks={tasks} locations={locations} /></section></main>;
}
