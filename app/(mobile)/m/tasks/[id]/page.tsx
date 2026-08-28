import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ChevronLeft, ExternalLink, MapPin } from "lucide-react";
import { getMobileTask, getMobileTaskReceipt } from "@/lib/mobile/tasks";
import { MobileActionForm } from "@/components/mobile/mobile-action-form";
import { MobileTaskAssignment } from "@/components/mobile/mobile-task-assignment";
import { requireMobilePageContext } from "@/lib/mobile/page-auth";

export const dynamic = "force-dynamic";

export default async function MobileTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireMobilePageContext("/m/tasks");
  const { id } = await params;
  const task = await getMobileTask(decodeURIComponent(id));
  if (!task) {
    const receipt = await getMobileTaskReceipt(decodeURIComponent(id));
    if (!receipt) notFound();
    return (
      <main className="px-5 pb-8 pt-[max(env(safe-area-inset-top),1rem)]">
        <header className="flex items-center gap-3 py-2">
          <Link
            href="/m/tasks?scope=completed"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-600">
            {receipt.status === "DONE" ? "已完成" : "已取消"}
          </span>
        </header>
        <section className="pt-12 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-8 w-8" />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">
            {receipt.title}
          </h1>
          {receipt.description ? (
            <p className="mt-2 text-sm leading-6 text-slate-500">{receipt.description}</p>
          ) : null}
          <div className="mt-8 rounded-2xl bg-slate-50 p-4 text-left text-sm">
            <div className="flex justify-between py-2">
              <span className="text-slate-400">执行人</span>
              <span className="font-medium text-slate-800">
                {receipt.completerName || receipt.assigneeName || "未记录"}
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-400">完成时间</span>
              <span className="font-medium text-slate-800">
                {receipt.completedAt
                  ? new Intl.DateTimeFormat("zh-CN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(receipt.completedAt)
                  : "未记录"}
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-400">委托人</span>
              <span className="font-medium text-slate-800">{receipt.creatorName}</span>
            </div>
          </div>
        </section>
      </main>
    );
  }
  return (
    <main className="px-5 pb-8 pt-[max(env(safe-area-inset-top),1rem)]">
      <header className="flex items-center justify-between py-2">
        <Link
          href="/m/tasks"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-600">
          {task.summary.currentStatusLabel}
        </span>
      </header>

      <section className="pb-6 pt-5">
        <p className="text-xs font-semibold text-slate-400">{task.summary.primaryActionLabel}</p>
        <h1 className="mt-2 text-[25px] font-semibold leading-8 tracking-[-0.03em] text-slate-950">
          {task.summary.title}
        </h1>
        {task.summary.subtitle ? (
          <p className="mt-2 text-sm leading-5 text-slate-500">{task.summary.subtitle}</p>
        ) : null}
        <div className="mt-5 flex items-center gap-4 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {task.detail.actionContext.currentLocationText ||
              task.detail.actionContext.location ||
              "位置待确认"}
          </span>
          {task.summary.detailHref ? (
            <Link href={task.summary.detailHref} className="inline-flex items-center gap-1">
              PC 详情 <ExternalLink className="h-3 w-3" />
            </Link>
          ) : null}
        </div>
      </section>

      {task.detail.lineItems?.length ? (
        <section className="border-y border-slate-200 py-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            核对商品
          </p>
          <div className="space-y-3">
            {task.detail.lineItems.map((line) => (
              <div key={line.id} className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">{line.title}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{line.skuCode || "未标 SKU"}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-slate-900">
                  × {line.quantity || "1"}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="pt-6">
        <MobileTaskAssignment
          workItemId={task.summary.id}
          assignedToId={task.summary.assignedToId}
          assignedToName={task.summary.assignedToName}
          currentUserId={context.userId}
          taskStatus={task.taskStatus}
          members={task.members}
        />
        <MobileActionForm task={task} />
      </section>
    </main>
  );
}
