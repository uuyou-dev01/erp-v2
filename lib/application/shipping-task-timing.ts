const LONG_RUNNING_THRESHOLD_MS = 20 * 60 * 60 * 1000;

export type ShippingTaskTiming = {
  targetAt: string;
  scheduleLabel: string;
  urgencyLabel: string;
  createdLabel: string;
  tone: "normal" | "warning" | "overdue" | "completed";
  isSuggestedTarget: boolean;
};

function validDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTaskDate(date: Date, now: Date) {
  const includeYear = date.getFullYear() !== now.getFullYear();
  return new Intl.DateTimeFormat("zh-CN", {
    ...(includeYear ? { year: "numeric" as const } : {}),
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDuration(milliseconds: number) {
  const minutes = Math.max(1, Math.floor(Math.max(0, milliseconds) / (60 * 1000)));
  if (minutes < 60) return `${minutes} 分钟`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return `${hours} 小时${remainingMinutes ? ` ${remainingMinutes} 分钟` : ""}`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days} 天${remainingHours ? ` ${remainingHours} 小时` : ""}`;
}

export function getShippingTaskTiming(input: {
  createdAt: string;
  dueAt?: string | null;
  completedAt?: string | null;
  status?: string | null;
  now?: Date;
}): ShippingTaskTiming {
  const now = input.now ?? new Date();
  const createdAt = validDate(input.createdAt) ?? now;
  const completedAt = validDate(input.completedAt);
  const isCompleted = input.status === "DONE" || Boolean(completedAt);
  const elapsedUntil = completedAt ?? now;
  const elapsed = Math.max(0, elapsedUntil.getTime() - createdAt.getTime());
  const isLongRunning = !isCompleted && elapsed >= LONG_RUNNING_THRESHOLD_MS;

  return {
    // Keep this field as a stable timestamp for existing consumers. The UI no
    // longer invents a 24-hour deadline or counts down toward it.
    targetAt: createdAt.toISOString(),
    scheduleLabel: isCompleted ? "任务已完成" : `任务于 ${formatTaskDate(createdAt, now)} 发起`,
    urgencyLabel: isCompleted
      ? `共用时 ${formatDuration(elapsed)}`
      : `已进行 ${formatDuration(elapsed)}`,
    createdLabel:
      isCompleted && completedAt
        ? `${formatTaskDate(completedAt, now)} 完成`
        : "超过 20 小时未完成时标红提醒",
    tone: isCompleted ? "completed" : isLongRunning ? "overdue" : "normal",
    isSuggestedTarget: false,
  };
}
