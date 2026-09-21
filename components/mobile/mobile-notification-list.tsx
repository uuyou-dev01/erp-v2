"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NotificationItem {
  id: string;
  taskId: string | null;
  title: string;
  body: string | null;
  readAt: Date | null;
  createdAt: Date;
}

function target(notification: NotificationItem) {
  if (notification.taskId) {
    return `/m/tasks/${encodeURIComponent(notification.taskId)}`;
  }
  return `/notifications/open/${encodeURIComponent(notification.id)}`;
}

export function MobileNotificationList({ notifications }: { notifications: NotificationItem[] }) {
  const router = useRouter();
  const [view, setView] = useState("all");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const visible = notifications.filter(
    (item) => view === "all" || (view === "unread" ? !item.readAt : Boolean(item.readAt))
  );
  const markRead = (id: string) =>
    fetch(`/api/v1/mobile/notifications/${id}/read`, { method: "POST" });
  if (!notifications.length)
    return <div className="py-20 text-center text-sm text-slate-400">暂无消息</div>;
  return (
    <>
      <div className="flex gap-2 py-3" aria-label="消息筛选">
        {[
          ["all", "全部"],
          ["unread", "未读"],
          ["read", "已读"],
        ].map(([value, label]) => (
          <Button
            key={value}
            variant={view === value ? "default" : "outline"}
            aria-pressed={view === value}
            onClick={() => setView(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex justify-end py-3">
        <Button
          type="button"
          variant="ghost"
          className="h-8 rounded-lg px-2 text-xs text-slate-500"
          disabled={pending || !notifications.some((item) => !item.readAt)}
          onClick={async () => {
            setPending(true);
            setError("");
            try {
              const response = await fetch("/api/v1/mobile/notifications/read-all", {
                method: "POST",
              });
              if (!response.ok) throw new Error("标记已读失败，请重试");
              router.refresh();
            } catch {
              setError("标记已读失败，请重试");
            } finally {
              setPending(false);
            }
          }}
        >
          <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
          全部已读
        </Button>
      </div>
      <div className="divide-y divide-slate-100">
        {!visible.length && (
          <p className="py-12 text-center text-sm text-slate-500">此分类暂无消息</p>
        )}
        {visible.map((item) => (
          <Link
            key={item.id}
            href={target(item)}
            prefetch={false}
            onClick={async (event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              setError("");
              try {
                const response = await markRead(item.id);
                if (!response.ok) throw new Error();
                router.push(target(item));
              } catch {
                setError("打开消息失败，请重试");
              }
            }}
            className={`grid grid-cols-[36px_1fr] gap-3 border-l-[3px] px-3 py-4 ${item.readAt ? "border-l-transparent" : "border-l-blue-600 bg-blue-50"}`}
          >
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full ${item.readAt ? "bg-slate-100 text-slate-400" : "bg-blue-600 text-white"}`}
            >
              <Bell className="h-4 w-4" />
            </span>
            <span>
              <span className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">{item.title}</span>
                {!item.readAt ? <i className="h-1.5 w-1.5 rounded-full bg-blue-600" /> : null}
              </span>
              {item.body ? (
                <span className="mt-1 block text-xs leading-5 text-slate-500">{item.body}</span>
              ) : null}
              <span className="mt-1 block text-[10px] text-slate-400">
                {new Intl.DateTimeFormat("zh-CN", {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(item.createdAt)}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
