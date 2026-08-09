import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, MapPin } from "lucide-react";
import { MobileItemPhotoCapture } from "@/components/mobile/mobile-item-photo-capture";
import { requireMobilePageContext } from "@/lib/mobile/page-auth";
import { getMobileItemUnitPhotoTarget, MAX_ITEM_UNIT_PHOTOS } from "@/lib/mobile/item-unit-photos";
import { formatItemUnitCondition } from "@/lib/inventory/item-unit-display";

export const dynamic = "force-dynamic";

export default async function MobileItemPhotoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await requireMobilePageContext(`/m/items/${id}/photos`);
  const item = await getMobileItemUnitPhotoTarget(id, context);
  if (!item) notFound();

  return (
    <main className="px-5 pb-8 pt-[max(env(safe-area-inset-top),1rem)]">
      <header className="flex items-start gap-3 py-2">
        <Link
          href="/m/items"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-slate-950">{item.sku.name}</h1>
          <p className="mt-1 truncate text-xs text-slate-400">
            SKU {item.sku.code}
            {item.conditionGrade ? ` · ${formatItemUnitCondition(item.conditionGrade)}` : ""}
          </p>
          <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
            <MapPin className="h-3.5 w-3.5" />
            {item.location.name} · {item.location.code}
          </p>
        </div>
      </header>

      <section className="mt-7">
        <MobileItemPhotoCapture
          itemUnitId={item.id}
          itemName={item.sku.name}
          initialPhotos={item.photos}
          maxPhotos={MAX_ITEM_UNIT_PHOTOS}
        />
      </section>
    </main>
  );
}
