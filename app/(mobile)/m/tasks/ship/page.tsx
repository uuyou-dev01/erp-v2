import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getMobileTasks } from "@/lib/mobile/tasks";
import { MobileContinuousShipping } from "@/components/mobile/mobile-continuous-shipping";
import { requireMobilePageContext } from "@/lib/mobile/page-auth";

export const dynamic = "force-dynamic";

export default async function MobileContinuousShippingPage() {
  await requireMobilePageContext("/m/tasks/ship");
  const tasks = (await getMobileTasks("today")).filter((task) => task.primaryAction === "shipOrder").map((task) => ({ id: task.id, title: task.title, subtitle: task.subtitle }));
  return <main className="px-5 pb-28 pt-[max(env(safe-area-inset-top),1rem)]"><header className="flex items-center gap-3 py-2"><Link href="/m/tasks" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600"><ChevronLeft className="h-5 w-5" /></Link><div><h1 className="text-xl font-semibold text-slate-950">连续扫码发货</h1><p className="text-xs text-slate-400">一件一证据，成功后自动进入下一件</p></div></header><section className="mt-6"><MobileContinuousShipping tasks={tasks} /></section></main>;
}
