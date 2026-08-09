import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { MobileCaptureForm } from "@/components/mobile/mobile-capture-form";
import { requireMobilePageContext } from "@/lib/mobile/page-auth";

export const dynamic = "force-dynamic";

export default async function MobilePurchaseCapturePage() {
  await requireMobilePageContext("/m/capture/purchase");
  return <main className="px-5 pb-8 pt-[max(env(safe-area-inset-top),1rem)]"><header className="flex items-center gap-3 py-2"><Link href="/m/capture" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600"><ChevronLeft className="h-5 w-5" /></Link><div><h1 className="text-xl font-semibold text-slate-950">登记已经购买</h1><p className="text-xs text-slate-400">生成采购记录，但不会直接增加库存</p></div></header><section className="mt-7"><MobileCaptureForm mode="purchase" /></section></main>;
}
