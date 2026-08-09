import Link from "next/link";
import { Camera, ChevronLeft, MapPin, Search } from "lucide-react";
import { ProductImage } from "@/components/ui/product-image";
import { requireMobilePageContext } from "@/lib/mobile/page-auth";
import { listMobileItemUnitPhotoTargets } from "@/lib/mobile/item-unit-photos";
import { formatItemUnitCondition } from "@/lib/inventory/item-unit-display";

export const dynamic = "force-dynamic";

export default async function MobileItemPhotoListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const context = await requireMobilePageContext("/m/items");
  const { q = "" } = await searchParams;
  const items = await listMobileItemUnitPhotoTargets(q, context);

  return (
    <main className="px-5 pb-8 pt-[max(env(safe-area-inset-top),1rem)]">
      <header className="flex items-center gap-3 py-2">
        <Link
          href="/m/capture"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-slate-950">单件拍照</h1>
          <p className="text-xs text-slate-400">选择实物，照片会同步到库存档案</p>
        </div>
      </header>

      <form action="/m/items" className="relative mt-5">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
        <input
          name="q"
          defaultValue={q}
          placeholder="搜索商品名、SKU 或标签"
          className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-blue-400 focus:bg-white"
        />
      </form>

      <section className="mt-5 divide-y divide-slate-100 border-y border-slate-200">
        {items.length > 0 ? (
          items.map((item) => (
            <Link
              key={item.id}
              href={`/m/items/${item.id}/photos`}
              className="flex items-center gap-3 py-3.5 active:bg-slate-50"
            >
              <ProductImage
                src={item.coverUrl}
                alt={item.sku.name}
                size="lg"
                className="h-14 w-14 shrink-0 rounded-xl"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{item.sku.name}</p>
                <p className="mt-1 truncate text-[11px] text-slate-400">
                  {item.sku.code}
                  {item.conditionGrade ? ` · ${formatItemUnitCondition(item.conditionGrade)}` : ""}
                </p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                  <MapPin className="h-3 w-3" />
                  {item.location.name}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <Camera className="ml-auto h-4 w-4 text-blue-600" />
                <p className="mt-1 text-[10px] text-slate-400">{item.photoCount} 张</p>
              </div>
            </Link>
          ))
        ) : (
          <p className="py-16 text-center text-sm text-slate-400">
            {q ? "没有匹配的单件" : "暂无可拍照的单件"}
          </p>
        )}
      </section>
    </main>
  );
}
