"use client";

import Link from "next/link";
import { Handshake, ListTodo, PackageSearch } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function PersonalWorkspaceNav({ hasManagedWarehouse }: { hasManagedWarehouse: boolean }) {
  const pathname = usePathname();
  const items = [
    { href: "/collaboration/tasks", label: "我的任务", icon: ListTodo },
    ...(hasManagedWarehouse
      ? [{ href: "/collaboration/inventory", label: "仓库库存", icon: PackageSearch }]
      : []),
    { href: "/collaboration/relationships", label: "合作关系", icon: Handshake },
  ];

  return (
    <nav className="flex min-w-max items-center gap-1 py-2" aria-label="个人协作导航">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              active &&
                "bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
