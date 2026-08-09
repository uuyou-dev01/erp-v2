"use client";

import Link from "next/link";
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
  return notification.taskId ? `/m/tasks/${encodeURIComponent(notification.taskId)}` : "/m/tasks";
}

export function MobileNotificationList({ notifications }: { notifications: NotificationItem[] }) {
  const router = useRouter();
  const markRead = (id: string) => fetch(`/api/v1/mobile/notifications/${id}/read`, { method: "POST" });
  if (!notifications.length) return <div className="py-20 text-center text-sm text-slate-400">暂无消息</div>;
  return <><div className="flex justify-end py-3"><Button type="button" variant="ghost" className="h-8 rounded-lg px-2 text-xs text-slate-500" onClick={async () => { await fetch("/api/v1/mobile/notifications/read-all", { method: "POST" }); router.refresh(); }}><CheckCheck className="mr-1.5 h-3.5 w-3.5" />全部已读</Button></div><div className="divide-y divide-slate-100">{notifications.map((item) => <Link key={item.id} href={target(item)} onClick={() => { void markRead(item.id); }} className="grid grid-cols-[36px_1fr] gap-3 py-4"><span className={`flex h-9 w-9 items-center justify-center rounded-full ${item.readAt ? "bg-slate-100 text-slate-400" : "bg-blue-50 text-blue-600"}`}><Bell className="h-4 w-4" /></span><span><span className="flex items-center gap-2"><span className="text-sm font-semibold text-slate-900">{item.title}</span>{!item.readAt ? <i className="h-1.5 w-1.5 rounded-full bg-blue-600" /> : null}</span>{item.body ? <span className="mt-1 block text-xs leading-5 text-slate-500">{item.body}</span> : null}<span className="mt-1 block text-[10px] text-slate-400">{new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(item.createdAt)}</span></span></Link>)}</div></>;
}
