"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Bell, Menu, Search, User } from "lucide-react";
import { getMyNotificationSummary } from "@/app/actions/notifications";
import { cn } from "@/lib/utils";

interface HeaderProps {
  onMenuClick?: () => void;
  onCommandOpen?: () => void;
}

export function Header({ onMenuClick, onCommandOpen }: HeaderProps) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getMyNotificationSummary()
      .then((summary) => {
        if (!cancelled) setUnreadCount(summary.unreadCount);
      })
      .catch(() => {
        if (!cancelled) setUnreadCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header className="relative z-50 flex h-12 shrink-0 items-center gap-4 border-b bg-background px-4">
      <button
        type="button"
        onClick={onMenuClick}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground md:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={onCommandOpen}
        className="relative hidden h-8 max-w-md flex-1 items-center rounded-md border bg-muted/40 text-left text-sm text-muted-foreground md:flex"
      >
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <span className="pl-8">搜索商品、订单、物流单号...</span>
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 select-none rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-block">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">
        <Link
          href="/notifications"
          aria-label="通知"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
            "relative h-8 w-8 text-muted-foreground"
          )}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Link>
        <Link
          href="/login"
          aria-label="切换操作人"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
            "h-8 w-8 text-muted-foreground"
          )}
        >
          <User className="h-4 w-4" />
        </Link>
      </div>
    </header>
  );
}
