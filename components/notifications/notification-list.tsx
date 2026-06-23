"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { markMyNotificationReadAction } from "@/app/actions/notifications";

interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  type: string;
  readAt: string | null;
  createdAt: string;
  refType: string | null;
  refId: string | null;
}

function notificationHref(notification: NotificationRow) {
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
          className="flex items-start gap-3 border-b px-4 py-3 last:border-b-0"
        >
          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background">
            <Bell className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={notificationHref(notification)} className="font-medium hover:underline">
                {notification.title}
              </Link>
              {!notification.readAt && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">未读</Badge>
              )}
              <span className="text-xs text-muted-foreground">{dateLabel(notification.createdAt)}</span>
            </div>
            {notification.body ? (
              <p className="mt-1 text-sm text-muted-foreground">{notification.body}</p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">{notification.type}</p>
          </div>
          {!notification.readAt && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={pending}
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
