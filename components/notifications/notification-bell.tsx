"use client";
import Link from "next/link";
import { useState } from "react";
import { Bell } from "lucide-react";
import { getMyNotificationSummary } from "@/app/actions/notifications";
import { useVisibleRefresh } from "./use-visible-refresh";
export function NotificationBell({ href = "/notifications" }: { href?: string }) {
  const [count, setCount] = useState(0);
  useVisibleRefresh(async () => {
    try {
      setCount((await getMyNotificationSummary()).unreadCount);
    } catch {
      /* Retain last known count during connectivity loss. */
    }
  });
  return (
    <Link
      href={href}
      aria-label={count ? `通知，${count} 条未读` : "通知"}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
    >
      <Bell className="h-4 w-4" />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 rounded-full bg-destructive px-1.5 text-[10px] text-destructive-foreground">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
