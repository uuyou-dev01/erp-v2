import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getMyNotifications } from "@/app/actions/notifications";
import { MobileNotificationList } from "@/components/mobile/mobile-notification-list";
import { requireMobilePageContext } from "@/lib/mobile/page-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MobileNotificationsPage() {
  const context = await requireMobilePageContext("/m/notifications");
  const [notifications, organization, store] = await Promise.all([
    getMyNotifications(),
    prisma.organization.findUniqueOrThrow({
      where: { id: context.organizationId },
      select: { name: true },
    }),
    prisma.store.findUniqueOrThrow({
      where: { id: context.activeStoreId },
      select: { name: true },
    }),
  ]);
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
          <h1 className="text-xl font-semibold text-slate-950">消息</h1>
          <p className="text-xs text-slate-400">
            {organization.name} · {store.name}
          </p>
        </div>
      </header>
      <p className="mt-2 text-xs text-slate-400">指派、完成与异常提醒</p>
      <div className="mt-1">
        <MobileNotificationList notifications={notifications} />
      </div>
    </main>
  );
}
