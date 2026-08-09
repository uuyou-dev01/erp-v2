import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { MobileCaptureForm } from "@/components/mobile/mobile-capture-form";
import { requireMobilePageContext } from "@/lib/mobile/page-auth";

export const dynamic = "force-dynamic";

export default async function MobilePriceCapturePage({ searchParams }: { searchParams: Promise<{ title?: string; text?: string; url?: string; shared?: string }> }) {
  await requireMobilePageContext("/m/capture/price");
  const shared = await searchParams;
  return <main className="px-5 pb-8 pt-[max(env(safe-area-inset-top),1rem)]"><header className="flex items-center gap-3 py-2"><Link href="/m/capture" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600"><ChevronLeft className="h-5 w-5" /></Link><div><h1 className="text-xl font-semibold text-slate-950">记录市场价格</h1><p className="text-xs text-slate-400">{shared.shared ? "已接收系统分享，请核对后保存" : "保存看到的事实，不改变库存"}</p></div></header><section className="mt-7"><MobileCaptureForm mode="price" initial={{ title: shared.title, sourceText: shared.text, sourceUrl: shared.url }} /></section></main>;
}
