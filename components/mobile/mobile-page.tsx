import Link from "next/link";
import { ChevronLeft } from "lucide-react";
export function MobilePage({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="space-y-5 px-5 pb-8 pt-[max(env(safe-area-inset-top),1.25rem)]">
      <header className="flex items-start gap-3">
        <Link
          href="/m"
          aria-label="返回今天"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="break-words text-xl font-semibold text-slate-950">{title}</h1>
          {description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
        </div>
      </header>
      {children}
    </main>
  );
}
export function MobileEntry({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="block rounded-xl border border-slate-200 p-4 active:bg-blue-50">
      <span className="block text-sm font-semibold text-slate-950">{title} →</span>
      <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
    </Link>
  );
}
