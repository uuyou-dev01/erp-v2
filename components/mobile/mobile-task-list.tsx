import Link from "next/link";
import { ArrowUpRight, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MobileTaskSummary } from "@/lib/mobile/tasks";

function relativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "刚刚";
  if (hours < 24) return `等待 ${hours} 小时`;
  return `等待 ${Math.floor(hours / 24)} 天`;
}

function dueLabel(task: MobileTaskSummary) {
  if (task.overdue) return "已超时";
  if (!task.dueAt) return relativeTime(task.waitingSince);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(task.dueAt));
}

export function MobileTaskList({ tasks }: { tasks: MobileTaskSummary[] }) {
  if (tasks.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm font-medium text-slate-700">暂时没有需要处理的事项</p>
        <p className="mt-1 text-xs text-slate-400">新任务会出现在这里</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {tasks.map((task) => (
        <Link
          key={task.id}
          href={`/m/tasks/${encodeURIComponent(task.id)}`}
          className="group grid grid-cols-[4px_1fr_auto] gap-3 py-4 active:bg-slate-50"
        >
          <span
            className={cn(
              "my-1 rounded-full bg-slate-200",
              task.overdue && "bg-amber-500",
              task.priority === "critical" && "bg-rose-500",
              task.priority === "warning" && !task.overdue && "bg-blue-500"
            )}
          />
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                {task.primaryActionLabel}
              </span>
              {!task.mobileEnabled ? (
                <span className="text-[10px] text-slate-400">PC 处理</span>
              ) : null}
            </span>
            <span className="mt-1 block line-clamp-2 text-[15px] font-semibold leading-5 text-slate-900">
              {task.title}
            </span>
            {task.subtitle ? (
              <span className="mt-1 block truncate text-xs text-slate-500">{task.subtitle}</span>
            ) : null}
            <span
              className={cn(
                "mt-2 inline-flex items-center gap-1 text-[11px] text-slate-400",
                task.overdue && "font-medium text-amber-700"
              )}
            >
              <Clock3 className="h-3 w-3" />
              {dueLabel(task)}
              {task.assignedToName ? ` · ${task.assignedToName}` : " · 待领取"}
            </span>
          </span>
          <span className="flex items-center self-center text-slate-300 transition group-active:text-blue-600">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </Link>
      ))}
    </div>
  );
}
