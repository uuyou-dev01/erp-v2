"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, Check, CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { markMyNotificationReadAction } from "@/app/actions/notifications";

interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  type: string;
  readAt: string | null;
  resolvedAt: string | null;
  resolutionCode: string | null;
  createdAt: string;
  refType: string | null;
  refId: string | null;
  actionUrl: string | null;
  organizationName: string;
}

const TYPE_LABELS: Record<string, string> = {
  TASK_ASSIGNED: "任务指派",
  TASK_DONE: "任务完成",
  LOCATION_ACCESS_ADDED: "仓库授权",
  ORGANIZATION_CONNECTION_REQUEST: "企业连接",
};

const RESOLUTION_LABELS: Record<string, string> = {
  INFORMATIONAL: "结果通知",
  TASK_STARTED: "已领取并开始处理",
  TASK_COMPLETED: "已完成",
  TASK_CANCELLED: "已取消",
  TASK_REASSIGNED: "已改派",
  CONNECTION_ACCEPTED: "已接受",
  CONNECTION_REJECTED: "已拒绝",
  CONNECTION_ENDED: "连接已结束",
};

function notificationHref(notification: NotificationRow) {
  if (notification.actionUrl) return notification.actionUrl;
  if (notification.refType === "CUSTOMER_ORDER" && notification.refId) {
    return `/sales/${notification.refId}`;
  }
  if (notification.refType === "LISTING" && notification.refId) {
    return `/listing/${notification.refId}`;
  }
  return "/workbench";
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function NotificationList({ notifications }: { notifications: NotificationRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notificationError, setNotificationError] = useState<string | null>(null);

  if (notifications.length === 0) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center rounded-lg border bg-card text-center">
        <Bell className="h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">暂无通知</p>
        <p className="mt-1 text-xs text-muted-foreground">任务指派和完成提醒会显示在这里。</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {notificationError ? (
        <div
          role="alert"
          className="flex gap-2 border-b border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{notificationError}</p>
        </div>
      ) : null}
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`flex items-start gap-3 border-b px-4 py-3 last:border-b-0 ${
            notification.resolvedAt ? "bg-muted/20" : ""
          }`}
        >
          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background">
            {notification.resolvedAt ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <Bell className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {notification.resolvedAt ? (
                <p className="font-medium">{notification.title}</p>
              ) : (
                <Link href={notificationHref(notification)} className="font-medium hover:underline">
                  {notification.title}
                </Link>
              )}
              {!notification.readAt && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  未读
                </Badge>
              )}
              <Badge variant={notification.resolvedAt ? "outline" : "secondary"}>
                {notification.resolvedAt
                  ? (RESOLUTION_LABELS[notification.resolutionCode ?? ""] ?? "已处理")
                  : "待处理"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {dateLabel(notification.createdAt)}
              </span>
            </div>
            {notification.body ? (
              <p className="mt-1 text-sm text-muted-foreground">{notification.body}</p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              {notification.organizationName} ·{" "}
              {TYPE_LABELS[notification.type] ?? notification.type}
            </p>
            {notification.resolvedAt && notification.actionUrl ? (
              <Link
                href={notificationHref(notification)}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                查看相关记录
                <ExternalLink className="h-3 w-3" />
              </Link>
            ) : null}
          </div>
          {!notification.readAt && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={pending}
              aria-label={`将“${notification.title}”标记为已读`}
              onClick={() => {
                setNotificationError(null);
                startTransition(async () => {
                  try {
                    const result = await markMyNotificationReadAction(notification.id);
                    if (!result.success) {
                      setNotificationError(result.error);
                      return;
                    }
                    router.refresh();
                  } catch (error) {
                    setNotificationError(
                      error instanceof Error ? error.message : "标记通知已读失败，请重试"
                    );
                  }
                });
              }}
            >
              <Check className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
