import Link from "next/link";
import { Camera, ChevronLeft, Eye, ShoppingBag } from "lucide-react";
import { requireMobilePageContext } from "@/lib/mobile/page-auth";

export default async function MobileCapturePage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  await requireMobilePageContext("/m/capture");
  const { intent } = await searchParams;
  return (
    <main className="px-5 pb-8 pt-[max(env(safe-area-inset-top),1rem)]">
      <header className="flex items-center gap-3 py-2">
        <Link
          href="/m"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-slate-950">快速采集</h1>
          <p className="text-xs text-slate-400">先留下事实，再进入正式流程</p>
        </div>
      </header>
      <section className="mt-8 space-y-3">
        <Link
          href="/m/capture/price"
          className={`flex items-center gap-4 rounded-2xl border p-4 ${intent === "price" ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
            <Eye className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-slate-900">记录市场价格</span>
            <span className="mt-1 block text-xs text-slate-500">看到但还没有购买</span>
          </span>
        </Link>
        <Link
          href="/m/capture/purchase"
          className={`flex items-center gap-4 rounded-2xl border p-4 ${intent === "purchase" ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200"}`}
        >
          <span
            className={`flex h-11 w-11 items-center justify-center rounded-xl ${intent === "purchase" ? "bg-white/10 text-blue-300" : "bg-slate-100 text-slate-700"}`}
          >
            <ShoppingBag className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold">登记已经购买</span>
            <span
              className={`mt-1 block text-xs ${intent === "purchase" ? "text-slate-400" : "text-slate-500"}`}
            >
              进入采购与在途流程
            </span>
          </span>
        </Link>
        <Link
          href="/m/items"
          className="flex items-center gap-4 rounded-2xl border border-slate-200 p-4 active:bg-slate-50"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <Camera className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-slate-900">拍摄单件商品</span>
            <span className="mt-1 block text-xs text-slate-500">照片直接同步到单件库存档案</span>
          </span>
        </Link>
      </section>
    </main>
  );
}
