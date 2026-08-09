"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ClipboardCheck, Plus, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/m", label: "今天", icon: ClipboardCheck, exact: true },
  { href: "/m/tasks", label: "待办", icon: ClipboardCheck },
  { href: "/m/capture", label: "采集", icon: Plus, primary: true },
  { href: "/m/notifications", label: "消息", icon: Bell },
  { href: "/m/me", label: "我的", icon: UserRound },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[520px] border-t border-slate-200/80 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5 backdrop-blur-xl">
      <div className="grid grid-cols-5">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium transition",
                active ? "text-blue-700" : "text-slate-400",
                item.primary && "-mt-5"
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-lg",
                  item.primary && "h-11 w-11 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/25",
                  active && !item.primary && "bg-blue-50"
                )}
              >
                <Icon className={cn("h-[18px] w-[18px]", item.primary && "h-5 w-5")} />
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
